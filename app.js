const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const Block = require("./classes/Block");
const Transaction = require("./classes/Transaction");
const Output = require("./classes/Output");
const Input = require("./classes/Input");
const getRawBody = require('raw-body');
const axios = require('axios')

const app = express();

app.use (bodyParser.urlencoded({extended : true}));
app.use (bodyParser.json());

app.use((req, res, next) => {
    if (req.headers['content-type'] === 'application/octet-stream') 
    {
        getRawBody(req, {
            length: req.headers['content-length'],
            encoding: req.charset
        }, function (err, string) {
            if (err)
                return next(err);

            req.body = string;
            next();
         })
    }
    else 
        next();
});

// functions for various blockchain processes
blocks = 0;

const peerLim = 4;
const me = "http://localhost:8000";
let myPeers = [];
let knownNodes = ["http://localhost:7000", "http://localhost:9000", "asd"];
let pendingTxns = [];
let unusedOutputs = new Map();

function readInt(str, start, end)
{
    let size = end - start;
    if(size === 4)
    {
        let ans = 0;
        for(let i = 0; i < size; ++i)
        {
            ans = ans << 8;
            ans += str[i + start];
        }
        return ans;
    }

    else
    {
        let ans = 0n;
        for (let i = 0; i < size; ++i)
        {
            ans = ans * 256n;
            ans += BigInt(str[i+start])
        }
        return ans;
    }
}

function readTxn(str)
{
    let start = 0;
    let txn = new Transaction;
    txn.numInputs = readInt(str, start, start + 4);
    start += 4;
    for (let i = 0; i < txn.numInputs; ++i)
    {
        let input = new Input;
        input.txnID = str.toString("hex", start, start + 32);
        start += 32;
        input.index = readInt(str, start, start + 4);
        start += 4;
        input.sigLength = readInt(str, start, start + 4);
        start += 4;
        input.sig = str.toString("hex", start, start + input.sigLength);
        start += input.sigLength;
        txn.pushInputs(input);
    }

    txn.numOutputs = readInt(str, start, start + 4);
    start += 4;
    
    for (let i = 0; i < txn.numOutputs; ++i)
    {
        let output = new Output;
        output.coins = readInt(str, start, start + 8);
        start += 8;
        output.pubKeyLen = readInt(str, start, start + 4);
        start += 4;
        output.pubKey = str.toString("utf-8", start, start + output.pubKeyLen);
        start += output.pubKeyLen;
        txn.pushOutputs(output);
    }

    return txn;
}

function processBlock(block)
{
    let start = 0;
    let numTxns =  readInt(block, start, start + 4);
    start += 4;

    for(let i = 0; i < numTxns; ++i)
    {
        let size = readInt(block, start, start + 4);
        start += 4;
        
        let tx = block.subarray(start, start + size);
        
        let txn = readTxn(tx);

        let txnID = crypto.createHash('sha256').update(tx).digest('hex');

        start += size;
        let ind = pendingTxns.indexOf(txn);
        if (ind > -1)
            arr.splice(ind, 1);
        let inputs = txn.getInputs();
        for (let input of inputs)
        {
            let val = [input.txnID, input.index];
            unusedOutputs.delete(val);
        }
        let outputs = txn.getOutputs();

        let numOutputs = txn.numOutputs;

        for(let i = 0; i < numOutputs; ++i)
        {
            let val = [txnID, i];
            unusedOutputs.set(val, outputs[i]);
        }
    }
}

while(1)
{
    try {
        block = fs.readFileSync(`Blocks/${blocks}.dat`);
        processBlock(block);
    } catch (err) {
        console.log(blocks);
        break;
    }
    ++blocks;
}

async function getNewBlock (url) {
    console.log(blocks);
    axios.get (url + "/getBlock/" + blocks, {
            headers: {
                "Content-Type": "application/octet-stream"
            }
        }).then (res => {
            let block = res.data;
            block = Buffer.from(block)
            fs.writeFileSync(`Blocks/${blocks}.dat`,block);
            processBlock(block);
            ++blocks;
            getNewBlock(url);
        }).catch (err => {
            console.log("Got all blocks!");
        });
}

async function getNewPeers(url)
{
    axios.post(url + "/newPeer", {
    "url" : me
    }).then( res => {
        if(res.status === 200)
        {
            myPeers.push(url);
            console.log(url + " Added as peer");
        }
    }).catch( err => {
        axios.get (url + '/getPeers').then(res => {
            let peers = res.data.peers;
            console.log(peers);
            if(myPeers.length <= peerLim/2)
                for(let peer of peers)
                {
                    if(myPeers.indexOf(peer) === -1)
                        getNewPeers(peer);
                }
        }).catch(err => {
            console.log("Invalid URL");
        });
    });
}

function buildPendingTxns(temp)
{
    let txn = new Transaction;
    txn.numInputs = temp["inputs"].length;
    for (let inp of temp["inputs"])
    {
        let input = new Input;
        input.txnID = inp["transactionID"];
        input.index = inp["index"];
        input.sigLength = inp["signature"].length;
        input.sig = inp["signature"];

        txn.pushInputs(input);
    }

    txn.numOutputs = temp["outputs"].length;
    for (let out of temp["outputs"])
    {
        let output = new Output;
        output.coins = out["amount"];
        output.pubKeyLen = out["recipient"].length;
        output.pubKey = out["recipient"];

        txn.pushOutputs(output);
    }
    console.log(txn);
    if(pendingTxns.indexOf(txn) === -1)
        pendingTxns.push(txn);
    else
        console.log("Txn already in pending Txns");
}

function getPendingTxns(url)
{
    axios.get(url + '/getPendingTransactions').then(res => {
        let txns = res.data;
        for (let temp of txns)
            buildPendingTxns(temp);
        
        console.log(pendingTxns);
    })
}

function getData()
{
    if(myPeers.length !== 0)
    {
        console.log("Total peers: " + myPeers.length);
        console.log(myPeers);
        peer = myPeers[0];
        getNewBlock(peer);
        getPendingTxns(peer);
    }
    else
        console.log("No Peers! :(")
}

function init() 
{
    knownNodes.forEach((url) => {
        console.log(url);
        if (myPeers.length <= peerLim/2)
            getNewPeers(url);
    });

    setTimeout (() => {
        getData();    
    }, 5000);
}

// End points 

app.get ('/getBlock/:num', (req, res) => {
    const n = req.params.num;
    const data = fs.readFileSync(`Blocks/${n}.dat`);
    res.set('Content-Type', 'application/octet-stream');
    console.log("Sent Block " + n);
    res.send(data);
});

app.get ('/getPendingTransactions', (req, res) => {
    let ret = [];
    for(let txn of pendingTxns)
    {
        let inputs = txn.getInputs();
        let outputs = txn.getOutputs();
        let inp = [];
        let out = [];
        for(let input of inputs)
        {
            let vals = {};
            vals["transactionID"] = input.txnID;
            vals["index"] = input.index;
            vals["signature"] = input.sig;

            inp.push(vals);
        }
        
        for(let output of outputs)
        {
            let vals = {};
            vals["amount"] = output.coins;
            vals["recipient"] = output.pubKey;

            out.push(vals);
        }

        let temp = {};
        temp["inputs"] = inp;
        temp["outputs"] = out;

        ret.push(temp);
    }
    res.set('Content-Type', 'application/json');
    res.send(ret);
});

app.post('/newPeer', (req, res) => {

    url = req.body.url;
    if(myPeers.indexOf(url) != -1)
        res.status(500).send("Peer Already Present");
    else if(myPeers.length == peerLim)
        res.status(500).send("Peer Limit reached, send a request to /getPeers to have other potential peers");
    else
    {
        myPeers.push(url);
        console.log(url + " Added as Peer on request");
        res.send("Peer Added");
    }
});

app.get('/getPeers', (req,res) => {
    let obj = {"peers" : myPeers};
    obj = JSON.stringify(obj);
    res.send(obj);
});

app.post('/newBlock', (req, res) => {
    let data = req.body;
    console.log(blocks);
    fs.writeFileSync(`Blocks/${blocks}.dat`,data);
    ++blocks;
    
    res.send("Block Added");
});

app.post('/newTransaction', (req, res) => {
    let temp = req.body;
    buildPendingTxns(temp);
    res.send("Added to pending Txns");
});

app.listen (8000, () => {
    console.log("Listening on port 8000");
});

init();


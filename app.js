const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const Transaction = require("./classes/Transaction");
const Output = require("./classes/Output");
const getRawBody = require('raw-body');
const axios = require('axios');
const { Worker } = require('worker_threads');
const { cloneDeep } = require('lodash');
const { deepStrictEqual } = require('assert');
const {
    pushInt,
    readInt
} = require('./utils/basicUtils');
const {
    verifyTxn,
    verifyBlock
} = require('./utils/verificationUtils');
const {
    readTxn,
    transactionBuffer,
    buildPendingTxns
} = require('./utils/txnUtils');

let worker = new Worker('./mine.js');

const app = express();

// Some settings to use

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

//Vars from config file
const env = JSON.parse(fs.readFileSync('./config.json'));

const me = env["me"];
let knownNodes = env["knownNodes"];
let blockReward = BigInt(env["blockReward"]);
const myKey = fs.readFileSync(env["pubKeyPath"]);
const target = env["target"];

// Global Variables

let blocks = 0;

const peerLim = 4;
let myPeers = [];
let pendingTxns = [];
let unusedOutputs = {};
let keys = new Map();
let userOutputs = new Map();
let curBlock = undefined;

/*****  BLOCK UTILS ***** */

function processBlock(block)
{
    let start = 116;
    let numTxns =  readInt(block, start, start + 4);
    start += 4;
    for(let i = 0; i < numTxns; ++i)
    {
        let size = readInt(block, start, start + 4);
        start += 4;
        let tx = block.subarray(start, start + size);
        let txn = readTxn(tx);
        let txnId = crypto.createHash('sha256').update(tx).digest('hex');
        start += size;
        let ind = pendingTxns.findIndex(x => {
            try {
                deepStrictEqual(x,txn);
                return true;
            } catch (err)
            {
                return false;
            }
        });
        if (ind > -1)
        {
            pendingTxns.splice(ind, 1);
            console.log("A txn removed from pending txns");
        }
        let inputs = txn.getInputs();
        for (let input of inputs)
        {
            let val = [input.txnId, input.index];
            let obj = {};
            obj["transactionId"] = input.txnId;
            obj["index"] = input.index;
            obj["amount"] = unusedOutputs[val].coins.toString();
            userOutputs[unusedOutputs[val].pubKey].splice(userOutputs[unusedOutputs[val].pubKey].indexOf(obj), 1);
            delete unusedOutputs[val];
        }
        let outputs = txn.getOutputs();
        let numOutputs = txn.numOutputs;

        for(let i = 0; i < numOutputs; ++i)
        {
            let val = [txnId, i];
            unusedOutputs[val] = outputs[i];
            let obj = {};
            obj["transactionId"] = txnId;
            obj["index"] = i;
            obj["amount"] = outputs[i].coins.toString();
            if (outputs[i].pubKey in userOutputs)
                userOutputs[outputs[i].pubKey].push(obj);
            else
            {
                userOutputs[outputs[i].pubKey] = [];
                userOutputs[outputs[i].pubKey].push(obj);
            }
        }
    }
}

// process existing blockchain

while(1)
{
    try {
        block = fs.readFileSync(`Blocks/${blocks}.dat`);
        ret = verifyBlock(block, cloneDeep(unusedOutputs), blocks, target, blockReward);
        console.log(ret);
        if (ret === true)
            processBlock(block);
        else
            throw new Error("Verification failed");
    } catch (err) {
        console.log("Read all blocks on system ");
        console.log("Number of blocks: " + blocks);
        break;
    }
    ++blocks;
}

// Helper functions to initialize node
async function getNewBlock (url) {
    await axios.get (url + "/getBlock/" + blocks, {
            responseType: 'arraybuffer'
        }).then (async (res) => {
            let block = res.data;
            block = Buffer.from(block);
            let ret = verifyBlock(block, cloneDeep(unusedOutputs), blocks, target, blockReward);
            console.log(ret);
            if(ret === true)
            {
                fs.writeFileSync(`Blocks/${blocks}.dat`,block);
                console.log("Block saved to " + `Blocks/${blocks}.dat`);
                processBlock(block);
            }
            else
                throw new Error("Verification failed :(, block not added");
        });
}

async function getNewPeers(url)
{
    await axios.post(url + '/newPeer', {
    url : me
    }).then( res => {
        if(res.status === 200)
        {
            myPeers.push(url);
            console.log(url + " Added as peer");
        }
    }).catch( async (err) => {
        await axios.get (url + '/getPeers').then(res => {
            let peers = res.data.peers;
            console.log(peers);
            if(myPeers.length <= peerLim/2)
                for(let peer of peers)
                {
                    if(myPeers.indexOf(peer) === -1)
                        knownNodes.push(peer);
                }
        }).catch(err => {
            console.log("Invalid URL");
        });
    });
}


async function getPendingTxns(url)
{
    await axios.get(url + '/getPendingTransactions').then(res => {
        let txns = res.data;
        if(txns.length > 0)
        {
            for (let temp of txns)
            {
                let txn = buildPendingTxns(temp, pendingTxns);
                if(txn !== undefined)
                    pendingTxns.push(txn);
            }
        }
        console.log("Recd " + pendingTxns.length + " txns during init");
    })
}

async function getData()
{
    if(myPeers.length !== 0)
    {
        console.log("Total peers: " + myPeers.length);
        console.log(myPeers);
        peer = myPeers[0];
        while(1)
        {
            try{
                await getNewBlock(peer);
                ++blocks;
            }
            catch(err)
            {
                console.log("recd all verified blocks");
                break;
            }
        }
        await getPendingTxns(peer);
    }
    else
        console.log("No Peers! :(")
}

// Function to initialize node
async function init() 
{
    await knownNodes.forEach(async (url) => {
        console.log(url);
        if (myPeers.length <= peerLim/2)
            await getNewPeers(url);
    });

    setTimeout(async() =>  {
        await getData();
    }, 2000);

    setTimeout(() => {
        console.log(pendingTxns.length);
        if(pendingTxns.length > 0)
        {
            console.log("Mining via init");
            curBlock = blocks;
            mine();
        }
    }, 5000);
}

//Block mining functions:

function mine()
{
    let size = 116;
    let fees = 0n;
    let header = Buffer.alloc(100);
    let tempOutputs = cloneDeep(unusedOutputs);
    let numTxns = 1;
    for(let i = 0; i < pendingTxns.length; ++i)
    {
        if(verifyTxn(pendingTxns[i], tempOutputs) === true)
        {
            let tx = transactionBuffer(pendingTxns[i]);
            size += tx.length;
            if(size > 1000116)
                break;

            let inputs = pendingTxns[i].getInputs();
            for (let input of inputs)
            {
                let val = [input.txnId, input.index];
                fees += tempOutputs[val].coins;
                delete tempOutputs[val];
            }
            let outputs = pendingTxns[i].getOutputs();
            for(let output of outputs)
            {
                fees -= output.coins;
            }
            fs.appendFileSync("temp2.dat", pushInt(tx.length, 4, false), 'hex');
            fs.appendFileSync("temp2.dat", tx);
            console.log(pendingTxns[i]);
            console.log("to be mined");
            numTxns++;
        }
        else
        {
            pendingTxns.splice(i,1);
            console.log("A previously verified txn was removed as it was double spending");
            i--;
        }
    }
    let blockBod = "";
    try {
        blockBod = fs.readFileSync('temp2.dat');
        fs.unlinkSync('temp2.dat');
    } catch(err)
    {
        if(blocks === 0)
            console.log("No Block body, i.e genesis block ");
        else
        {
            console.log("Can't have 2 genesis blocks");
            return;
        }
    }

    let coinBaseTxn = new Transaction;
    coinBaseTxn.numInputs = 0;
    coinBaseTxn.numOutputs = 1;
    
    let coinBaseOut = new Output;
    coinBaseOut.coins = fees + blockReward;
    coinBaseOut.pubKeyLen = myKey.length;
    coinBaseOut.pubKey = myKey;

    coinBaseTxn.pushOutputs(coinBaseOut);
    let cbt = transactionBuffer(coinBaseTxn);
    console.log("num txn while mining: " + (numTxns-1).toString() + " + cbt");
    fs.writeFileSync('temp2.dat', pushInt(numTxns, 4, false), 'hex');
    fs.appendFileSync("temp2.dat", pushInt(cbt.length, 4, false), 'hex');
    fs.appendFileSync('temp2.dat', cbt);
    fs.appendFileSync('temp2.dat', blockBod);
    blockBod = fs.readFileSync('temp2.dat');
    fs.unlinkSync('temp2.dat');

    let bHash = crypto.createHash('sha256').update(blockBod).digest('hex');
    let prevBlock = "";
    try{
        prevBlock = fs.readFileSync("Blocks/" + (blocks - 1).toString() + ".dat");
        header.write(crypto.createHash('sha256').update(prevBlock.subarray(0,116)).digest('hex'),4,32, 'hex');
    } catch (err) {
        console.log("No previous block ");
        header.write('0'.repeat(64),4,32, 'hex');
    }
    console.log(blocks);
    header.write(pushInt(blocks, 4, false), 0, 4, 'hex');
    header.write(bHash, 36,32, 'hex');
    header.write(target, 68, 32, 'hex');
    header = header.toString('hex');
    console.log(header);
    worker.postMessage({header : header, 
                        target : target});
    worker.on('message', msg => {
        console.log(msg.header);
        fs.writeFileSync('temp3.dat', msg.header, 'hex');
        
        fs.appendFileSync('temp3.dat', blockBod);
        let block = fs.readFileSync('temp3.dat');
        fs.unlinkSync('temp3.dat');
        if(verifyBlock(block, cloneDeep(unusedOutputs), blocks, target, blockReward) === true)
        {
            processBlock(block);
            postNewBlock(block);
            ++blocks;
        }
    });
}

function postNewBlock(block)
{
    fs.writeFileSync(`Blocks/${blocks}.dat`,block);
    console.log('Spreading the block');
    for(let peer of myPeers)
    {
        axios.post(peer +'/newBlock', block, 
        {
            headers : {'Content-Type' : 'application/octet-stream'}
        }).then(res => {
            console.log('Block sent to '+ peer);
        }).catch(err => {
            console.log(err.response.data);
        })
    }
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
            vals["transactionId"] = input.txnId;
            vals["index"] = input.index;
            vals["signature"] = input.sig;

            inp.push(vals);
        }
        
        for(let output of outputs)
        {
            let vals = {};
            vals["amount"] = output.coins.toString();
            vals["recipient"] = output.pubKey;

            out.push(vals);
        }

        let temp = {};
        temp["id"] = crypto.createHash('sha256').update(transactionBuffer(txn)).digest('hex');
        temp["inputs"] = inp;
        temp["outputs"] = out;

        ret.push(temp);
    }
    res.set('Content-Type', 'application/json');
    res.send(ret);
});

app.post('/addAlias', (req, res) => {
    let alias = req.body.alias;
    let pubKey = req.body.publicKey;
    if (alias in keys) 
        res.status(400).send("alias already exists");
    
    else 
    {
        for(let peer of myPeers)
        {
            axios.post(peer + '/addAlias', {
                alias : alias,
                publicKey : pubKey
            })
            .then(res => {
                console.log("Alias: ", alias, "sent to url: ", peer);
            })
            .catch(err => {
                console.log(err);
            })
        }
        
        keys[alias] = pubKey;
        console.log(keys[alias]);
        res.status(200).send("Added");
    }
});

app.post('/getPublicKey', (req, res) => {
    let alias = req.body.alias;
    if (alias in keys) 
    {
        let pubKey = keys[alias];
        res.set('Content-type', 'application/json');
        res.send({publicKey : pubKey});
    }
    else 
        res.status(404).send("Alias not found");
})

app.post('/getUnusedOutputs', function(req, res) {
    let pubKey = req.body.publicKey;
    let alias = req.body.alias;

    if (pubKey !== undefined) 
    {
        if (pubKey in userOutputs) 
        {
            let obj = {};
            obj["unusedOutputs"] = userOutputs[pubKey];
            console.log(obj);
            res.set('Content-type', 'application/json');
            res.send(obj);
        }
        else
            res.status(404).send("Public Key has no unused outputs");
    }

    else if (alias !== undefined) 
    {
        if (alias in keys) 
        {
            pubKey = keys[alias];
            let obj = {};
            if (pubKey in userOutputs)
            {
                obj["unusedOutputs"] = userOutputs[pubKey];
                res.set('Content-type', 'application/json');
                res.send(obj);
            }
            else
                res.status(404).send("Public Key has no unused outputs");
        }
    }
    else
        res.status(404).send("Public Key not found");
}) 


app.post('/newPeer', (req, res) => {

    url = req.body.url;
    if(myPeers.indexOf(url) !== -1)
        res.send("Peer Already Present");
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
    console.log(data);
    console.log("Verifying block");
    data = Buffer.from(data);
    ret = verifyBlock(data, cloneDeep(unusedOutputs), blocks, target, blockReward);
    if(ret === true)
    {
        worker.terminate().then(console.log('worker terminated :-('));
        console.log(`Block ${blocks} mined.`);
        processBlock(data);
        postNewBlock(data);
        ++blocks;
        res.send("Block Added");
    }
    else
    {
        console.log("Invalid block");
        res.status(400).send("Invalid block");
    }
});

app.post('/newTransaction', (req, res) => {
    let temp = req.body;
    console.log("Recd new txn");
    let txn = buildPendingTxns(temp, pendingTxns);
    if(txn !== undefined)
    {
        pendingTxns.push(txn);
        let tx = transactionBuffer(txn);
        let txnId = crypto.createHash('sha256').update(tx).digest('hex');
        for(let peer of myPeers)
        {
            axios.post(peer + '/newTransaction', {
                id : txnId,
                inputs : temp.inputs,
                outputs : temp.outputs
            }).then(res => {
                console.log("Sent to " + peer);
            }).catch(err => {
                console.log("Got an error ");
                console.log(err.response.data);
            })
        }
        res.send("Added to pending Txns");
    }
});

app.listen (8000, () => {
    console.log("Listening on port 8000");
});

init();
setInterval(() => {
    if(pendingTxns.length > 0 && curBlock !== blocks)
    {
        console.log("Mining via timeout");
        curBlock = blocks;
        mine();
    }
}, 10000);


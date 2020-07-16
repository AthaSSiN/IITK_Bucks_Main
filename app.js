const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const Block = require("./classes/Block");
const Transaction = require("./classes/Transaction");
const Output = require("./classes/Output");
const Input = require("./classes/Input");
const getRawBody = require('raw-body');
const axios = require('axios');
const {Worker} = require('worker_threads');
const {cloneDeep} = require('lodash');
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
let myKey = fs.readFileSync('./public.pem');
let target = env["target"];

// Global Variables

let blocks = 0;

const peerLim = 4;
let myPeers = [];
let pendingTxns = [];
let unusedOutputs = new Map();
let keys = new Map();
let userOutputs = new Map();

/******* BASIC UTILS *********/

function getOutputsHash(txn)
{
    pushInt(txn.numOutputs);
    outputs = txn.getOutputs();
    for(let output of outputs)
    {
        pushInt(output.coins, 8);
        pushInt(output.pubKeyLen);
        pushText(output.pubKey);
    }

    let buf = fs.readFileSync("temp.dat");
    let hash = crypto.createHash('sha256').update(buf).digest('hex');

    fs.unlinkSync("temp.dat");
    return hash;

}

function pushInt(num, size = 4, file = true)
{
    let arr = new Uint8Array(size);
    if(size === 4)
        for(let i = 0; i < size; ++i)
        {
            arr[size-i-1] = num%256;
            num = num >> 8;
        }
    else
    {
        num = BigInt(num);
        for(let i = 0; i < size; ++i)
        {
            arr[size-i-1] = parseInt(num%256n);
            num = num/256n;
        }
    }
    if (file === true)
    {
        fs.appendFileSync("temp.dat", arr);
        return;
    }
    else
    {
        return Buffer.from(arr).toString('hex');
    }
}

function pushText(txt)
{
    let arr = new Uint8Array(Buffer.from(txt, 'utf-8'));
    fs.appendFileSync("temp.dat", arr);
    return;
}

function pushHash(str)
{
    let arr = new Uint8Array(Buffer.from(str, 'hex'));
    fs.appendFileSync("temp.dat", arr);
    return;
}

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

/*****  BLOCK UTILS ***** */


function readTxn(str)
{
    let start = 0;
    let txn = new Transaction;
    txn.numInputs = readInt(str, start, start + 4);
    start += 4;
    for (let i = 0; i < txn.numInputs; ++i)
    {
        let input = new Input;
        input.txnId = str.toString("hex", start, start + 32);
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

function verifyTxn(txn, realUnusedOutputs)
{ 
    let tempOutputs = cloneDeep(realUnusedOutputs);
    console.log(tempOutputs);
    let inputs = txn.getInputs();
    let spent = 0n, ini = 0n;

    let mainBuf = Buffer.alloc(68);
    mainBuf.write(getOutputsHash(txn), 36, 32, 'hex');
    for (let input of inputs)
    {
        let prevOut;
        let val = [input.txnId, input.index];
        if(val in tempOutputs)
        {
            prevOut = tempOutputs[val];
        }
        else
        {
            console.log("Provided input not in unused outputs");
            return false;
        }
        
        mainBuf.write(input.txnId, 0, 32, 'hex');
        mainBuf.write(pushInt(input.index,4,false), 32, 4, 'hex');
        
        const verify = crypto.createVerify('SHA256').update(mainBuf).verify({key:prevOut.pubKey, padding:crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength:32}, Buffer.from(input.sig, 'hex'));
        if(verify === false)
        {
            console.log("Incorrect signature");
            return false;
        }

        tempOutputs.delete(val);
        console.log("ins");
        ini += prevOut.coins;
    }

    let outputs = txn.getOutputs();
    for (let output of outputs)
    {
        if(output.coins < 0)
        {
            console.log("no");
            return false;
        }
        spent += output.coins;
    }

    return spent < ini;

}

function verifyBlock(block, unusedOutputs)
{
    let index = readInt(block, 0, 4);
    console.log(index);
    if(index !== 0)
    {
        let start = 116;
        let numTxns = readInt(block, start, start+4);
        start += 4;
        let cbt;
        let fees = 0n;
        for(let i = 0; i < numTxns; ++i)
        {
            let size = readInt(block, start, start + 4);
            start += 4;
            
            let tx = block.subarray(start, start + size);
            start+=size;
            let txn = readTxn(tx)
            if(i === 0)
                cbt = txn;
            
            else if( verifyTxn(txn, unusedOutputs) === false)
            {
                console.log("wrong txn");
                return false;
            }
            else
            {
                let inputs = txn.getInputs();
                for (let input of inputs)
                {
                    let val = [input.txnId, input.index];
                    fees += unusedOutputs[val].coins;
                    unusedOutputs.delete(val);
                }
                let outputs = txn.getOutputs();
                for(let output of outputs)
                {
                    fees -= output.coins;
                }
            }
        }
        let cbtOutputs = cbt.getOutputs();
        if (cbtOutputs.coins > fees + blockReward)
            return false;
    }

    let header = block.subarray(0, 116);
    let pHash = block.toString('hex', 4, 36);
    let bHash = block.toString('hex', 36, 68);
    let targ = block.toString('hex', 68, 100);

    if(bHash !== crypto.createHash('sha256').update(block.subarray(116)).digest('hex'))
        return false;
    
    if(index !== 0)
    {
        prevBlock = fs.readFileSync("Blocks/" + (index - 1).toString() + ".dat");
        if(pHash !== crypto.createHash('sha256').update(prevBlock).digest('hex'))
            return false;
    }
    else
    {
        if(pHash !== '0'.repeat(64))
            return false;
    }

    if(crypto.createHash('sha256').update(header).digest('hex') >= targ)
        return false;
    
    return true;
}

function transactionBuffer(txn)
{
    let inputs = txn.getInputs();
    let outputs = txn.getOutputs();

    pushInt(txn.numInputs);
    
    for(let input of inputs)
    {
        pushHash(input.txnId);
        pushInt(input.index);
        pushInt(input.sigLength)
        pushHash(input.sig);
    }

    pushInt(txn.numOutputs);

    for(let output of outputs)
    {
        pushInt(output.coins, 8);
        pushInt(output.pubKeyLen);
        pushText(output.pubKey);
    }

    let tx = fs.readFileSync('temp.dat');
    fs.unlinkSync('temp.dat');
    return tx;
}


/***** UTILITITY FUNCTIONS **** */

function buildPendingTxns(temp)
{
    let txn = new Transaction;
    txn.numInputs = temp["inputs"].length;
    for (let inp of temp["inputs"])
    {
        let input = new Input;
        input.txnId = inp["transactionId"];
        input.index = inp["index"];
        input.sigLength = inp["signature"].length/2;
        input.sig = inp["signature"];

        txn.pushInputs(input);
    }

    txn.numOutputs = temp["outputs"].length;
    for (let out of temp["outputs"])
    {
        let output = new Output;
        output.coins = BigInt(out["amount"]);
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
        let ind = pendingTxns.indexOf(txn);
        if (ind > -1)
            pendingTxns.splice(ind, 1);
        let inputs = txn.getInputs();
        for (let input of inputs)
        {
            let val = [input.txnId, input.index];
            let obj = {};
            obj["transactionId"] = input.txnId;
            obj["index"] = input.index;
            obj["amount"] = unusedOutputs[val].coins.toString();
            userOutputs[unusedOutputs[val].pubKey].splice(userOutputs[unusedOutputs[val].pubKey].indexOf(obj), 1);
            unusedOutputs.delete(val);
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
        console.log(unusedOutputs);
        console.log(pendingTxns);
    }
}

// process exisiting blockchain
while(1)
{
    try {
        block = fs.readFileSync(`Blocks/${blocks}.dat`);
        ret = verifyBlock(block, cloneDeep(unusedOutputs));
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
        }).then (res => {
            let block = res.data;
            block = Buffer.from(block);
            if(verifyBlock(block, cloneDeep(unusedOutputs)) === true)
            {
                fs.writeFileSync(`Blocks/${blocks}.dat`,block);
                processBlock(block);
            }
            else
                return new Error("Verification failed :(, block not added");
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


function getPendingTxns(url)
{
    axios.get(url + '/getPendingTransactions').then(res => {
        let txns = res.data;
        for (let temp of txns)
            buildPendingTxns(temp);
        
        console.log(pendingTxns);
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
                console.log(blocks);
            }
            catch(err)
            {
                console.log(err);
                console.log("recd all verified blocks");
                break;
            }
        }
        getPendingTxns(peer);
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
            mine();
    }, 10000)
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
        let tx = transactionBuffer(pendingTxns[i]);
        size += tx.length
        if(size > 1000116)
            break;

        if(verifyTxn(pendingTxns[i], tempOutputs) === true)
        {
            let inputs = pendingTxns[i].getInputs();
            for (let input of inputs)
            {
                let val = [input.txnId, input.index];
                fees += tempOutputs[val].coins;
                tempOutputs.delete(val);
            }
            let outputs = pendingTxns[i].getOutputs();
            for(let output of outputs)
            {
                fees -= output.coins;
            }
            let tx = transactionBuffer(pendingTxns[i]);
            size += tx.length;
            if(size > 1000000)
                break;
            fs.appendFileSync("temp2.dat", pushInt(tx.length, 4, false), 'hex');
            fs.appendFileSync("temp2.dat", tx);
            numTxns++;
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
    console.log("num txn while mining: " + numTxns);
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
        header.write(crypto.createHash('sha256').update(prevBlock).digest('hex'),4,32, 'hex');
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
        if(verifyBlock(block, cloneDeep(unusedOutputs)) === true)
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
        axios.post(peer +'/newBlock', {
            headers : {'Content-Type' : 'application/octet-stream'},
            data : block
        }).then(res => {
            console.log('Block sent to '+ peer);
        }).catch(err => {
            console.log(err);
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
    console.log("Verifying block");
    data = Buffer.from(data);
    ret = verifyBlock(data, cloneDeep(unusedOutputs));
    if(ret === true)
    {
        worker.terminate().then(console.log('worker terminated :-('));
        console.log(`Block ${blocks} mined.`);
        ++blocks;
        processBlock(data);
        postNewBlock(data);
        res.send("Block Added");
    }
    else
    {
        console.log("Invalid block");
        res.send("Invalid block");
    }
});

app.post('/newTransaction', (req, res) => {
    let temp = req.body;
    buildPendingTxns(temp);
    mine();
    res.send("Added to pending Txns");
});

app.listen (8000, () => {
    console.log("Listening on port 8000");
});

init();


const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const Transaction = require("./classes/Transaction");
const Output = require("./classes/Output");
const Input = require("./classes/Input");
const getRawBody = require('raw-body');

const app = express();

app.use (bodyParser.urlencoded({extended : true}));
app.use (bodyParser.json());

app.use((req, res, next) => {
    if (req.headers['content-type'] === 'application/octet-stream') 
    {
        getRawBody(req, {
            length: req.headers['content-length'],
            encoding: req.charset
        }, (err, string) => {
            if (err)
                return next(err);

            req.body = string;
            next();
         })
    }
    else 
        next();
});

blocks = 0;

while(1)
{
    try {
    fs.readFileSync(`Blocks/${blocks}.dat`);
    } catch (err) {
        break;
    }
    ++blocks;
}

let myPeers = [];
let pendingTxns = [];

app.get ('/getBlock/:num', (req, res) => {
    const n = req.params.num;
    const data = fs.readFileSync(`Blocks/${n}.dat`);
    res.set ('Content-Type', 'application/octet-stream')
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
    myPeers.push(req.body.url);
    res.send("Peer Added");
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

    pendingTxns.push(txn);
    console.log(txn);

    res.send("Added to pending Txns");
});

app.listen (8000, () => {
    console.log("Listening on port 8000");
})

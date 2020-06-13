const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const Transaction = require("./classes/Transaction");
const Output = require("./classes/Output");
const Input = require("./classes/Input");

const app = express();

app.use (bodyParser.urlencoded({extended : true}));
app.use (bodyParser.json());

let pendingTxns = [];

app.get ('/getBlock/:num', function(req, res) {
    const n = req.params.num;
    const data = fs.readFileSync(n + ".dat");
    res.set ('Content-Type', 'application/octet-stream')
    res.send(data);
});

app.get ('/getPendingTransactions', function (req, res) {
    let ret = [];
    for(let txn of pendingTxns)
    {
        let inputs = txn.getInputs();
        let outputs = txn.getOutputs();
        
        let temp = {};
        temp["inputs"] = inputs;
        temp["outputs"] = outputs;

        ret.push(temp);
    }
    res.set('Content-Type', 'application/json');
    res.send(ret);
});

app.listen (8000, function() {
    console.log("Listening on port 8000");
})

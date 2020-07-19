const fs = require('fs');
const Transaction = require("../classes/Transaction");
const Output = require("../classes/Output");
const Input = require("../classes/Input");
const { deepStrictEqual } = require('assert');
const {
    pushInt,
    pushText,
    pushHash,
    readInt
} = require('./basicUtils');

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

function buildPendingTxns(temp, pendingTxns)
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

    let ind = pendingTxns.findIndex(x => {
        try {
            deepStrictEqual(x,txn);
            return true;
        } catch (err)
        {
            return false;
        }
    });
    if(ind === -1)
        return txn;
    else
    {
        return undefined;
    }
}


module.exports = {
    readTxn,
    transactionBuffer,
    buildPendingTxns
}
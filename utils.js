const crypto = require('crypto');
const Transaction = require("./classes/Transaction");
const Output = require("./classes/Output");
const Input = require("./classes/Input");
const fs = require('fs')

/****** HELPER UTILS **********/

function getOutputsHash(txn)
{
    pushInt(txn.numOutputs);

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
        for(let i = 0; i < size; ++i)
        {
            arr[size-i-1] = parseInt(num%256n);
            num = num/256n;
        }
    if (file === true)
    {
        fs.appendFileSync("temp3.dat", arr);
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
    fs.appendFileSync("temp3.dat", arr);
    return;
}

function pushHash(str)
{
    let arr = new Uint8Array(Buffer.from(str, 'hex'));
    fs.appendFileSync("temp3.dat", arr);
    return;
}

export function readInt(str, start, end)
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


export function readTxn(str)
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

export function verifyTxn(txn, realUnusedOutputs)
{ 
    let unusedOutputs = new Map(realUnusedOutputs);
    let inputs = txn.getInputs();
    let spent = 0, ini = 0;

    let mainBuf = Buffer.alloc(68);
    mainBuf.write(getOutputsHash(txn), 36, 32, 'hex');

    for (let input of inputs)
    {
        let prevOut;
        let val = [input.txnID, input.index];
        if(val in unusedOutputs)
        {
            prevOut = unusedOutputs[val];
        }
        else
            return false;
        
        mainBuf.write(input.txnID, 0, 32, 'hex');
        mainBuf.write(pushInt(input.index,4,false), 32, 4, 'hex');
        
        const verify = crypto.createVerify('SHA256').update(mainBuf).verify({key:prevOut.pubKey, padding:crypto.constants.RSA_PKCS1_PSS_PADDING}, Buffer.from(input.sig, 'hex'));

        if(verify === false)
            return false;
        
        unusedOutputs.delete(val);
        ini += prevOut.coins;
    }

    let outputs = txn.getOutputs();
    for (let output of outputs)
    {
        if(output.coins < 0)
            return false;
        spent += output.coins;
    }

    return spent >= ini;

}

export function verifyBlock(block, unusedOutputs)
{
    let index = readInt(block, 0, 4);
    if(index !== 0)
    {
        let start = 116;
        let numTxns = readInt(block, start, start+4);
        start += 4;
        for(let i = 0; i < numTxns; ++i)
        {
            let size = readInt(block, start, start + 4);
            start += 4;
            
            let tx = block.subarray(start, start + size);
            
            let txn = readTxn(tx);

            if(verifyTxn(txn, unusedOutputs) === false)
                return false;
        }
    }

    let header = block.subarray(0, 116);
    let pHash = block.toString('hex', 4, 36);
    let bHash = block.toString('hex', 36, 68);
    let targ = block.toString('hex', 68, 100);

    if(bHash !== crypto.createHash('sha256').update(block.subarray(116)).digest('hex'))
        return false;
    
    if(targ !== '0'.repeat(7) + 'f' + '0'.repeat(56))
        return false;
    
    if(index !== 0)
    {
        prevBlock = fs.readFileSync("Blocks/" + index - 1 + ".dat");
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

export function transactionBuffer(txn)
{
    let inputs = txn.getInputs();
    let outputs = txn.getOutputs();
    console.log(inputs);
    console.log(outputs);

    pushInt(txn.numInputs);
    
    for(let input of inputs)
    {
        pushHash(input.txnID);
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

    let tx = fs.readFileSync('temp3.dat');
    fs.unlinkSync('temp3.dat');
    return tx;
}

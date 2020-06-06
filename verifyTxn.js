const crypto = require('crypto');
const Transaction = require("./classes/Transaction");
const Output = require("./classes/Output");
const Input = require("./classes/Input");
const fs = require('fs')

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

module.exports = function(txn, unusedOutputs)
{
    let usedOutputs = {};
    
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

        if(val in usedOutputs)
            return false;
        
        usedOutputs.set(val, prevOut);
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


const crypto = require('crypto');
const fs = require('fs');
const { cloneDeep } = require('lodash');
const {
    getOutputsHash,
    pushInt,
    readInt
} = require('./basicUtils');

const { readTxn } = require('./txnUtils.js')

function verifyTxn(txn, realUnusedOutputs)
{ 
    let tempOutputs = cloneDeep(realUnusedOutputs);
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
    return spent <= ini;

}

function verifyBlock(block, unusedOutputs, blocks, target, blockReward)
{
    let index = readInt(block, 0, 4);
    console.log(index);
    
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
        let txn = readTxn(tx);
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
    if (cbtOutputs[0].coins > fees + blockReward)
        return false;


    let header = block.subarray(0, 116);
    let pHash = block.toString('hex', 4, 36);
    let bHash = block.toString('hex', 36, 68);
    let targ = block.toString('hex', 68, 100);

    if(bHash !== crypto.createHash('sha256').update(block.subarray(116)).digest('hex'))
        return false;
    
    if(blocks !== 0)
    {
        console.log("Reading " + "Blocks/" + (blocks - 1).toString() + ".dat");
        prevBlock = fs.readFileSync("Blocks/" + (blocks - 1).toString() + ".dat");
        if(pHash !== crypto.createHash('sha256').update(prevBlock.subarray(0,116)).digest('hex'))
        {
            console.log("Wrong parent hash");
            console.log(pHash);
            console.log(crypto.createHash('sha256').update(prevBlock.subarray(0,116)).digest('hex'));
            return false;
        }
    }
    else
    {
        if(pHash !== '0'.repeat(64))
        {
            console.log("Wrong parent hash");
            console.log(pHash);
            return false;
        }
    }

    if(targ !== target)
    {
        console.log("wrong target");
        return false;
    }

    if(crypto.createHash('sha256').update(header).digest('hex') >= targ)
    {
        console.log("Wrong nonce");
        return false;
    }
    
    return true;
}

module.exports = {
    verifyTxn,
    verifyBlock
}
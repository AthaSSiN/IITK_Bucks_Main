const crypto = require('crypto');
const fs = require('fs');

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

module.exports = {
    getOutputsHash,
    pushInt,
    pushText,
    pushHash,
    readInt
}
const fs = require('fs');
const readline = require('readline');
const Transaction = require("classes/Transaction");
const Output = require("classes/Output");
const Input = require("classes/Input");
const verifyTxn = require("verifyTxn")

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

let unusedOutputs = {};

rl.question("Enter the relative path to the binary file to be read: ", name => {
    let ans;
    try {
        str = fs.readFileSync(ans);
    } catch(err) {
        console.log("File not found, reading the sample file 010.dat");
        str = fs.readFileSync("010.dat");
    }
    let hash = crypto.createHash('sha256').update(str).digest('hex');
    hash = hash.toString();

    let txn = new Transaction;
    txn.numInputs = readInt(str, 0,4);
    let start = 4;

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

    let res = verifyTxn(txn, unusedOutputs);
    if (res === true)
        console.log("Valid transaction!");
    else
        console.log("Invalid Transaction");
    rl.close();
})

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
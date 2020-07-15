const crypto = require('crypto');
const { generateKeyPair } = require('crypto');
const axios = require('axios');
const fs = require('fs');

const rl = require('readline-sync');

const env = JSON.parse(fs.readFileSync('./config.json'));

const me = env["me"];
const opts = ["Add Alias", "Generate Key Pair", "View Balance", "Do a Transactions"];

console.log(me);
let ind = rl.keyInSelect(opts, 'Press the correct digit to perform the action');
switch(ind)
{
    case 0:
        addAlias();
        break;
    case 1:
        keygen();
        break;
    case 2:
        viewBal();
        break;
    case 3:
        doTxn();
        break;
    default:
        console.log("Exiting");
        f = 1;
        break;
}

function addAlias()
{
    const alias = rl.question("Enter new alias: ");
    const path = rl.question("Enter path to public key: ");
    const pubKey = fs.readFileSync(path, 'utf-8');
    axios.post(me + '/addAlias', {
        "alias": alias,
        "publicKey" : pubKey
    }).then(res => {
        console.log('Alias added');
    }).catch(err => {
        console.log('Not added');
    });
}

function keygen()
{
    generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: 
    {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: 
    {
        type: 'pkcs8',
        format: 'pem'
    }
    },  (err, pubKey, privKey) => 
        {
            if(err)
                console.log("Error encountered: ", err);
            
                else
            {
                console.log("Key pair generated successfully");
                fs.writeFileSync("pubKey.pem", pubKey);
                fs.writeFileSync("privKey.pem", privKey);
                console.log("contents written to ./pubKey.pem and ./privKey.pem");
            }
        });
}

function viewBal()
{
    let ans = rl.keyIn('Enter 1 to enter alias or 2 to give path to public key: ');
    if(ans === '2')
    {
        let pubKey = fs.readFileSync(rl.question("Enter path to public key file: "), 'utf-8');
        axios.post(me + '/getUnusedOutputs', {
            publicKey: pubKey
        }).then(res => {
            let unusedOutputs = res.data.unusedOutputs;
            let bal = 0n;
            for (let i = 0; i < unusedOutputs.length; i++)
                bal += unusedOutputs[i].amount;
            console.log("Your balance is: " + bal + " coins");
        }).catch(err => {
            console.log(err);
        });
    }
    else if(ans === '1')
    {
        let alias = rl.question("Enter the alias: ");
        axios.post(me + '/getUnusedOutputs', {
            alias: alias
        }).then(res => {
            let unusedOutputs = res.data.unusedOutputs;
            let bal = 0n;
            for (let i = 0; i < unusedOutputs.length; i++)
                bal += unusedOutputs[i].amount;
            console.log("Your balance is: " + bal + " coins");
        }).catch(err => {
            console.log(err.response.data);
        });
    }
}

async function doTxn()
{
    let pubKey = fs.readFileSync(rl.question('Enter path to your public Key: '), 'utf-8');
    let privKey = fs.readFileSync(rl.question('Enter path to your private Key: '), 'utf-8');
    let unusedOutputs = [];
    let bal = 0n;
    await axios.post(me + '/getUnusedOutputs', {
        publicKey: pubKey
    }).then(res => {
        unusedOutputs = res.data.unusedOutputs;
        for (let i = 0; i < unusedOutputs.length; i++)
            bal += unusedOutputs[i].amount;
        console.log("Your balance is: " + bal + " coins");
    }).catch(err => {
        console.log(err.response.data);
    });

    let numOutputs = rl.question("Enter number of outputs: ");
    let outputs = [];
    let total = 0n;

    for(let i = 0; i < numOutputs; ++i)
    {
        let ans = rl.question("Enter alias of recipient, or path to public Key of the recipient: ");
        let output = new Map();
        try{
            output["recipient"] = fs.readFileSync(ans, 'utf-8');
        } catch (err) {
            await axios.post(me + '/getPublicKey', {
                alias: ans
            }).then(res => {
                output["recipient"] = res.data.publicKey;
                console.log("Recipient public Key received");
            }).catch(err => {
                console.log(err.response.data);
            });        
        }
        output["amount"] = rl.question("Enter the number of coins to pay: ");
        total += BigInt(output["amount"]);
        console.log(output);
        outputs.push(output);
    }

    let fee = BigInt(rl.question("Pls enter the amount to leave as a transaction fee, and make a miner's day :)"));
    total += fee;
    if(bal < total)
    {
        console.log("You spent more than you own :( ");
        return;
    }

    let left = bal;
    left = BigInt(left.toString() - total.toString());
    let output = new Map();
    output["recipient"] = pubKey;
    output["amount"] = left.toString();
    outputs.push(output);

    let mainBuf = Buffer.alloc(68);
    let outHash = getOutputsHash(numOutputs + 1, outputs);
    mainBuf.write(outHash, 36,32,'hex');

    let inputs = [];
    for(let i = 0; i < unusedOutputs.length; ++i)
    {
        mainBuf.write(unusedOutputs[i]["transactionId"], 0, 32, 'hex');
        mainBuf.write(pushInt(unusedOutputs[i]["index"],4,false), 32, 4, 'hex');
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(mainBuf);
        let signature = sign.sign({key:privKey, padding:crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength:32}, 'hex');
        let input = new Map();
        input["transactionId"] = unusedOutputs[i]["transactionId"];
        input["index"] = unusedOutputs[i]["index"];
        input["signature"] = signature;
        console.log(input);
        inputs.push(input);
    }

    axios.post(me + '/newTransaction', {
        "inputs" : inputs,
        "outputs": outputs
    }).then(res => {
        console.log("Txn sent!");
    }).catch(err => {
        console.log(err);
    })


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
        fs.appendFileSync("tempcli.dat", arr);
        return;
    }
    else
    {
        return Buffer.from(arr).toString('hex');
    }
}

function getOutputsHash(numOutputs, outputs)
{
    pushInt(numOutputs);

    for(let output of outputs)
    {
        pushInt(output["amount"], 8);
        pushInt(output["recipient"].length);
        pushText(output["recipient"]);
    }

    let buf = fs.readFileSync("tempcli.dat");
    let hash = crypto.createHash('sha256').update(buf).digest('hex');

    fs.unlinkSync("tempcli.dat");
    return hash;

}

function pushText(txt)
{
    let arr = new Uint8Array(Buffer.from(txt, 'utf-8'));
    fs.appendFileSync("tempcli.dat", arr);
    return;
}
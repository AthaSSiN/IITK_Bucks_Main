const { parentPort } = require('worker_threads');
const now = require('nano-time');
const crypto = require('crypto');

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

parentPort.on('message', msg => {
    let mainBuf = msg.header;
    let tHash = msg.target;
    let hash;
    for(let i = 0n; ; i += 1n)
    {
        mainBuf.write(pushInt(BigInt(now()),8, false), 100, 8, 'hex');
        mainBuf.write(pushInt(i, 8, false), 108, 8, 'hex');

        hash = crypto.createHash('sha256').update(mainBuf).digest('hex');
        
        if(hash < tHash)
        {
            parentPort.postMessage({header : header});
            break;
        }
    }
});
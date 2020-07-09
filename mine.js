const { parentPort } = require('worker_threads');
const now = require('nano-time');
const crypto = require('crypto');
const now = require('nano-time');
import {pushInt} from './utils';


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
class Output{
    _coins;
    _pubKeyLen;
    _pubKey;

    set coins(coins)
    {
        this._coins = coins;
    }

    get coins ()
    {
        return this._coins;
    }


    set pubKeyLen(pubKeyLen)
    {
        this._pubKeyLen = pubKeyLen;
    }
    
    get pubKeyLen()
    {
        return this._pubKeyLen;
    }

    set pubKey(pubKey)
    {
        this._pubKey = pubKey;
    }

    get pubKey()
    {
        return this._pubKey;
    }

}

module.exports = Output;
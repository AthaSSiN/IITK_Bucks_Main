class Input{
    _txnID;
    _index;
    _sigLength;
    _sig;

    set txnID(txnID)
    {
        this._txnID = txnID;
    }

    get txnID ()
    {
        return this._txnID;
    }

    set index(index)
    {
        this._index = index;
    }

    get index ()
    {
        return this._index;
    }

    set sigLength(sigLength)
    {
        this._sigLength = sigLength
    }

    get sigLength()
    {
        return this._sigLength;
    }

    set sig(sig)
    {
        this._sig = sig;
    }

    get sig()
    {
        return this._sig;
    }
}

module.exports = Input;
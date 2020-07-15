class Input{
    _txnId;
    _index;
    _sigLength;
    _sig;

    set txnId(txnId)
    {
        this._txnId = txnId;
    }

    get txnId ()
    {
        return this._txnId;
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
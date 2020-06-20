class Block {
    _blockHeader;
    _numTxns;
    _txns = [];

    set blockHeader(bH)
    {
        this._blockHeader = bH;
    }
    get blockHeader()
    {
        return this._blockHeader;
    }

    set numTxns(n)
    {
        this._numTxns = n;
    }
    get numTxns()
    {
        return this._numTxns
    }

    pushTxns(txn)
    {
        this._txns.push(txn);
    }
    getTxns()
    {
        return this._txns;
    }

}
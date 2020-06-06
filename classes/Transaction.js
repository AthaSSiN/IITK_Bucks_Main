class Transaction {
    _numInputs;
    _inputs = [];
    _numOutputs;
    _outputs = [];

    set numInputs(numInputs) {
        this._numInputs = numInputs;
    }

    get numInputs() {
        return this._numInputs;
    }

    pushInputs(input) {
        this._inputs.push(input);
    }

    getInputs() {
        return this._inputs;
    }

    set numOutputs(numOutputs) {
        this._numOutputs = numOutputs;
    }

    get numOutputs() {
        return this._numOutputs;
    }

    pushOutputs(output) {
        this._outputs.push(output);
    }

    getOutputs() {
        return this._outputs;
    }

}

module.exports = Transaction;
# IITK_Bucks_Main

This is the repo for main app for the IITK Bucks Project

To use this repo run:
```bash
npm install
```

To run the verification process, first feed in the Transaction details to readTxn.js, which uses the exported function in verifyTxn.js to verify if a transaction is correct or not.

To add a new Node, send get requests at localhost 8000 after runnnig newNode.js, at the address /getBlock/n to get details of the nth block, or to /getPending/Transactions to get all the pending transactions.
# IITK_Bucks_Main

This is the repo for main app for the IITK Bucks, a blockchain development Project by Programming Club IIT Kanpur

To use this repo run:
```bash
npm install
node app.js
```

To connect to the Blockchain:
1. run `ngrok 8000` to get the server online, and add the generated url to "me" in config.json  
2. config the config.json file according to your system, and run app.js. 

The node will automatically connect to other nodes, and get the existing blocks, which will be stored in the 'Blocks' directory.

To perform the various operations such as:  
[1] Add Alias  
[2] Generate Key Pair  
[3] View Balance  
[4] Do a Transactions  
run cli.js and provide inputs as instructed.

I have provided a sample public and private key pair, a_public.pem and a_private.pem and my own public Key, public.pem, if you would like to make donations :)).
Never share your private key!

The block reward and target are both set to be very high in config.json, and need to be reduced before entering the actual blockchain of IITK Bucks!

The classes used in the program are available in the 'classes' directory. It also has a Block class, which I haven't used as such but exists for future use, etc.

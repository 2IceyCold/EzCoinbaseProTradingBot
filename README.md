# EzCoinaseProBot

## Overview: 
This bot trades crypto in Coinbase Pro through the Coinbase Pro API. This bot is implemented using NodeJS, it's fast simple and efficient. It implements a basic momentum trading algorithm that dynamically adjusts the strategy itself using the [Crypto Fear & Greed Index](https://alternative.me/crypto/fear-and-greed-index/). It requires minimal knowledge or background to get up and running. Momentum trading works by buying when the price goes up, and selling when the price goes down. It works by using percent shifts in price, for example if the price shifts 1.5% down, it will attempt to sell, when the price shifts up X% it will attempt to buy in. It will only sell when a trade is profitable and clears any associated fee costs. When the greed is high the bot adjusts the percent so that it's a low value to sell out, but a high value to buy in, and vice versa when the fear is high. 

## Run the bot:
1. Download and install [NodeJS](https://nodejs.org/en/download/)
2. Clone or download this repository to a location on your drive.
3. Open a command line in the directory location of the project then type `npm install`
4. Create an API key in CoinbasePro
    * Sign into coinbase pro (If you have a coinbase account the login for coinbase pro is the same) Click your profile icon in the top right corner then click the API option
    * With the Default Portfolio selected in the API key menu, press the +New API Key button
    * Give it a name and enable the permissions
    * Enter a passphrase and write it down
    * Leave IP Whitelist blank unless you have a static IP as your IP may change rendering the key unusable.
    * Click next and write down the Secret key that is shows, then under your api keys copy the key itself (In total you should have 3 things, passphrase, key, and secret).
5. Create a file in the project folder, literally named ".env". In that file add the following 3 fields:
    * API_KEY=_COPYYOURKEYHERE_
    * API_SECRET=_COPYYOURAPISECRETHERE_
    * API_PASSPHRASE=_COPYYOURPASSPHRASEHERE_
6. Make sure you have USD funds in your portfolio to begin trading (Note that many cryptos have a minimum order amount of around 10$), then type `node index.js` the program will prompt you to enter the crypto you want to trade and the amount of funds to trade with. You can enter any valid crypto ticker that is traded on coinbase pro. For example enter BTC then enter 15 to trade 15$ in bitcoin. Enter that information then it will begin trading! Simply leave it running as it adjusts and trades automatically.

Feel free to reach out for help by posting in the discussion or issues on Github. Consider contributing to the project. If it helped you make some money consider donating BTC: bc1qeuptp9s9gppyt77amrzdt49mr6w3hlkw39cmla


Happy Trading!

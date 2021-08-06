# EzCoinaseProBot

## Overview: 
This bot trades crypto in Coinbase Pro through the Coinbase Pro API. This bot is implemented using NodeJS, it's fast simple and efficient. It implements a basic momentum trading algorithm that dynamically adjusts the momentum trading strategy itself using the [Crypto Fear & Greed Index](https://alternative.me/crypto/fear-and-greed-index/). It requires minimal knowledge or background to get up and running. Momentum trading works by buying when the price goes up, and selling when the price goes down. it works by using percent shifts in price, for example if the price shifts 1.5% down, attempt to sell. When the greed is high the bot adjusts the percent so that it's a low value to sell out, but a high value to buy in, and vice versa when the fear is high. 

## Run the bot:
1. Download and install [NodeJS](https://nodejs.org/en/download/)
2. Clone this repository.
3. Open a command line in the directory location of the project then type `npm install`
4. Create an API key in CoinbasePro
    * Click profile -> API
    * With Default Portfolio selected press the +New API Key button
    * Give it a name and enable the permissions
    * Enter a passphrase and write it down
    * Leave IP Whitelist blank unless you have a static IP as your IP may change rendering the key unusable.
    * Click next and write down the Secret key that is shows, then under your api keys copy the key itself.
5. Create a file in the project folder, literally named ".env". In that file add the following 3 fields:
    * API_KEY=_COPYYOURKEYHERE_
    * API_SECRET=_COPYYOURAPISECRETHERE_
    * API_PASSPHRASE=_COPYYOURPASSPHRASEHERE_
6. Make sure you have funds in your portfolio, then type `node index.js` the program will prompt you to enter the crypto you want to trade and the amount of funds to trade with. Enter that information then it will begin trading! Simply leave it running as it adjusts and trades automatically.

Feel free to reach out for help by posting in the discussion or issues on Github. Consider contributing to the project. If it helped you make some money consider donating BTC: bc1qeuptp9s9gppyt77amrzdt49mr6w3hlkw39cmla


Happy Trading!
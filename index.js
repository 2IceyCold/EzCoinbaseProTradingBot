const CoinbasePro = require("coinbase-pro");
require('dotenv').config()
const { buyPosition, sellPosition } = require("./buyAndSell");
const coinbaseProLib = require("./coinbaseProLibrary");
const prompt = require("prompt-async");

const key = `${process.env.API_KEY}`;
const secret = `${process.env.API_SECRET}`;
const passphrase = `${process.env.API_PASSPHRASE}`;

// Change this to "https://public.sandbox.pro.coinbase.com" if you want to trade in the coinbase pro sandbox. and the websocketURI to "wss://ws-feed-public.sandbox.pro.coinbase.com"
const apiURI = "https://api.pro.coinbase.com";
const websocketURI = "wss://ws-feed.pro.coinbase.com";

// global variables:
const quoteCurrencyName = "USD";
const balanceMinimum = .06;
const orderPriceDelta =  .001; //The amount of extra room to give the sell/buy orders to go through
let sellPositionDelta = .015; //The amount of change between peak and valley to trigger a sell off
let buyPositionDelta = .015; //The amount of change between the valley and peak price to trigger a buy in
let currentPrice;

let authedClient = new CoinbasePro.AuthenticatedClient(
    key,
    secret,
    passphrase,
    apiURI
);
const coinbaseLibObject = new coinbaseProLib(key, secret, passphrase, apiURI);

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function listenForPriceUpdates(productPair) {
    if (productPair == null) {
        throw new Error("Error in listenForPriceUpdates method. ProductPair is null!");
    }
    const websocket = new CoinbasePro.WebsocketClient(
        [productPair],
        websocketURI,
        {
            key,
            secret,
            passphrase,
        },
        { channels: ["ticker"] }
    );
    websocket.on("error", function (err) {
        const message = "Error occurred in the websocket.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
        listenForPriceUpdates(productPair);
    });
    websocket.on("close", function () {
        listenForPriceUpdates(productPair);
    });
    websocket.on("message", function (data) {
        if (data.type === "ticker") {
            if (currentPrice !== data.price) {
                currentPrice = parseFloat(data.price);
            }
        }
    });
}

async function losePosition(balance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig) {
    try {
        while (positionInfo.positionExists === true) {
            await sleep(250); //Let price update

            if (lastPeakPrice < currentPrice) {
                //New peak hit, reset values
                lastPeakPrice = currentPrice;
                lastValleyPrice = currentPrice;

            } else if (lastValleyPrice > currentPrice) {
                //New valley hit, track valley and check sell conditions
                lastValleyPrice = currentPrice;

                const target = lastPeakPrice - (lastPeakPrice * sellPositionDelta);
                const lowestSellPrice = lastValleyPrice - (lastValleyPrice * orderPriceDelta);
                const receivedValue = (lowestSellPrice * balance) - ((lowestSellPrice * balance) * tradingConfig.highestFee);

                if ((lastValleyPrice <= target) && (receivedValue > positionInfo.positionAcquiredCost)) {

                    //Create a new authenticated client to prevent it from expiring or hitting API limits
                    authedClient = new CoinbasePro.AuthenticatedClient(
                        key,
                        secret,
                        passphrase,
                        apiURI
                    );
                    
                    console.log("Entering sell position.");
                    await sellPosition(balance, positionInfo, lastValleyPrice, authedClient, productInfo, tradingConfig);
                }
            }
        }
    } catch (err) {
        const message = "Error occurred in losePosition method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
        throw err;
    }
}

async function gainPosition(balance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig) {
    try {
        while (positionInfo.positionExists === false) {
            await sleep(250); //Let price update

            if (lastPeakPrice < currentPrice) {
                //New peak hit, track peak price and check buy conditions
                lastPeakPrice = currentPrice;

                const target = lastValleyPrice + (lastValleyPrice * buyPositionDelta);

                if (lastPeakPrice >= target) {

                    //Create a new authenticated client to prevent it from expiring or hitting API limits
                    authedClient = new CoinbasePro.AuthenticatedClient(
                        key,
                        secret,
                        passphrase,
                        apiURI
                    );

                    console.log("Entering buy position.");
                    await buyPosition(balance, positionInfo, lastPeakPrice, authedClient, productInfo, tradingConfig);
                }
            } else if (lastValleyPrice > currentPrice) {
                //New valley hit, reset values

                lastPeakPrice = currentPrice;
                lastValleyPrice = currentPrice;

            }
        }
    } catch (err) {
        const message = "Error occurred in gainPosition method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
        throw err;
    }
}

async function getAccountIDs(productInfo) {
    try {
        let accountObject = {};

        //Gets the account IDs for the product pairs in the portfolio
        const accounts = await authedClient.getAccounts();

        for (let i = 0; i < accounts.length; ++i) {
            if (accounts[i].currency === productInfo.baseCurrency) {
                accountObject.baseCurrencyAccountID = accounts[i].id;
            } else if (accounts[i].currency === productInfo.quoteCurrency) {
                accountObject.quoteCurrencyAccountID = accounts[i].id;
            }
        }

        //Gets all the profiles belonging to the user and matches the deposit and trading profile IDs
        const profiles = await coinbaseLibObject.getProfiles();

        for (let i = 0; i < profiles.length; ++i) {
            if (profiles[i].name === 'default') {
                accountObject.tradeProfileID = profiles[i].id;
            }
        }

        return accountObject;
    } catch (err) {
        const message = "Error occured in getAccountIDs method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
        throw err;
    }
}

async function getProductInfo(productInfo) {
    try {
        let quoteIncrementRoundValue = 0;
        let baseIncrementRoundValue = 0;
        let productPairData;

        const products = await authedClient.getProducts();

        for (let i = 0; i < products.length; ++i) {
            if (products[i].id === productInfo.productPair) {
                productPairData = products[i];
            }
        }

        if (productPairData === undefined) {
            throw new Error(`Error, could not find a valid matching product pair for "${productInfo.productPair}". Verify the product names is correct/exists.`);
        }

        for (let i = 2; i < productPairData.quote_increment.length; ++i) {
            if (productPairData.quote_increment[i] === "1") {
                quoteIncrementRoundValue++;
                break;
            } else {
                quoteIncrementRoundValue++;
            }
        }

        if (productPairData.base_increment[0] !== "1") {
            for (let i = 2; i < productPairData.base_increment.length; ++i) {
                if (productPairData.base_increment[i] === "1") {
                    baseIncrementRoundValue++;
                    break;
                } else {
                    baseIncrementRoundValue++;
                }
            }
        }

        productInfo.quoteIncrementRoundValue = Number(quoteIncrementRoundValue);
        productInfo.baseIncrementRoundValue = Number(baseIncrementRoundValue);
    } catch (err) {
        const message = "Error occurred in getProductInfo method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
        throw err;
    }
}

async function returnHighestFee() {
    try {
        const feeResult = await coinbaseLibObject.getFees();

        let makerFee = parseFloat(feeResult.maker_fee_rate);
        let takerFee = parseFloat(feeResult.taker_fee_rate);

        if (makerFee > takerFee) {
            return makerFee;
        } else {
            return takerFee;
        }
    }
    catch (err) {
        const message = "Error occurred in getFees method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
        throw err;
    }
}
async function prompts() {
    prompt.start();
    const {coinToTrade, usdAmount,} = await prompt.get(['coinToTrade', 'usdAmount']);
    console.log(`Crypto currency to trade: ${coinToTrade}`);
    console.log(`Amount of USD to trade: ${usdAmount}`);

    return {coinToTrade, usdAmount};
}

async function momentumStrategyStart() {
    try {
        console.log("****************BOT STARTING****************");
        console.log(`If you would like to trade in the coinbase pro sandbox instead of the real environment, go to index.js and change the apiURI variable to the sandbox URL. Note you will have to use an API key in the sandbox.`)
        console.log(`You will be prompted to enter the Coinbase crypto currency ticker you would like to trade. For example: BTC, ETH, DASH, DOGE.\n`);
        console.log(`You will also be prompted to enter the amount of USD you would like to trade. Note that it can have more than two decimal places of precision. For example: 15, 20.5, 75.25\nNote you must have this USD amount in your default portfolio and it must be above the minimum amount to place an order. Some crpyto coins have minimums order amounts of around $5 or $10.\n`);
        
        const promptAnswers = await prompts();
        
        const baseCurrencyName = promptAnswers.coinToTrade.toUpperCase();
        const usdAmountToTrade = Number(promptAnswers.usdAmount);
        if (usdAmountToTrade < 0) {
            throw new Error("Amount can't be less than 0.");
        }

        let accountIDs = {};
        let lastPeakPrice;
        let lastValleyPrice;
        let highestFee = await returnHighestFee();

        const tradingConfig = {
            sellPositionDelta,
            buyPositionDelta,
            orderPriceDelta,
            highestFee
        };

        const productInfo = {
            baseCurrency: baseCurrencyName,
            quoteCurrency: quoteCurrencyName,
            productPair: baseCurrencyName + "-" + quoteCurrencyName
        };

        let positionInfo = {positionExists: false};

        //Retrieve product information:
        await getProductInfo(productInfo);

        //Retrieve account IDs:
        accountIDs = await getAccountIDs(productInfo);

        //activate websocket for price data:
        listenForPriceUpdates(productInfo.productPair);

        while (currentPrice == null) {
            await sleep(1000); //Get a price before starting
        }

        console.log("Bot trading has started.");
        console.log(`Starting price of ${baseCurrencyName} is: ${currentPrice}`);
        while (true) {
            try {
                const result = await coinbaseLibObject.getFearAndGreedIndexValue();
                const indexValueAsAPercent = Number(result.data[0].value) * .01;

                buyPositionDelta = .0015 + (.0275 * indexValueAsAPercent);
                sellPositionDelta = .03 - (.0275 * indexValueAsAPercent);

                console.log(`Buy position delta: ${buyPositionDelta * 100}%, sell position delta: ${sellPositionDelta * 100}%.`);
            } catch (err) {
                console.log("Error occured when calling the fear and greed index and calculating trading deltas. Ignoring and using the defaults instead.")
                buyPositionDelta = .015;
                sellPositionDelta = .015;
            }
            

            if (positionInfo.positionExists) {
                tradingConfig.highestFee = await returnHighestFee();
                await sleep(1000);
                const baseCurrencyAccount = await authedClient.getAccount(accountIDs.baseCurrencyAccountID); //Grab account information to view balance

                if (baseCurrencyAccount.available > 0) {

                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;

                    //Begin trying to sell position:
                    console.log(`Entering lose position... Bot will remain here until price shifts down by ${sellPositionDelta * 100}% and a profitable sell that clears the fees is possible.`);
                    await losePosition(positionInfo.balance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig);
                } else {
                    throw new Error(`Error, there is no ${productInfo.baseCurrency} balance available for use. Terminating program.`);
                }
            } else {
                tradingConfig.highestFee = await returnHighestFee();
                await sleep(1000);
                const quoteCurrencyAccount = await authedClient.getAccount(accountIDs.quoteCurrencyAccountID); //Grab account information to view balance
                const availableBalance = parseFloat(quoteCurrencyAccount.available);

                if (availableBalance > 0 && availableBalance >= usdAmountToTrade) {
                    const tradeBalance = usdAmountToTrade - balanceMinimum; //Subtract this dollar amount so that there is room for rounding errors

                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;

                    //Begin trying to buy a position:
                    console.log(`Entering gain position... Bot will remain here until price rises by ${buyPositionDelta * 100}%`);
                    await gainPosition(tradeBalance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig);
                } else {
                    throw new Error(`Error, there is not enough USD balance available for use. Terminating program.`);
                }
            }
        }
    } catch (err) {
        const message = "Error occurred in bot, shutting down. Check the logs for more information.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
        process.exit(1);
    }
}

momentumStrategyStart();
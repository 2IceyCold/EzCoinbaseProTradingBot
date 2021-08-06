function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function sellPosition(balance, positionInfo, currentPrice, authedClient, productInfo, tradingConfig) {
    try {
        const priceToSell = (currentPrice - (currentPrice * tradingConfig.orderPriceDelta)).toFixed(productInfo.quoteIncrementRoundValue);

        let orderSize;
        if (productInfo.baseIncrementRoundValue === 0) {
            orderSize = Math.trunc(balance);
        } else {
            orderSize = (balance).toFixed(productInfo.baseIncrementRoundValue);
        }

        const orderParams = {
            side: "sell",
            price: priceToSell,
            size: orderSize,
            product_id: productInfo.productPair,
            time_in_force: "FOK"
        };

        //Place sell order
        const order = await authedClient.placeOrder(orderParams);
        const orderID = order.id;

        //Loop to wait for order to be filled:
        for (let i = 0; i < 100 && positionInfo.positionExists === true; ++i) {
            let orderDetails;
            await sleep(6000); //wait 6 seconds
            try {
                orderDetails = await authedClient.getOrder(orderID); //Get latest order details
            } catch (err) {
                const message = "Error occured when attempting to get the order.";
                const errorMsg = new Error(err);
                console.log({ message, errorMsg, err });
                continue;
            }

            if (orderDetails.status === "done") {
                if (orderDetails.done_reason !== "filled") {
                    throw new Error("Sell order did not complete due to being filled? done_reason: " + orderDetails.done_reason);
                } else {
                    positionInfo.positionExists = false;

                    let profit = parseFloat(orderDetails.executed_value) - parseFloat(orderDetails.fill_fees) - positionInfo.positionAcquiredCost;
                    console.log(`Crypto sold, profit: ${profit}`);

                    if (!(profit > 0)) {
                        throw new Error("Sell was not profitable, terminating program. profit: " + profit);
                    } 
                }
            }
        }

        //Check if order wasn't filled and needs cancelled:
        if (positionInfo.positionExists === true) {
            const cancelOrder = await authedClient.cancelOrder(orderID);
            if (cancelOrder !== orderID) {
                throw new Error("Attempted to cancel failed order but it did not work. cancelOrderReturn: " + cancelOrder + "orderID: " + orderID);
            }
        }

    } catch (err) {
        const message = "Error occurred in sellPosition method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
    }
}

/**
 * This method places a buy limit order and loops waiting for it to be filled. Once filled it will update the positionInfo and end. If the
 * order ends for a reason other then filled it will throw an exception. If the order doesn't get filled after 1 minute it will cancel the
 * order and throw an exception.
 * 
 * @param {Number} balance 
 * @param {Object} positionInfo 
 * @param {Number} currentPrice 
 * @param {Object} authedClient 
 * @param {Object} productInfo 
 * @param {Object} tradingConfig 
 */
async function buyPosition(balance, positionInfo, currentPrice, authedClient, productInfo, tradingConfig) {
    try {
        const amountToSpend = balance - (balance * tradingConfig.highestFee);
        const priceToBuy = (currentPrice + (currentPrice * tradingConfig.orderPriceDelta)).toFixed(productInfo.quoteIncrementRoundValue);
        let orderSize;

        if (productInfo.baseIncrementRoundValue === 0) {
            orderSize = Math.trunc(amountToSpend / priceToBuy);
        } else {
            orderSize = (amountToSpend / priceToBuy).toFixed(productInfo.baseIncrementRoundValue);
        }

        const orderParams = {
            side: "buy",
            price: priceToBuy,
            size: orderSize,
            product_id: productInfo.productPair,
            time_in_force: "FOK"
        };


        //Place buy order
        const order = await authedClient.placeOrder(orderParams);
        const orderID = order.id;

        //Loop to wait for order to be filled:
        for (let i = 0; i < 100 && positionInfo.positionExists === false; ++i) {
            let orderDetails;
            await sleep(6000); //wait 6 seconds
            try {
                orderDetails = await authedClient.getOrder(orderID); //Get latest order details
            } catch (err) {
                const message = "Error occured when attempting to get the order.";
                const errorMsg = new Error(err);
                console.log({ message, errorMsg, err });
                continue;
            }

            if (orderDetails.status === "done") {
                if (orderDetails.done_reason !== "filled") {
                    throw new Error("Buy order did not complete due to being filled? done_reason: " + orderDetails.done_reason);
                } else {
                    //Update position info
                    positionInfo.positionExists = true;
                    positionInfo.positionAcquiredPrice = parseFloat(orderDetails.executed_value) / parseFloat(orderDetails.filled_size);
                    positionInfo.positionAcquiredCost = parseFloat(orderDetails.executed_value) + parseFloat(orderDetails.fill_fees);
                    positionInfo.balance = parseFloat(orderDetails.filled_size);

                    console.log("Crypto purchased, position info: ");
                    console.log(positionInfo);
                }
            }
        }

        //Check if order wasn't filled and needs cancelled
        if (positionInfo.positionExists === false) {
            const cancelOrder = await authedClient.cancelOrder(orderID);
            if (cancelOrder !== orderID) {
                throw new Error("Attempted to cancel failed order but it did not work. cancelOrderReturn: " + cancelOrder + "orderID: " + orderID);
            }
        }

    } catch (err) {
        const message = "Error occurred in buyPosition method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
    }
}

module.exports = {
    sellPosition,
    buyPosition,
}
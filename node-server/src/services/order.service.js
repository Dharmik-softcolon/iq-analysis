const Trade = require("../models/Trade");
const zerodhaService = require("./zerodha.service");
const { createLogger } = require("../utils/logger");
const { getIO } = require("./websocket.service");
const signalService = require("./signal.service");

const logger = createLogger("OrderService");

const LOT_SIZE = 75;

class OrderService {
    async processSignal(signalData, userId) {
        logger.info(`Processing signal: ${signalData.signalId}`);

        // Check if it's a STRADDLE or regular signal
        if (signalData.type === "STRADDLE") {
            return await this._processStraddleEntry(signalData, userId);
        }

        return await this._processDirectionalEntry(signalData, userId);
    }

    async _processDirectionalEntry(signalData, userId) {
        const {
            signalId,
            direction,
            optionType,
            strike,
            expiry,
            entryPremium,
            lots,
            t1Lots,
            t2Lots,
            t3Lots,
            t1Target,
            t2Target,
            slPremium,
            adverseIndexSL,
            iaeScore,
            marketState,
            entryWindow,
            capitalDeployed,
            riskAmount,
        } = signalData;

        // Build trading symbol
        const tradingsymbol = zerodhaService.buildOptionSymbol(
            "NIFTY", expiry, strike, optionType
        );

        // Place entry order
        const orderResult = await zerodhaService.placeOrder(userId, {
            tradingsymbol,
            transaction_type: "BUY",
            quantity: lots * LOT_SIZE,
            order_type: "MARKET",
        });

        if (!orderResult.success) {
            logger.error(`Entry order failed: ${orderResult.error}`);
            return { success: false, error: orderResult.error };
        }

        // Save trade to DB
        const trade = await Trade.create({
            signalId,
            userId,
            direction,
            optionType,
            strike,
            expiry,
            iaeScore,
            marketState,
            entryWindow,
            entryPremium,
            totalLots: lots,
            t1Lots,
            t2Lots,
            t3Lots,
            t1Target,
            t2Target,
            slPremium,
            adverseIndexSL,
            capitalDeployed,
            riskAmount,
            status: "ACTIVE",
            entryOrderId: orderResult.orderId,
            orders: [{
                orderId: orderResult.orderId,
                orderType: "ENTRY",
                lots,
                premium: entryPremium,
                status: "PLACED",
                timestamp: new Date(),
            }],
        });

        // Emit to UI via WebSocket
        getIO().emit("trade:entry", {
            trade: trade.toObject(),
            message: `${direction} ${optionType} ${strike} entered at ₹${entryPremium}`,
        });

        logger.info(
            `Trade saved: ${signalId} | ${direction} ${optionType} ${strike}`
        );
        return { success: true, tradeId: trade._id, orderId: orderResult.orderId };
    }

    async _processStraddleEntry(signalData, userId) {
        const { strike, lots, ce_premium, pe_premium, expiry } = signalData;

        const ceSymbol = zerodhaService.buildOptionSymbol(
            "NIFTY", expiry, strike, "CE"
        );
        const peSymbol = zerodhaService.buildOptionSymbol(
            "NIFTY", expiry, strike, "PE"
        );

        // Place both legs simultaneously
        const [ceOrder, peOrder] = await Promise.all([
            zerodhaService.placeOrder(userId, {
                tradingsymbol: ceSymbol,
                transaction_type: "BUY",
                quantity: lots * LOT_SIZE,
            }),
            zerodhaService.placeOrder(userId, {
                tradingsymbol: peSymbol,
                transaction_type: "BUY",
                quantity: lots * LOT_SIZE,
            }),
        ]);

        logger.info(`Straddle entered: CE ${ceOrder.orderId} | PE ${peOrder.orderId}`);

        getIO().emit("trade:straddle", {
            message: `Straddle entered at ${strike} | CE:${ce_premium} PE:${pe_premium}`,
            ceOrderId: ceOrder.orderId,
            peOrderId: peOrder.orderId,
        });

        return { success: true, ceOrderId: ceOrder.orderId, peOrderId: peOrder.orderId };
    }

    async processExit(exitData, userId) {
        const {
            signalId,
            type,
            lots,
            strike,
            optionType,
            expiry,
            exitPremium,
            reason,
        } = exitData;

        logger.info(`Processing exit: ${type} | ${signalId} | ${reason}`);

        const tradingsymbol = zerodhaService.buildOptionSymbol(
            "NIFTY", expiry, strike, optionType
        );

        // Place exit order (SELL)
        const orderResult = await zerodhaService.placeOrder(userId, {
            tradingsymbol,
            transaction_type: "SELL",
            quantity: lots * LOT_SIZE,
            order_type: "MARKET",
        });

        if (!orderResult.success) {
            logger.error(`Exit order failed: ${orderResult.error}`);
            return { success: false, error: orderResult.error };
        }

        // Update trade in DB
        const trade = await Trade.findOne({ signalId });
        if (!trade) return { success: false, error: "Trade not found" };

        const pnl = (exitPremium - trade.entryPremium) * lots * LOT_SIZE;

        // Update specific tranche
        const updateFields = {};

        if (type === "T1") {
            updateFields.t1Exited = true;
            updateFields.t1ExitPremium = exitPremium;
            updateFields.t1ExitTime = new Date();
            updateFields.t1PnL = pnl;
            updateFields.status = "PARTIAL";
        } else if (type === "T2") {
            updateFields.t2Exited = true;
            updateFields.t2ExitPremium = exitPremium;
            updateFields.t2ExitTime = new Date();
            updateFields.t2PnL = pnl;
            updateFields.status = "PARTIAL";
        } else if (type === "T3_TRAIL") {
            updateFields.t3Exited = true;
            updateFields.t3ExitPremium = exitPremium;
            updateFields.t3ExitTime = new Date();
            updateFields.t3PnL = pnl;
            updateFields.status = "CLOSED";
            updateFields.exitReason = reason;
            updateFields.exitTime = new Date();
        } else {
            // SL / ADVERSE / FORCE — exit all
            updateFields.status =
                type === "SL" || type === "ADVERSE_SL" ? "SL_HIT" : "CLOSED";
            updateFields.exitReason = reason;
            updateFields.exitTime = new Date();
        }

        // Update total P&L
        updateFields.totalPnL = (trade.t1PnL || 0) +
            (trade.t2PnL || 0) +
            (trade.t3PnL || 0) +
            pnl;

        const updatedTrade = await Trade.findOneAndUpdate(
            { signalId },
            { $set: updateFields },
            { new: true }
        );

        // Emit to UI
        getIO().emit("trade:exit", {
            trade: updatedTrade.toObject(),
            exitType: type,
            pnl,
            reason,
        });

        return { success: true, orderId: orderResult.orderId, pnl };
    }
}

module.exports = new OrderService();
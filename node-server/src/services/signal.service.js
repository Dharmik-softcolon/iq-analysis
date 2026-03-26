const { createLogger } = require("../utils/logger");
const Trade = require("../models/Trade");
const Order = require("../models/Order");
const { getIO } = require("./websocket.service");

const logger = createLogger("SignalService");

/**
 * Signal Service
 * Validates incoming signals from Python engine
 * before passing to order service
 * Also tracks signal history for analytics
 */
class SignalService {

    // ─────────────────────────────────────────────
    // VALIDATE INCOMING SIGNAL
    // ─────────────────────────────────────────────
    validateSignal(signalData) {
        const errors = [];

        // Required fields
        const required = [
            "signalId",
            "direction",
            "optionType",
            "strike",
            "expiry",
            "entryPremium",
            "lots",
            "iaeScore",
        ];

        required.forEach((field) => {
            if (
                signalData[field] === undefined ||
                signalData[field] === null ||
                signalData[field] === ""
            ) {
                errors.push(`Missing required field: ${field}`);
            }
        });

        if (errors.length > 0) {
            return { valid: false, errors };
        }

        // Direction validation
        if (!["BULL", "BEAR"].includes(signalData.direction)) {
            errors.push(
                `Invalid direction: ${signalData.direction}`
            );
        }

        // Option type validation
        if (!["CE", "PE"].includes(signalData.optionType)) {
            errors.push(
                `Invalid optionType: ${signalData.optionType}`
            );
        }

        // IAE score validation
        if (signalData.iaeScore < 4 || signalData.iaeScore > 8) {
            errors.push(
                `Invalid IAE score: ${signalData.iaeScore} (must be 4-8)`
            );
        }

        // Strike validation
        if (signalData.strike <= 0 || signalData.strike % 50 !== 0) {
            errors.push(
                `Invalid strike: ${signalData.strike} (must be multiple of 50)`
            );
        }

        // Premium validation
        if (signalData.entryPremium <= 0) {
            errors.push(
                `Invalid entry premium: ${signalData.entryPremium}`
            );
        }

        // Lots validation
        if (signalData.lots <= 0 || signalData.lots > 100) {
            errors.push(
                `Invalid lots: ${signalData.lots} (must be 1-100)`
            );
        }

        // Direction/OptionType consistency check
        if (
            signalData.direction === "BULL" &&
            signalData.optionType !== "CE"
        ) {
            errors.push("BULL direction should use CE options");
        }

        if (
            signalData.direction === "BEAR" &&
            signalData.optionType !== "PE"
        ) {
            errors.push("BEAR direction should use PE options");
        }

        // T1/T2/T3 lots must add up
        const lotSum =
            (signalData.t1Lots || 0) +
            (signalData.t2Lots || 0) +
            (signalData.t3Lots || 0);

        if (lotSum !== signalData.lots) {
            errors.push(
                `T1+T2+T3 lots (${lotSum}) must equal total lots (${signalData.lots})`
            );
        }

        if (errors.length > 0) {
            return { valid: false, errors };
        }

        return { valid: true, errors: [] };
    }

    // ─────────────────────────────────────────────
    // VALIDATE EXIT SIGNAL
    // ─────────────────────────────────────────────
    validateExitSignal(exitData) {
        const errors = [];

        const required = [
            "signalId",
            "type",
            "lots",
            "strike",
            "optionType",
            "expiry",
        ];

        required.forEach((field) => {
            if (
                exitData[field] === undefined ||
                exitData[field] === null
            ) {
                errors.push(`Missing required field: ${field}`);
            }
        });

        const validTypes = [
            "T1",
            "T2",
            "T3_TRAIL",
            "SL",
            "ADVERSE_SL",
            "FORCE",
            "MANUAL",
            "EMERGENCY",
        ];

        if (!validTypes.includes(exitData.type)) {
            errors.push(`Invalid exit type: ${exitData.type}`);
        }

        if (exitData.lots <= 0) {
            errors.push(`Invalid exit lots: ${exitData.lots}`);
        }

        if (errors.length > 0) {
            return { valid: false, errors };
        }

        return { valid: true, errors: [] };
    }

    // ─────────────────────────────────────────────
    // CHECK DUPLICATE SIGNAL
    // ─────────────────────────────────────────────
    async isDuplicateSignal(signalId) {
        try {
            const existing = await Trade.findOne({ signalId });
            return !!existing;
        } catch (err) {
            logger.error(`Duplicate check error: ${err.message}`);
            return false;
        }
    }

    // ─────────────────────────────────────────────
    // CHECK CAPITAL LIMITS
    // ─────────────────────────────────────────────
    async checkCapitalLimits(signalData, userId) {
        try {
            const User = require("../models/User");
            const user = await User.findById(userId);

            if (!user) {
                return {
                    allowed: false,
                    reason: "User not found",
                };
            }

            const capital = user.capital || 500000;
            const deployed = signalData.capitalDeployed || 0;
            const maxDeployed = capital * 0.15; // 15% max

            if (deployed > maxDeployed) {
                return {
                    allowed: false,
                    reason: `Capital deployed (₹${deployed}) exceeds 15% limit (₹${maxDeployed})`,
                };
            }

            // Check daily loss
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayTrades = await Trade.find({
                userId,
                createdAt: { $gte: today },
                status: { $in: ["CLOSED", "SL_HIT"] },
            });

            const todayLoss = todayTrades.reduce(
                (sum, t) => sum + Math.min(0, t.totalPnL || 0),
                0
            );

            const dailyLossLimit = capital * 0.06; // 6%

            if (Math.abs(todayLoss) >= dailyLossLimit) {
                return {
                    allowed: false,
                    reason: `Daily loss limit reached: ₹${Math.abs(todayLoss).toFixed(0)}`,
                };
            }

            // Check max trades per day
            const todayAllTrades = await Trade.find({
                userId,
                createdAt: { $gte: today },
            });

            if (todayAllTrades.length >= 2) {
                return {
                    allowed: false,
                    reason: "Maximum 2 trades per day reached",
                };
            }

            return { allowed: true };

        } catch (err) {
            logger.error(`Capital check error: ${err.message}`);
            return { allowed: true }; // Allow on error to not block trading
        }
    }

    // ─────────────────────────────────────────────
    // SAVE ORDER RECORD
    // ─────────────────────────────────────────────
    async saveOrderRecord(orderData) {
        try {
            const order = await Order.create({
                orderId: orderData.orderId,
                userId: orderData.userId,
                tradeId: orderData.tradeId,
                signalId: orderData.signalId,
                tradingsymbol: orderData.tradingsymbol,
                exchange: orderData.exchange || "NFO",
                transactionType: orderData.transactionType,
                orderType: orderData.orderType || "MARKET",
                product: orderData.product || "MIS",
                quantity: orderData.quantity,
                lots: orderData.lots,
                price: orderData.price || 0,
                averagePrice: orderData.averagePrice || 0,
                filledQuantity: orderData.filledQuantity || orderData.quantity,
                status: orderData.status || "COMPLETE",
                orderPurpose: orderData.orderPurpose,
                entryPrice: orderData.entryPrice || 0,
                pnl: orderData.pnl || 0,
                placedAt: new Date(),
                zerodhaResponse: orderData.zerodhaResponse || {},
            });

            logger.info(
                `Order saved: ${order.orderId} | ` +
                `${order.orderPurpose} | ` +
                `${order.transactionType} ${order.lots} lots`
            );

            return order;
        } catch (err) {
            logger.error(`Save order error: ${err.message}`);
            return null;
        }
    }

    // ─────────────────────────────────────────────
    // UPDATE ORDER STATUS
    // ─────────────────────────────────────────────
    async updateOrderStatus(orderId, status, averagePrice = 0) {
        try {
            const updated = await Order.findOneAndUpdate(
                { orderId },
                {
                    $set: {
                        status,
                        averagePrice,
                        executedAt: status === "COMPLETE" ? new Date() : undefined,
                        updatedAt: new Date(),
                    },
                },
                { new: true }
            );

            if (updated) {
                logger.info(
                    `Order updated: ${orderId} → ${status}`
                );
            }

            return updated;
        } catch (err) {
            logger.error(`Update order error: ${err.message}`);
            return null;
        }
    }

    // ─────────────────────────────────────────────
    // GET ACTIVE ORDERS
    // ─────────────────────────────────────────────
    async getActiveOrders(userId) {
        try {
            return await Order.find({
                userId,
                status: { $in: ["PLACED", "PENDING", "PARTIAL"] },
            }).sort({ placedAt: -1 });
        } catch (err) {
            logger.error(`Get active orders error: ${err.message}`);
            return [];
        }
    }

    // ─────────────────────────────────────────────
    // GET TODAY'S ORDERS
    // ─────────────────────────────────────────────
    async getTodayOrders(userId) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            return await Order.find({
                userId,
                placedAt: { $gte: today },
            }).sort({ placedAt: -1 });
        } catch (err) {
            logger.error(`Get today orders error: ${err.message}`);
            return [];
        }
    }

    // ─────────────────────────────────────────────
    // BROADCAST SIGNAL TO UI
    // ─────────────────────────────────────────────
    broadcastSignalReceived(signalData) {
        try {
            getIO().emit("signal:received", {
                signalId: signalData.signalId,
                direction: signalData.direction,
                optionType: signalData.optionType,
                strike: signalData.strike,
                iaeScore: signalData.iaeScore,
                marketState: signalData.marketState,
                entryPremium: signalData.entryPremium,
                lots: signalData.lots,
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
            logger.error(`Broadcast error: ${err.message}`);
        }
    }

    // ─────────────────────────────────────────────
    // MAP EXIT PURPOSE
    // ─────────────────────────────────────────────
    getOrderPurposeFromExitType(exitType) {
        const map = {
            T1: "T1_EXIT",
            T2: "T2_EXIT",
            T3_TRAIL: "T3_EXIT",
            SL: "SL_EXIT",
            ADVERSE_SL: "ADVERSE_SL_EXIT",
            FORCE: "FORCE_EXIT",
            MANUAL: "MANUAL_EXIT",
            EMERGENCY: "EMERGENCY_EXIT",
        };
        return map[exitType] || "FORCE_EXIT";
    }
}

module.exports = new SignalService();
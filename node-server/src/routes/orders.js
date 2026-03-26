const express = require("express");
const router = express.Router();
const orderService = require("../services/order.service");
const { createLogger } = require("../utils/logger");
const authMiddleware = require("../middleware/auth");

const logger = createLogger("OrderRoutes");

// POST /api/orders/signal
// Called by Python engine with trade signal
router.post("/signal", async (req, res) => {
    try {
        // Validate internal key
        const internalKey = req.headers["x-internal-key"];
        if (internalKey !== "whalehq-python-engine") {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const signalData = req.body;
        logger.info(
            `Signal received: ${signalData.signalId} | ` +
            `${signalData.direction} ${signalData.optionType} | ` +
            `IAE: ${signalData.iaeScore}`
        );

        // Get active user (single user system)
        const User = require("../models/User");
        const user = await User.findOne({ isAutoTrading: true });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "No active auto-trading user",
            });
        }

        const result = await orderService.processSignal(
            signalData,
            user._id
        );

        res.json(result);
    } catch (err) {
        logger.error(`Signal processing error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/orders/exit
// Called by Python engine with exit signal
router.post("/exit", async (req, res) => {
    try {
        const internalKey = req.headers["x-internal-key"];
        if (internalKey !== "whalehq-python-engine") {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const exitData = req.body;
        logger.info(
            `Exit signal: ${exitData.type} | ` +
            `${exitData.signalId} | ${exitData.reason}`
        );

        const User = require("../models/User");
        const user = await User.findOne({ isAutoTrading: true });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "No active auto-trading user",
            });
        }

        const result = await orderService.processExit(exitData, user._id);
        res.json(result);
    } catch (err) {
        logger.error(`Exit processing error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/orders/manual-exit
// Manual emergency exit from UI
router.post("/manual-exit", authMiddleware, async (req, res) => {
    try {
        const { signalId, reason } = req.body;

        const Trade = require("../models/Trade");
        const trade = await Trade.findOne({ signalId, status: "ACTIVE" });

        if (!trade) {
            return res.status(404).json({
                success: false,
                message: "Active trade not found",
            });
        }

        const result = await orderService.processExit(
            {
                signalId,
                type: "MANUAL",
                lots: trade.totalLots,
                strike: trade.strike,
                optionType: trade.optionType,
                expiry: trade.expiry,
                exitPremium: 0, // Will be filled by market order
                reason: reason || "Manual exit from UI",
            },
            req.user._id
        );

        res.json(result);
    } catch (err) {
        logger.error(`Manual exit error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/orders/active
router.get("/active", authMiddleware, async (req, res) => {
    try {
        const Trade = require("../models/Trade");
        const trades = await Trade.find({
            userId: req.user._id,
            status: { $in: ["ACTIVE", "PARTIAL"] },
        }).sort({ createdAt: -1 });

        res.json({ success: true, trades });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
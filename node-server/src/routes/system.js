const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const zerodhaService = require("../services/zerodha.service");
const User = require("../models/User");
const { createLogger } = require("../utils/logger");
const { getIO } = require("../services/websocket.service");

const logger = createLogger("SystemRoutes");

// POST /api/system/state
// Called by Python engine to push system state
router.post("/state", async (req, res) => {
    try {
        const internalKey = req.headers["x-internal-key"];
        if (internalKey !== "whalehq-python-engine") {
            return res.status(401).json({ success: false });
        }

        const stateData = req.body;

        // Store latest state globally
        global.latestSystemState = stateData;

        // Update session in DB
        const Session = require("../models/Session");
        const today = new Date().toISOString().split("T")[0];

        await Session.findOneAndUpdate(
            { date: today },
            {
                $set: {
                    marketState: stateData.marketState,
                    iaeScore: stateData.iaeScore,
                    iaeBreakdown: stateData.iaeBreakdown,
                    direction: stateData.direction,
                    systemMode: stateData.systemMode,
                    tradesCount: stateData.tradesToday,
                    dailyPnL: stateData.dailyPnL,
                    lastUpdated: new Date(),
                },
            },
            { upsert: true, new: true }
        );

        // Broadcast to all UI clients
        getIO().emit("system:state", stateData);

        res.json({ success: true });
    } catch (err) {
        logger.error(`State update error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/system/state
// UI fetches latest state
router.get("/state", authMiddleware, async (req, res) => {
    try {
        res.json({
            success: true,
            state: global.latestSystemState || {
                systemMode: "STANDBY",
                marketState: "UNKNOWN",
                iaeScore: 0,
                direction: "NO_TRADE",
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/market/chain

router.get("/market/chain", async (req, res) => {
    try {
        const internalKey = req.headers["x-internal-key"];
        if (internalKey !== "whalehq-python-engine") {
            return res.status(401).json({ success: false });
        }

        const user = await User.findOne({ isAutoTrading: true });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "No active user",
            });
        }

        const isTokenValid = user.tokenExpiry && new Date(user.tokenExpiry) > new Date();

        // Initialize kite if needed
        if (!zerodhaService.getKite(user._id)) {
            if (user.zerodhaApiKey && user.zerodhaAccessToken && isTokenValid) {
                await zerodhaService.initializeKite(
                    user._id,
                    user.zerodhaApiKey,
                    user.zerodhaAccessToken
                );
            } else {
                return res.status(401).json({ success: false, message: "Zerodha token expired or missing. Please login again." });
            }
        }

        // Use merged data (Zerodha + Opstra/NSE)
        const marketData = await zerodhaService.getCompleteMarketData(
            user._id, "NIFTY"
        );

        res.json(marketData);
    } catch (err) {
        logger.error(`Chain fetch error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/market/price
router.get("/market/price", async (req, res) => {
    try {
        const state = global.latestSystemState || {};
        res.json({
            niftyLTP: state.niftyLTP || 0,
            vwap: state.vwap || 0,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/system/indices
router.get("/indices", authMiddleware, async (req, res) => {
    try {
        // Find the active user or fallback to logged in user
        let user = await User.findOne({ isAutoTrading: true });
        if (!user) {
            user = await User.findById(req.user._id);
        }
        
        const userId = user._id;
        const isTokenValid = user.tokenExpiry && new Date(user.tokenExpiry) > new Date();

        // Initialize kite if needed and credentials exist
        if (!zerodhaService.getKite(userId)) {
            if (user.zerodhaApiKey && user.zerodhaAccessToken && isTokenValid) {
                await zerodhaService.initializeKite(
                    userId,
                    user.zerodhaApiKey,
                    user.zerodhaAccessToken
                );
            } else {
                return res.status(401).json({ success: false, message: "Zerodha token expired" });
            }
        }

        const indices = await zerodhaService.getIndicesQuotes(userId);
        if (!indices) {
            return res.status(400).json({ success: false, message: "Kite session not initialized" });
        }

        res.json({ success: true, data: indices });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/system/margins
router.get("/margins", authMiddleware, async (req, res) => {
    try {
        let user = await User.findOne({ isAutoTrading: true });
        if (!user) user = await User.findById(req.user._id);

        const userId = user._id;
        const isTokenValid = user.tokenExpiry && new Date(user.tokenExpiry) > new Date();

        if (!zerodhaService.getKite(userId)) {
            if (user.zerodhaApiKey && user.zerodhaAccessToken && isTokenValid) {
                await zerodhaService.initializeKite(
                    userId,
                    user.zerodhaApiKey,
                    user.zerodhaAccessToken
                );
            } else {
                return res.status(401).json({ success: false, message: "Zerodha token expired" });
            }
        }

        const margins = await zerodhaService.getMargins(userId);
        if (!margins) {
            return res.status(400).json({ success: false, message: "Kite session not initialized" });
        }

        res.json({ success: true, data: margins });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/system/toggle-auto
// Enable/disable auto trading
router.post("/toggle-auto", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.isAutoTrading = !user.isAutoTrading;
        await user.save();

        logger.info(
            `Auto trading ${user.isAutoTrading ? "ENABLED" : "DISABLED"} ` +
            `for user: ${user.email}`
        );

        getIO().emit("system:autoTrading", {
            enabled: user.isAutoTrading,
            userId: user._id,
        });

        res.json({
            success: true,
            isAutoTrading: user.isAutoTrading,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/system/settings
router.put("/settings", authMiddleware, async (req, res) => {
    try {
        const { capital, isChoppyMonth, isTrendMonth } = req.body;

        const updateFields = {};
        if (capital) updateFields.capital = capital;

        await User.findByIdAndUpdate(req.user._id, {
            $set: updateFields,
        });

        // Store month settings globally for Python engine
        global.monthSettings = {
            isChoppyMonth: isChoppyMonth || false,
            isTrendMonth: isTrendMonth || false,
        };

        res.json({ success: true, message: "Settings updated" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/market/candles
// Returns today's 1-min candles for VWAP calculation
router.get("/market/candles", async (req, res) => {
    try {
        const internalKey = req.headers["x-internal-key"];
        if (internalKey !== "whalehq-python-engine") {
            return res.status(401).json({ success: false });
        }

        const user = await User.findOne({ isAutoTrading: true });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "No active user",
            });
        }

        if (!zerodhaService.getKite(user._id)) {
            await zerodhaService.initializeKite(
                user._id,
                user.zerodhaApiKey,
                user.zerodhaAccessToken
            );
        }

        const kite = zerodhaService.getKite(user._id);

        // Get today's 1-min candles for NIFTY 50
        const today = new Date();
        const fromDate = new Date(today);
        fromDate.setHours(9, 15, 0, 0);

        const candles = await kite.getHistoricalData(
            "256265", // NIFTY 50 instrument token
            "minute",
            fromDate,
            today
        );

        const formatted = candles.map((c) => ({
            timestamp: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
        }));

        res.json({ success: true, candles: formatted });
    } catch (err) {
        logger.error(`Candles fetch error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/alerts/critical
// Called by Python for critical alerts
router.post("/alerts/critical", async (req, res) => {
    try {
        const { message, timestamp } = req.body;

        const logger = require("../utils/logger").createLogger(
            "CriticalAlert"
        );
        logger.error(`CRITICAL: ${message}`);

        // Emit to UI
        getIO().emit("system:critical", { message, timestamp });

        // Store in DB
        const Session = require("../models/Session");
        const today = new Date().toISOString().split("T")[0];
        await Session.findOneAndUpdate(
            { date: today },
            {
                $push: {
                    alerts: {
                        type: "CRITICAL",
                        message,
                        timestamp: new Date(),
                    },
                },
            },
            { upsert: true }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// POST /api/system/session-reset
// Called by Python at start of each new session
router.post("/session-reset", async (req, res) => {
    try {
        const internalKey = req.headers["x-internal-key"];
        if (internalKey !== "whalehq-python-engine") {
            return res.status(401).json({ success: false });
        }

        const { date, capital } = req.body;

        const Session = require("../models/Session");
        await Session.findOneAndUpdate(
            { date },
            {
                $set: {
                    date,
                    capitalStart: capital,
                    tradesCount: 0,
                    dailyPnL: 0,
                    lastUpdated: new Date(),
                },
            },
            { upsert: true }
        );

        getIO().emit("system:sessionReset", { date, capital });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// POST /api/orders/emergency-close
// Emergency close all positions
router.post("/orders/emergency-close", async (req, res) => {
    try {
        const { reason } = req.body;
        const logger = require("../utils/logger")
            .createLogger("EmergencyClose");

        logger.error(`EMERGENCY CLOSE ALL: ${reason}`);

        const User = require("../models/User");
        const Trade = require("../models/Trade");

        // Get active user
        const user = await User.findOne({ isAutoTrading: true });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "No active user found",
            });
        }

        // Get all active/partial trades
        const activeTrades = await Trade.find({
            userId: user._id,
            status: { $in: ["ACTIVE", "PARTIAL"] },
        });

        logger.error(
            `Emergency closing ${activeTrades.length} positions`
        );

        const results = [];

        for (const trade of activeTrades) {
            try {
                // Place market sell order for remaining lots
                const remainingLots = trade.totalLots;
                const tradingsymbol = zerodhaService.buildOptionSymbol(
                    "NIFTY",
                    trade.expiry,
                    trade.strike,
                    trade.optionType
                );

                const orderResult = await zerodhaService.placeOrder(
                    user._id,
                    {
                        tradingsymbol,
                        transaction_type: "SELL",
                        quantity: remainingLots * parseInt(process.env.LOT_SIZE || "65", 10),
                        order_type: "MARKET",
                    }
                );

                // Update trade status in DB
                await Trade.findByIdAndUpdate(trade._id, {
                    $set: {
                        status: "CLOSED",
                        exitReason: `EMERGENCY: ${reason}`,
                        exitTime: new Date(),
                    },
                });

                results.push({
                    tradeId: trade._id,
                    success: orderResult.success,
                    orderId: orderResult.orderId,
                });

                logger.error(
                    `Emergency closed: ${tradingsymbol} | ` +
                    `Order: ${orderResult.orderId}`
                );

            } catch (tradeErr) {
                logger.error(
                    `Failed to close trade ${trade._id}: ${tradeErr.message}`
                );
                results.push({
                    tradeId: trade._id,
                    success: false,
                    error: tradeErr.message,
                });
            }
        }

        // Emit to UI
        getIO().emit("system:emergencyClose", {
            reason,
            tradesAffected: activeTrades.length,
            results,
            timestamp: new Date().toISOString(),
        });

        // Disable auto trading after emergency close
        await User.findByIdAndUpdate(user._id, {
            $set: { isAutoTrading: false },
        });

        logger.error(
            `Emergency close complete. ` +
            `Auto trading DISABLED. ` +
            `${results.filter((r) => r.success).length}/` +
            `${activeTrades.length} closed successfully.`
        );

        res.json({
            success: true,
            message: `Emergency closed ${activeTrades.length} positions`,
            results,
        });

    } catch (err) {
        logger.error(`Emergency close route error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: err.message,
        });
    }
});

module.exports = router;
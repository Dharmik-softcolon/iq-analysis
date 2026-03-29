require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");

const connectDB = require("./config/db");
const { initIO } = require("./services/websocket.service");
const { createLogger } = require("./utils/logger");
const { fetchAndSync } = require("./services/ivSync.service");

// Routes
const authRoutes = require("./routes/auth");
const orderRoutes = require("./routes/orders");
const tradeRoutes = require("./routes/trades");
const systemRoutes = require("./routes/system");

const logger = createLogger("Server");

const app = express();
const server = http.createServer(app);

// Initialize WebSocket
initIO(server);

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
}));
app.use(express.json());
app.use(morgan("combined"));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: { success: false, message: "Too many requests" },
});
const orderLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: { success: false, message: "Order rate limit exceeded" },
});
app.use("/api/", apiLimiter);
app.use("/api/orders/", orderLimiter);

// ── Daily Session Reset Cron ──────────────────
// Runs at 09:15 IST every weekday
// Resets daily P&L tracking in Node side
cron.schedule(
    "45 3 * * 1-5",  // 09:15 IST = 03:45 UTC
    async () => {
        const logger = createLogger("DailyCron");
        logger.info("Daily session reset cron fired");

        try {
            const Session = require("./models/Session");
            const today = new Date().toISOString().split("T")[0];

            await Session.findOneAndUpdate(
                { date: today },
                {
                    $setOnInsert: {
                        date: today,
                        tradesCount: 0,
                        dailyPnL: 0,
                        lastUpdated: new Date(),
                    },
                },
                { upsert: true }
            );

            // Broadcast reset to UI
            const { getIO } = require("./services/websocket.service");
            getIO().emit("system:dailyReset", {
                date: today,
                time: new Date().toISOString(),
            });

            logger.info(`Session created for ${today}`);
        } catch (err) {
            logger.error(`Daily cron error: ${err.message}`);
        }
    },
    {
        timezone: "Asia/Kolkata",
    }
);

// ── EOD Summary Cron ─────────────────────────
// Runs at 15:35 IST every weekday
cron.schedule(
    "5 10 * * 1-5",  // 15:35 IST = 10:05 UTC
    async () => {
        const logger = createLogger("EODCron");
        logger.info("EOD summary cron fired");

        try {
            const Trade = require("./models/Trade");
            const Session = require("./models/Session");
            const today = new Date().toISOString().split("T")[0];
            const todayStart = new Date(today);

            // Calculate today's stats
            const todayTrades = await Trade.find({
                createdAt: { $gte: todayStart },
                status: { $in: ["CLOSED", "SL_HIT"] },
            });

            const dailyPnL = todayTrades.reduce(
                (sum, t) => sum + (t.totalPnL || 0), 0
            );

            await Session.findOneAndUpdate(
                { date: today },
                {
                    $set: {
                        tradesCount: todayTrades.length,
                        dailyPnL,
                        lastUpdated: new Date(),
                    },
                },
                { upsert: true }
            );

            logger.info(
                `EOD: ${todayTrades.length} trades | P&L: ₹${dailyPnL}`
            );

        } catch (err) {
            logger.error(`EOD cron error: ${err.message}`);
        }
    },
    {
        timezone: "Asia/Kolkata",
    }
);

// ── Daily IV Sync Cron ────────────────────────────────
// Runs at 17:00 IST every weekday (market close + 30 min)
// Fetches latest IV from Sensibull and fills any missing dates in MongoDB
cron.schedule(
    "0 17 * * 1-5",
    async () => {
        const cronLogger = createLogger("IVSyncCron");
        cronLogger.info("Daily IV sync cron fired (17:00 IST)");
        try {
            const result = await fetchAndSync();
            cronLogger.info(
                `IV sync done | Inserted: ${result.inserted} | ` +
                `Total in DB: ${result.existing + result.inserted}`
            );
        } catch (err) {
            cronLogger.error(`IV sync cron error: ${err.message}`);
        }
    },
    {
        timezone: "Asia/Kolkata",
    }
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/trades", tradeRoutes);
app.use("/api/system", systemRoutes);

// Also handle market routes under /api/market
app.use("/api/market", systemRoutes);

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "6.0",
    });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
});

// ── Restore Zerodha Sessions on Startup ───────
// Re-initialises Kite for all users who have a valid (non-expired) access token
// so that market data and order placement work immediately after a server restart
async function restoreZerodhaSessions() {
    try {
        const User = require("./models/User");
        const zerodhaService = require("./services/zerodha.service");

        const users = await User.find({
            zerodhaAccessToken: { $exists: true, $ne: null },
            zerodhaApiKey: { $exists: true, $ne: null },
            isActive: true,
        });

        let restored = 0;
        for (const user of users) {
            // Skip expired tokens (Zerodha tokens expire at midnight IST)
            if (user.tokenExpiry && new Date() > user.tokenExpiry) {
                logger.warn(
                    `Skipping expired token for user: ${user.email}`
                );
                continue;
            }

            try {
                await zerodhaService.initializeKite(
                    user._id,
                    user.zerodhaApiKey,
                    user.zerodhaAccessToken
                );
                restored++;
                logger.info(
                    `Zerodha session restored for: ${user.email}`
                );
            } catch (err) {
                logger.error(
                    `Failed to restore session for ${user.email}: ${err.message}`
                );
            }
        }

        logger.info(
            `Zerodha sessions restored: ${restored}/${users.length} users`
        );
    } catch (err) {
        logger.error(`Session restore error: ${err.message}`);
    }
}

// Start server
const PORT = process.env.PORT || 4000;

const start = async () => {
    await connectDB();

    // Restore Zerodha sessions after DB is connected
    await restoreZerodhaSessions();

    // ── Startup IV Sync ───────────────────────────────
    // Fills any missing IV history dates in MongoDB from Sensibull.
    // Non-blocking: server starts immediately even if this fails.
    fetchAndSync()
        .then((r) => {
            if (r.inserted > 0) {
                logger.info(
                    `Startup IV sync: ${r.inserted} new records inserted | ` +
                    `Total IV history: ${r.existing + r.inserted} days`
                );
            } else {
                logger.info(
                    `Startup IV sync: MongoDB already up to date ` +
                    `(${r.existing} days in history)`
                );
            }
        })
        .catch((err) =>
            logger.warn(`Startup IV sync failed (non-critical): ${err.message}`)
        );

    server.listen(PORT, () => {
        logger.info(`WhaleHQ Server running on port ${PORT}`);
    });
};

start();
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

// Start server
const PORT = process.env.PORT || 4000;

const start = async () => {
    await connectDB();
    server.listen(PORT, () => {
        logger.info(`WhaleHQ Server running on port ${PORT}`);
    });
};

start();
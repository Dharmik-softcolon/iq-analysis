const express = require("express");
const router = express.Router();
const Trade = require("../models/Trade");
const Session = require("../models/Session");
const authMiddleware = require("../middleware/auth");

// GET /api/trades/history
router.get("/history", authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, from, to } = req.query;

        const filter = { userId: req.user._id };
        if (status) filter.status = status;
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to) filter.createdAt.$lte = new Date(to);
        }

        const trades = await Trade.find(filter)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Trade.countDocuments(filter);

        res.json({
            success: true,
            trades,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/trades/stats
router.get("/stats", authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;

        const trades = await Trade.find({
            userId,
            status: { $in: ["CLOSED", "SL_HIT"] },
        });

        const totalTrades = trades.length;
        const wins = trades.filter((t) => t.totalPnL > 0).length;
        const losses = trades.filter((t) => t.totalPnL <= 0).length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

        const totalPnL = trades.reduce((sum, t) => sum + (t.totalPnL || 0), 0);
        const avgWin =
            wins > 0
                ? trades
                .filter((t) => t.totalPnL > 0)
                .reduce((sum, t) => sum + t.totalPnL, 0) / wins
                : 0;
        const avgLoss =
            losses > 0
                ? trades
                .filter((t) => t.totalPnL <= 0)
                .reduce((sum, t) => sum + t.totalPnL, 0) / losses
                : 0;

        const rrRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

        // IAE performance breakdown
        const iaeBreakdown = {};
        for (let score = 4; score <= 8; score++) {
            const scoreTrades = trades.filter((t) => t.iaeScore === score);
            if (scoreTrades.length > 0) {
                const scoreWins = scoreTrades.filter((t) => t.totalPnL > 0).length;
                iaeBreakdown[score] = {
                    trades: scoreTrades.length,
                    wins: scoreWins,
                    winRate: ((scoreWins / scoreTrades.length) * 100).toFixed(1),
                    avgPnL: (
                        scoreTrades.reduce((s, t) => s + t.totalPnL, 0) /
                        scoreTrades.length
                    ).toFixed(0),
                };
            }
        }

        res.json({
            success: true,
            stats: {
                totalTrades,
                wins,
                losses,
                winRate: winRate.toFixed(1),
                totalPnL: totalPnL.toFixed(0),
                avgWin: avgWin.toFixed(0),
                avgLoss: avgLoss.toFixed(0),
                rrRatio: rrRatio.toFixed(2),
                iaeBreakdown,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/trades/today
router.get("/today", authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const trades = await Trade.find({
            userId: req.user._id,
            createdAt: { $gte: today },
        }).sort({ createdAt: -1 });

        const dailyPnL = trades.reduce(
            (sum, t) => sum + (t.totalPnL || 0), 0
        );

        res.json({
            success: true,
            trades,
            dailyPnL,
            tradesCount: trades.length,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/trades/:id
router.get("/:id", authMiddleware, async (req, res) => {
    try {
        const trade = await Trade.findOne({
            _id: req.params.id,
            userId: req.user._id,
        });

        if (!trade) {
            return res.status(404).json({
                success: false,
                message: "Trade not found",
            });
        }

        res.json({ success: true, trade });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
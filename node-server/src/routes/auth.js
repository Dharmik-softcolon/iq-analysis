const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const zerodhaService = require("../services/zerodha.service");
const { createLogger } = require("../utils/logger");

const logger = createLogger("AuthRoutes");

// Generate JWT
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });
};

// POST /api/auth/register
router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: "User already exists",
            });
        }

        const user = await User.create({ name, email, password });
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                capital: user.capital,
            },
        });
    } catch (err) {
        logger.error(`Register error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }

        const token = generateToken(user._id);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                capital: user.capital,
                isAutoTrading: user.isAutoTrading,
                hasZerodha: !!user.zerodhaApiKey,
                isZerodhaConnected: !!(user.tokenExpiry && new Date(user.tokenExpiry) > new Date()),
            },
        });
    } catch (err) {
        logger.error(`Login error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/zerodha/credentials
router.post("/zerodha/credentials", async (req, res) => {
    try {
        const { userId, apiKey, apiSecret } = req.body;

        await User.findByIdAndUpdate(userId, {
            zerodhaApiKey: apiKey,
            zerodhaApiSecret: apiSecret,
        });

        const loginUrl = await zerodhaService.generateLoginUrl(apiKey);

        res.json({
            success: true,
            loginUrl,
            message: "Credentials saved. Use loginUrl to authenticate.",
        });
    } catch (err) {
        logger.error(`Zerodha credentials error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/zerodha/callback
router.post("/zerodha/callback", async (req, res) => {
    try {
        const { userId, requestToken } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const accessToken = await zerodhaService.generateAccessToken(
            userId,
            user.zerodhaApiKey,
            user.zerodhaApiSecret,
            requestToken
        );

        res.json({
            success: true,
            message: "Zerodha authentication successful",
            accessToken,
        });
    } catch (err) {
        logger.error(`Zerodha callback error: ${err.message}`);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ success: false, message: "No token" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select("-password");

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                capital: user.capital,
                isAutoTrading: user.isAutoTrading,
                hasZerodha: !!user.zerodhaApiKey,
                zerodhaApiKey: user.zerodhaApiKey,
                isZerodhaConnected: !!(user.tokenExpiry && new Date(user.tokenExpiry) > new Date()),
            }
        });
    } catch (err) {
        res.status(401).json({ success: false, message: "Invalid token" });
    }
});

module.exports = router;
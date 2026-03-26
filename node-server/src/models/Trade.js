const mongoose = require("mongoose");

const TradeSchema = new mongoose.Schema(
    {
        signalId: { type: String, required: true, unique: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

        // Signal Details
        direction: { type: String, enum: ["BULL", "BEAR"], required: true },
        optionType: { type: String, enum: ["CE", "PE"], required: true },
        strike: { type: Number, required: true },
        expiry: { type: String, required: true },
        iaeScore: { type: Number, required: true },
        marketState: {
            type: String,
            enum: ["DISCOVERY", "TRANSITION", "BALANCE", "UNKNOWN"],
        },
        entryWindow: {
            type: String,
            enum: ["IB", "POST_IB", "LATE"],
        },

        // Entry
        entryPremium: { type: Number, required: true },
        entryIndexPrice: { type: Number },
        entryTime: { type: Date, default: Date.now },
        entryOrderId: { type: String },

        // Position Size
        totalLots: { type: Number, required: true },
        t1Lots: { type: Number },
        t2Lots: { type: Number },
        t3Lots: { type: Number },
        capitalDeployed: { type: Number },
        riskAmount: { type: Number },

        // Exit Levels
        t1Target: { type: Number },
        t2Target: { type: Number },
        slPremium: { type: Number },
        adverseIndexSL: { type: Number },

        // Exit Tracking
        t1Exited: { type: Boolean, default: false },
        t1ExitPremium: { type: Number },
        t1ExitTime: { type: Date },
        t1PnL: { type: Number, default: 0 },

        t2Exited: { type: Boolean, default: false },
        t2ExitPremium: { type: Number },
        t2ExitTime: { type: Date },
        t2PnL: { type: Number, default: 0 },

        t3Exited: { type: Boolean, default: false },
        t3ExitPremium: { type: Number },
        t3ExitTime: { type: Date },
        t3PnL: { type: Number, default: 0 },
        t3PeakPremium: { type: Number },
        t3TrailSL: { type: Number },

        // Overall
        status: {
            type: String,
            enum: ["ACTIVE", "PARTIAL", "CLOSED", "SL_HIT"],
            default: "ACTIVE",
        },
        exitReason: { type: String },
        totalPnL: { type: Number, default: 0 },
        exitTime: { type: Date },

        // Zerodha Orders
        orders: [
            {
                orderId: String,
                orderType: String,
                lots: Number,
                premium: Number,
                status: String,
                timestamp: Date,
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("Trade", TradeSchema);
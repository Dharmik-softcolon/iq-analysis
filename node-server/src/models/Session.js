const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema(
    {
        date: { type: String, required: true, unique: true },
        marketState: { type: String },
        iaeScore: { type: Number },
        iaeBreakdown: { type: Object },
        direction: { type: String },
        systemMode: { type: String },
        tradesCount: { type: Number, default: 0 },
        dailyPnL: { type: Number, default: 0 },
        capitalStart: { type: Number },
        capitalEnd: { type: Number },
        dte: { type: Number },
        niftyOpen: { type: Number },
        niftyClose: { type: Number },
        lastUpdated: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Session", SessionSchema);
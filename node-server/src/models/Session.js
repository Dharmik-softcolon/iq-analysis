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

        // ── Buildup History: tracking minute-by-minute momentum ──
        buildupHistory: [
            {
                time: String,
                lb: { type: Number, default: 0 },
                sb: { type: Number, default: 0 },
                sc: { type: Number, default: 0 },
                lu: { type: Number, default: 0 },
                totalBullish: { type: Number, default: 0 },
                totalBearish: { type: Number, default: 0 },
                ivp: { type: Number, default: 0 }
            }
        ],

        // ── OI Snapshot: persists previous-tick OI data across server restarts ──
        // Map of strikePrice (string key) → previous tick OI/LTP values.
        // Re-hydrated into in-memory OI store on zerodha.service startup.
        // On a cold restart the first tick shows zero OI change — this is correct.
        oiSnapshot: {
            type: Map,
            of: new mongoose.Schema(
                {
                    ceOI:  { type: Number, default: 0 },
                    peOI:  { type: Number, default: 0 },
                    ceLTP: { type: Number, default: 0 },
                    peLTP: { type: Number, default: 0 },
                },
                { _id: false }
            ),
            default: {},
        },
        oiSnapshotUpdatedAt: { type: Date },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Session", SessionSchema);
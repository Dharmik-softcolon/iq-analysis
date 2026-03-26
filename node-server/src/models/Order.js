const mongoose = require("mongoose");

/**
 * Order Model
 * Tracks every individual Zerodha order placed
 * Each Trade has multiple Orders (entry + exits)
 */
const OrderSchema = new mongoose.Schema(
    {
        // ── Identity ────────────────────────────────
        orderId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        tradeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Trade",
            index: true,
        },
        signalId: {
            type: String,
            index: true,
        },

        // ── Order Details ───────────────────────────
        tradingsymbol: {
            type: String,
            required: true,
        },
        exchange: {
            type: String,
            default: "NFO",
            enum: ["NFO", "NSE", "BSE"],
        },
        instrumentToken: {
            type: Number,
        },

        // ── Transaction ─────────────────────────────
        transactionType: {
            type: String,
            required: true,
            enum: ["BUY", "SELL"],
        },
        orderType: {
            type: String,
            enum: ["MARKET", "LIMIT", "SL", "SL-M"],
            default: "MARKET",
        },
        product: {
            type: String,
            enum: ["MIS", "NRML", "CNC"],
            default: "MIS",
        },

        // ── Quantity & Price ─────────────────────────
        quantity: {
            type: Number,
            required: true,
        },
        lots: {
            type: Number,
            required: true,
        },
        price: {
            type: Number,
            default: 0,
        },
        triggerPrice: {
            type: Number,
            default: 0,
        },
        averagePrice: {
            type: Number,
            default: 0,
        },
        filledQuantity: {
            type: Number,
            default: 0,
        },
        pendingQuantity: {
            type: Number,
            default: 0,
        },

        // ── Status ──────────────────────────────────
        status: {
            type: String,
            enum: [
                "PLACED",
                "COMPLETE",
                "REJECTED",
                "CANCELLED",
                "PENDING",
                "PARTIAL",
                "ERROR",
            ],
            default: "PLACED",
            index: true,
        },
        statusMessage: {
            type: String,
            default: "",
        },

        // ── Order Classification ─────────────────────
        orderPurpose: {
            type: String,
            enum: [
                "ENTRY",
                "T1_EXIT",
                "T2_EXIT",
                "T3_EXIT",
                "SL_EXIT",
                "ADVERSE_SL_EXIT",
                "FORCE_EXIT",
                "MANUAL_EXIT",
                "EMERGENCY_EXIT",
                "STRADDLE_CE_ENTRY",
                "STRADDLE_PE_ENTRY",
                "STRADDLE_CE_LOCK",
                "STRADDLE_PE_LOCK",
                "STRADDLE_CE_TRAIL",
                "STRADDLE_PE_TRAIL",
                "MOMENTUM_ENTRY",
            ],
            required: true,
        },

        // ── P&L ─────────────────────────────────────
        entryPrice: {
            type: Number,
            default: 0,
        },
        pnl: {
            type: Number,
            default: 0,
        },

        // ── Timing ──────────────────────────────────
        placedAt: {
            type: Date,
            default: Date.now,
        },
        executedAt: {
            type: Date,
        },
        updatedAt: {
            type: Date,
        },

        // ── Raw Zerodha Response ─────────────────────
        zerodhaResponse: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        // ── Retry Info ──────────────────────────────
        retryCount: {
            type: Number,
            default: 0,
        },
        isRetry: {
            type: Boolean,
            default: false,
        },
        originalOrderId: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// ── Indexes ─────────────────────────────────────
OrderSchema.index({ userId: 1, placedAt: -1 });
OrderSchema.index({ signalId: 1, orderPurpose: 1 });
OrderSchema.index({ status: 1, placedAt: -1 });

// ── Virtuals ────────────────────────────────────
OrderSchema.virtual("isComplete").get(function () {
    return this.status === "COMPLETE";
});

OrderSchema.virtual("isFailed").get(function () {
    return ["REJECTED", "CANCELLED", "ERROR"].includes(this.status);
});

// ── Methods ─────────────────────────────────────
OrderSchema.methods.calculatePnL = function (exitPrice) {
    if (!this.entryPrice || !exitPrice) return 0;
    const multiplier =
        this.transactionType === "BUY" ? 1 : -1;
    return (
        (exitPrice - this.entryPrice) *
        this.filledQuantity *
        multiplier
    );
};

module.exports = mongoose.model("Order", OrderSchema);
const mongoose = require("mongoose");

const NiftyIVSchema = new mongoose.Schema(
    {
        date: { 
            type: String, 
            required: true, 
            unique: true,
            index: true // Indexed for fast queries by date
        },
        open: { type: Number },
        high: { type: Number },
        low: { type: Number },
        close: { type: Number },
        iv: { type: Number, required: true },
    },
    { 
        timestamps: true,
        // Enforce the exact collection name you created in MongoDB
        collection: 'niftyiv' 
    }
);

// We can export a helper method to easily fetch rolling IV percentiles later
NiftyIVSchema.statics.getHistoricalIVs = async function(days = 252) {
    // 252 trading days is typical for 1-year lookback
    const records = await this.find()
        .sort({ date: -1 })
        .limit(days)
        .select('iv date -_id');
        
    return records;
};

module.exports = mongoose.model("NiftyIV", NiftyIVSchema);

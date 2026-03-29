const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },

        // Zerodha Credentials
        zerodhaApiKey: { type: String },
        zerodhaApiSecret: { type: String },
        zerodhaAccessToken: { type: String },
        zerodhaRequestToken: { type: String },
        tokenExpiry: { type: Date },

        // System Settings
        capital: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        isAutoTrading: { type: Boolean, default: false },
    },
    { timestamps: true }
);

UserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

UserSchema.methods.matchPassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", UserSchema);
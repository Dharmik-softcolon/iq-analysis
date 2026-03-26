const mongoose = require("mongoose");
const { createLogger } = require("../utils/logger");

const logger = createLogger("Database");

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            dbName: "whalehq",
        });
        logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`MongoDB Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
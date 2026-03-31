const winston = require("winston");
const path = require("path");

const filterUnwantedLogs = winston.format((info) => {
    const msg = info.message || "";
    const unwanted = [
        "Starting market data computation",
        "Fetching NFO instruments",
        "Snapshot persisted",
        "Hydrating Nifty option",
        "Hydration complete",
        "Starting IV sync",
        "Sensibull responded",
        "Found NIFTY history",
        "Done | NIFTY:",
        "Client connected",
        "Client disconnected",
        "Processing 6 quotes",
        "Saving hydrated documents",
        "Instruments cached",
        "Option quote fetch returned null"
    ];
    if (unwanted.some((str) => msg.includes(str))) {
        return false;
    }
    return info;
});

const createLogger = (module) => {
    return winston.createLogger({
        level: "info",
        format: winston.format.combine(
            filterUnwantedLogs(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message }) => {
                return `${timestamp} | ${level.toUpperCase()} | ${module} | ${message}`;
            })
        ),
        transports: [
            new winston.transports.Console(),
            new winston.transports.File({
                filename: path.join("logs", `server-${new Date().toISOString().split("T")[0]}.log`),
            }),
        ],
    });
};

module.exports = { createLogger };
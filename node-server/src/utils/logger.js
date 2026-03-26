const winston = require("winston");
const path = require("path");

const createLogger = (module) => {
    return winston.createLogger({
        level: "info",
        format: winston.format.combine(
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
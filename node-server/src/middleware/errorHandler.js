const { createLogger } = require("../utils/logger");

const logger = createLogger("ErrorHandler");

// ─────────────────────────────────────────────
// 404 NOT FOUND
// ─────────────────────────────────────────────
const notFound = (req, res, next) => {
    const error = new Error(`Route not found: ${req.originalUrl}`);
    res.status(404);
    next(error);
};

// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────
const errorHandler = (err, req, res, next) => {
    // Determine status code
    let statusCode = res.statusCode === 200
        ? 500
        : res.statusCode;

    // Handle specific error types
    if (err.name === "CastError") {
        // MongoDB invalid ObjectId
        statusCode = 400;
        err.message = `Invalid ID format: ${err.value}`;
    }

    if (err.code === 11000) {
        // MongoDB duplicate key
        statusCode = 400;
        const field = Object.keys(err.keyValue || {})[0];
        err.message = `Duplicate value for field: ${field}`;
    }

    if (err.name === "ValidationError") {
        // Mongoose validation error
        statusCode = 400;
        err.message = Object.values(err.errors)
            .map((e) => e.message)
            .join(", ");
    }

    if (err.name === "JsonWebTokenError") {
        statusCode = 401;
        err.message = "Invalid token";
    }

    if (err.name === "TokenExpiredError") {
        statusCode = 401;
        err.message = "Token expired — please login again";
    }

    // Log the error
    if (statusCode >= 500) {
        logger.error(
            `${statusCode} | ${req.method} ${req.originalUrl} | ${err.message}`
        );
        if (process.env.NODE_ENV === "development") {
            logger.error(err.stack);
        }
    } else {
        logger.warn(
            `${statusCode} | ${req.method} ${req.originalUrl} | ${err.message}`
        );
    }

    // Send response
    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal server error",
        ...(process.env.NODE_ENV === "development" && {
            stack: err.stack,
        }),
    });
};

// ─────────────────────────────────────────────
// ASYNC ERROR WRAPPER
// Wraps async route handlers to catch errors
// Usage: router.get("/route", asyncHandler(async (req, res) => {}))
// ─────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { notFound, errorHandler, asyncHandler };
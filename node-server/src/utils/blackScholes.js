/**
 * WhaleHQ — Black-Scholes Math Engine
 *
 * Provides:
 *   1. blackScholesPrice()   — theoretical option price for a given sigma
 *   2. impliedVolatility()   — Newton-Raphson IV solver (converges in ~5 iters)
 *   3. calculateIVP()        — exact percentile rank vs MongoDB NiftyIV history
 *
 * All volatility values are expressed as decimals (e.g. 0.15 = 15%).
 * Conversion to/from percentage happens at the call-site in zerodha.service.js.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const RISK_FREE_RATE = 0.065;          // India 91-day T-bill rate (~6.5% as decimal)
const TRADING_DAYS_PER_YEAR = 252;
const IV_SOLVER_TOLERANCE = 0.01;      // Convergence tolerance for Newton-Raphson (₹0.01 = 1 paisa)
const IV_SOLVER_MAX_ITER = 100;        // Safety cap on iterations
const IV_INITIAL_GUESS = 0.25;         // 25% starting vol — near NIFTY historical avg
const IV_MIN = 0.001;                  // Floor: 0.1% — avoid division by zero
const IV_MAX = 5.0;                    // Cap: 500% — reject unrealistic solutions


// ─────────────────────────────────────────────────────────────────────────────
// CUMULATIVE DISTRIBUTION FUNCTION (Standard Normal)
// Uses Hart approximation — accurate to 7 decimal places, zero external deps
// ─────────────────────────────────────────────────────────────────────────────
function normCDF(x) {
    if (x === 0) return 0.5;

    const sign = x > 0 ? 1 : -1;

    // Horner-form polynomial coefficients (Abramowitz & Stegun 7.1.26)
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const poly =
        t * (0.254829592 +
        t * (-0.284496736 +
        t * (1.421413741 +
        t * (-1.453152027 +
        t *  1.061405429))));

    const result = 1 - poly * Math.exp(-x * x / 2);
    return 0.5 * (1 + sign * (2 * result - 1));
}


// ─────────────────────────────────────────────────────────────────────────────
// NORMAL PROBABILITY DENSITY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
function normPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}


// ─────────────────────────────────────────────────────────────────────────────
// BLACK-SCHOLES PRICE
//
// Parameters:
//   S     — Spot price (NIFTY LTP)
//   K     — Strike price
//   T     — Time to expiry in years (DTE / 365)
//   r     — Risk-free rate as decimal (e.g. 0.065)
//   sigma — Implied Volatility as decimal (e.g. 0.18 for 18%)
//   type  — 'CE' or 'PE'
//
// Returns: theoretical option price (₹ per unit)
// ─────────────────────────────────────────────────────────────────────────────
function blackScholesPrice(S, K, T, r, sigma, type) {
    if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;

    const sqrtT  = Math.sqrt(T);
    const d1     = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2     = d1 - sigma * sqrtT;

    if (type === "CE") {
        return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
    } else {
        // Put-Call parity: P = C - S + K*e^(-rT)
        return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// VEGA (derivative of price w.r.t. sigma)
// Used in Newton-Raphson denominator
// ─────────────────────────────────────────────────────────────────────────────
function blackScholesVega(S, K, T, r, sigma) {
    if (T <= 0 || sigma <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const d1    = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    return S * sqrtT * normPDF(d1);
}


// ─────────────────────────────────────────────────────────────────────────────
// IMPLIED VOLATILITY SOLVER (Newton-Raphson)
//
// Parameters:
//   marketPrice — observed option LTP from Kite (₹)
//   S           — NIFTY spot price
//   K           — Strike
//   T           — Time to expiry in years
//   r           — Risk-free rate as decimal
//   type        — 'CE' or 'PE'
//
// Returns: IV as a PERCENTAGE (e.g. 15.3 for 15.3%) or null if it fails to converge
// ─────────────────────────────────────────────────────────────────────────────
function impliedVolatility(marketPrice, S, K, T, r = RISK_FREE_RATE, type = "CE") {
    // Basic sanity checks
    if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return null;

    // Intrinsic value check — if market price < intrinsic, IV calculation is meaningless
    const intrinsic = type === "CE"
        ? Math.max(0, S - K)
        : Math.max(0, K - S);

    if (marketPrice < intrinsic - 0.5) return null;

    let sigma = IV_INITIAL_GUESS;

    for (let i = 0; i < IV_SOLVER_MAX_ITER; i++) {
        const price = blackScholesPrice(S, K, T, r, sigma, type);
        const vega  = blackScholesVega(S, K, T, r, sigma);

        // Avoid division by near-zero vega (deep ITM/OTM options)
        if (Math.abs(vega) < 1e-10) break;

        const diff = price - marketPrice;

        // Converged?
        if (Math.abs(diff) < IV_SOLVER_TOLERANCE) break;

        // Newton-Raphson step
        sigma = sigma - diff / vega;

        // Clamp to valid range during iteration
        sigma = Math.max(IV_MIN, Math.min(IV_MAX, sigma));
    }

    // Final validation
    const finalPrice = blackScholesPrice(S, K, T, r, sigma, type);
    const error = Math.abs(finalPrice - marketPrice);

    // Reject if it didn't converge close enough.
    // Use a percentage-based tolerance (5% of market price, min ₹0.50)
    // so that cheap OTM options (e.g. ₹2) are not unfairly rejected.
    const tolerance = Math.max(0.5, marketPrice * 0.05);
    if (error > tolerance) return null;

    return parseFloat((sigma * 100).toFixed(4)); // Returns as PERCENTAGE
}


// ─────────────────────────────────────────────────────────────────────────────
// TIME TO EXPIRY
//
// Returns T in years for Black-Scholes input.
// Uses calendar days / 365 (standard for index options).
// ─────────────────────────────────────────────────────────────────────────────
function timeToExpiry(expiryDateStr) {
    const now = new Date();

    // Parse expiry date string as YYYY-MM-DD
    const [year, month, day] = expiryDateStr.split('-').map(Number);

    // NSE market closes at 15:30 IST = 10:00:00 UTC
    // Construct correct UTC time directly to avoid local timezone issues
    // IST = UTC + 5:30, so 15:30 IST = 10:00 UTC
    const expiry = new Date(Date.UTC(year, month - 1, day, 10, 0, 0, 0));

    const msLeft   = expiry - now;
    const daysLeft = msLeft / (1000 * 60 * 60 * 24);

    // Minimum 15 minutes (to avoid T≈0 singularity at/after market close)
    // 15 min / (365 * 24 * 60) = 0.0000285 years
    const minT = 15 / (365 * 24 * 60);
    return Math.max(minT, daysLeft / 365);
}


// ─────────────────────────────────────────────────────────────────────────────
// IV PERCENTILE (IVP)
//
// Parameters:
//   currentIV   — Today's live IV (percentage, e.g. 15.3)
//   ivHistory   — Array of {iv} objects from NiftyIV MongoDB collection
//                 (each iv is stored as a percentage)
//
// Returns: IVP as 0–100 (e.g. 72.5 means current IV is higher than 72.5% of days)
// ─────────────────────────────────────────────────────────────────────────────
function calculateIVP(currentIV, ivHistory) {
    if (!ivHistory || ivHistory.length === 0) {
        // No history available — return neutral 50
        return 50;
    }

    const historicalIVs = ivHistory.map((r) => r.iv).filter((v) => v > 0);

    if (historicalIVs.length === 0) return 50;

    const daysBelow = historicalIVs.filter((iv) => iv < currentIV).length;
    const ivp = (daysBelow / historicalIVs.length) * 100;

    return parseFloat(ivp.toFixed(2));
}


// ─────────────────────────────────────────────────────────────────────────────
// ATM IV AVERAGE
//
// Given an array of {ceIV, peIV} computed for ATM ± N strikes,
// returns the weighted average IV (percentage).
// ─────────────────────────────────────────────────────────────────────────────
function averageATMIV(ivPairs) {
    const values = [];
    ivPairs.forEach(({ ceIV, peIV }) => {
        if (ceIV && ceIV > 0) values.push(ceIV);
        if (peIV && peIV > 0) values.push(peIV);
    });

    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return parseFloat(avg.toFixed(4));
}


module.exports = {
    blackScholesPrice,
    impliedVolatility,
    calculateIVP,
    timeToExpiry,
    averageATMIV,
    normCDF,
    RISK_FREE_RATE,
};

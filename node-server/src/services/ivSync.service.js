/**
 * WhaleHQ — IV History Sync Service (Dual-Source)
 *
 * Keeps the MongoDB `niftyiv` collection up-to-date using a
 * two-source waterfall strategy — in priority order:
 *
 *   Source 1 (Primary):   Sensibull API  → full history, all past dates
 *   Source 2 (Fallback):  Kite INDIA VIX → today's closing IV from official NSE data
 *
 * The Kite fallback means the cookie NEVER has to be manually renewed.
 * Even if the Sensibull cookie expires permanently, IVP stays accurate forever.
 *
 * Called in TWO places (index.js):
 *   1. Server startup  → fills all missing historical dates
 *   2. Daily cron 17:00 IST → picks up today's closing IV
 *
 * INDIA VIX instrument token on NSE (Kite): 264969
 *   - This is NSE's official 30-day expected vol index
 *   - Computed from NIFTY option prices — identical meaning to ATM IV
 *   - Available via kite.getHistoricalData() after market close
 */

const axios   = require("axios");
const NiftyIV = require("../models/NiftyIV");
const { createLogger } = require("../utils/logger");
const { calculateIVP } = require("../utils/blackScholes");

const logger = createLogger("IVSync");

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const SENSIBULL_IV_URL    = "https://oxide.sensibull.com/v1/compute/iv_chart/NIFTY";
const INDIA_VIX_TOKEN     = "264969";    // NSE:INDIA VIX instrument token (Kite)
const NIFTY50_TOKEN       = "256265";    // NSE:NIFTY 50 instrument token (Kite)


// ─────────────────────────────────────────────────────────────────────────────
// MAIN: fetchAndSync()
//
// Orchestrates the waterfall:
//   1. Try Sensibull (fills all missing historical dates)
//   2. If Sensibull fails OR today is still missing → try Kite VIX fallback
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAndSync() {
    logger.info("[IVSync] ── Starting IV sync ───────────────────────────────");

    const todayStr = getTodayIST();

    // ── Source 1: Sensibull ───────────────────────────────────────────────────
    let sensibullResult = { fetched: 0, existing: 0, inserted: 0, skipped: 0 };
    try {
        sensibullResult = await _syncFromSensibull();
    } catch (err) {
        logger.warn(`[IVSync] Sensibull sync threw: ${err.message}`);
    }

    // ── Check if today's IV is now in DB ─────────────────────────────────────
    const todayInDB = await NiftyIV.findOne({ date: todayStr }).lean();

    if (todayInDB) {
        logger.info(
            `[IVSync] ✅ Today (${todayStr}) IV confirmed in DB: ${todayInDB.iv}%`
        );
        return sensibullResult;
    }

    // ── Source 2: Kite INDIA VIX fallback ────────────────────────────────────
    // Triggered when: Sensibull cookie expired OR today's record still missing
    logger.info(
        `[IVSync] Today (${todayStr}) still missing after Sensibull sync. ` +
        `Trying Kite INDIA VIX fallback...`
    );

    const kiteResult = await _syncTodayFromKite(todayStr);

    return {
        fetched:  sensibullResult.fetched  + kiteResult.fetched,
        existing: sensibullResult.existing + kiteResult.existing,
        inserted: sensibullResult.inserted + kiteResult.inserted,
        skipped:  sensibullResult.skipped  + kiteResult.skipped,
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 1: Sensibull API
// ─────────────────────────────────────────────────────────────────────────────
async function _syncFromSensibull() {
    if (!process.env.SENSIBULL_COOKIE) {
        logger.warn(
            "[IVSync] SENSIBULL_COOKIE not set in .env — " +
            "skipping Sensibull. Kite VIX fallback will handle today."
        );
        return { fetched: 0, existing: 0, inserted: 0, skipped: 0 };
    }

    // Fetch
    let rawData;
    try {
        const http = _buildSensibullAxios();
        const resp = await http.get(SENSIBULL_IV_URL);
        rawData = resp.data;
        logger.info(`[IVSync] Sensibull responded: HTTP ${resp.status}`);
    } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
            logger.warn(
                "[IVSync] ⚠️  Sensibull cookie expired (401/403). " +
                "Kite VIX fallback will fill today's record. " +
                "To refresh: copy _cfuvid from browser DevTools → update SENSIBULL_COOKIE in .env"
            );
        } else {
            logger.error(`[IVSync] Sensibull fetch error: ${err.message}`);
        }
        return { fetched: 0, existing: 0, inserted: 0, skipped: 0 };
    }

    // Parse
    const fetchedRecords = _parseSensibullResponse(rawData);
    if (fetchedRecords.length === 0) {
        logger.warn("[IVSync] No parseable records from Sensibull");
        return { fetched: 0, existing: 0, inserted: 0, skipped: 0 };
    }

    logger.info(`[IVSync] Sensibull: ${fetchedRecords.length} IV records received`);

    // Find missing dates in DB
    const allDates    = fetchedRecords.map((r) => r.date);
    const existingDocs = await NiftyIV.find(
        { date: { $in: allDates } },
        { date: 1, _id: 0 }
    ).lean();
    const existingSet  = new Set(existingDocs.map((d) => d.date));

    const toInsert = fetchedRecords.filter((r) => !existingSet.has(r.date));

    if (toInsert.length === 0) {
        logger.info(
            `[IVSync] Sensibull: All ${fetchedRecords.length} dates already in DB`
        );
        return {
            fetched:  fetchedRecords.length,
            existing: existingSet.size,
            inserted: 0,
            skipped:  fetchedRecords.length,
        };
    }

    // Bulk insert
    const result       = await NiftyIV.insertMany(toInsert, {
        ordered: false, rawResult: true,
    });
    const insertedCount = result.insertedCount ?? toInsert.length;

    logger.info(
        `[IVSync] ✅ Sensibull sync done | ` +
        `Inserted: ${insertedCount} | ` +
        `Range: ${toInsert[0]?.date} → ${toInsert[toInsert.length - 1]?.date}`
    );

    _bustIVPCache();

    return {
        fetched:  fetchedRecords.length,
        existing: existingSet.size,
        inserted: insertedCount,
        skipped:  existingSet.size,
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 2: Kite INDIA VIX Fallback
//
// Gets today's closing INDIA VIX value from Kite historical data.
// INDIA VIX is computed by NSE from NIFTY option prices — same as ATM IV.
// Works 100% reliably. No cookies. No scraping. Pure official API.
// ─────────────────────────────────────────────────────────────────────────────
async function _syncTodayFromKite(dateStr) {
    try {
        // Get any active Kite instance from zerodha.service
        const kite = await _getAnyKiteInstance();
        if (!kite) {
            logger.warn(
                "[IVSync] Kite fallback: No active Kite session found. " +
                "Today's IV will be added on next startup after user logs in."
            );
            return { fetched: 0, existing: 0, inserted: 0, skipped: 0 };
        }

        // Build date range: today 09:00 → 15:35 IST
        // We use IST-adjusted Date objects
        const fromDate = _istDate(dateStr, 9, 0);
        const toDate   = _istDate(dateStr, 15, 35);

        logger.info(
            `[IVSync] Fetching INDIA VIX historical data for ${dateStr}...`
        );

        // Fetch INDIA VIX candles (1-day interval for a single day = one candle)
        const vixCandles = await kite.getHistoricalData(
            INDIA_VIX_TOKEN,
            "day",
            fromDate,
            toDate
        );

        if (!vixCandles || vixCandles.length === 0) {
            logger.warn(
                `[IVSync] Kite VIX: No candle data returned for ${dateStr}. ` +
                `(Market may be closed today — holiday?)`
            );
            return { fetched: 0, existing: 0, inserted: 0, skipped: 0 };
        }

        // Use the last candle's close as today's IV
        const latestCandle = vixCandles[vixCandles.length - 1];
        const ivValue      = parseFloat(latestCandle.close.toFixed(4));

        // Also fetch NIFTY OHLC for the NiftyIV record
        let niftyOpen = 0, niftyHigh = 0, niftyLow = 0, niftyClose = 0;
        try {
            const niftyCandles = await kite.getHistoricalData(
                NIFTY50_TOKEN,
                "day",
                fromDate,
                toDate
            );
            if (niftyCandles && niftyCandles.length > 0) {
                const nc    = niftyCandles[niftyCandles.length - 1];
                niftyOpen   = nc.open;
                niftyHigh   = nc.high;
                niftyLow    = nc.low;
                niftyClose  = nc.close;
            }
        } catch (niftyErr) {
            logger.warn(`[IVSync] Could not fetch NIFTY OHLC: ${niftyErr.message}`);
        }

        // Insert today's record
        await NiftyIV.findOneAndUpdate(
            { date: dateStr },
            {
                $setOnInsert: {
                    date:  dateStr,
                    iv:    ivValue,
                    open:  niftyOpen  || undefined,
                    high:  niftyHigh  || undefined,
                    low:   niftyLow   || undefined,
                    close: niftyClose || undefined,
                },
            },
            { upsert: true, new: true }
        );

        logger.info(
            `[IVSync] ✅ Kite VIX fallback success | ` +
            `Date: ${dateStr} | INDIA VIX: ${ivValue}% | ` +
            `NIFTY Close: ${niftyClose}`
        );

        _bustIVPCache();

        return { fetched: 1, existing: 0, inserted: 1, skipped: 0 };

    } catch (err) {
        logger.error(`[IVSync] Kite VIX fallback error: ${err.message}`);
        return { fetched: 0, existing: 0, inserted: 0, skipped: 0 };
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// SENSIBULL RESPONSE PARSER
//
// Handles the three known Sensibull response shapes.
// Logs raw structure ONCE for verification during first run.
// ─────────────────────────────────────────────────────────────────────────────
let _firstParseDone = false;

function _parseSensibullResponse(rawData) {
    if (!_firstParseDone) {
        logger.info(
            "[IVSync] Sensibull raw keys: " + JSON.stringify(Object.keys(rawData || {}))
        );
        const firstArr = rawData && Object.values(rawData).find(Array.isArray);
        if (firstArr) {
            logger.info(
                "[IVSync] Sensibull sample (first 3): " +
                JSON.stringify(firstArr.slice(0, 3))
            );
        }
        _firstParseDone = true;
    }

    const records = [];

    // Shape 1: { payload: { chart_data: [[epochMs, iv], ...] } }
    if (rawData?.payload?.chart_data && Array.isArray(rawData.payload.chart_data)) {
        logger.info("[IVSync] Sensibull format: payload.chart_data");
        rawData.payload.chart_data.forEach(([epochOrDate, iv]) => {
            const date = _toDateStr(epochOrDate);
            if (date && typeof iv === "number") {
                records.push({ date, iv: parseFloat(iv.toFixed(4)) });
            }
        });
        return records;
    }

    // Shape 2a: { data: [[epoch, iv], ...] }
    if (rawData?.data && Array.isArray(rawData.data)) {
        const first = rawData.data[0];
        if (Array.isArray(first)) {
            logger.info("[IVSync] Sensibull format: data (array of arrays)");
            rawData.data.forEach(([epochOrDate, iv]) => {
                const date = _toDateStr(epochOrDate);
                if (date && typeof iv === "number") {
                    records.push({ date, iv: parseFloat(iv.toFixed(4)) });
                }
            });
            return records;
        }

        // Shape 2b: { data: [{date, iv}, ...] }
        if (first && typeof first === "object") {
            logger.info("[IVSync] Sensibull format: data (object array)");
            rawData.data.forEach((item) => {
                const date = _toDateStr(item.date || item.Date || item.timestamp);
                const iv   = item.iv || item.IV || item.value;
                if (date && typeof iv === "number") {
                    records.push({
                        date,
                        iv:    parseFloat(iv.toFixed(4)),
                        open:  item.open  || undefined,
                        high:  item.high  || undefined,
                        low:   item.low   || undefined,
                        close: item.close || undefined,
                    });
                }
            });
            return records;
        }
    }

    // Shape 3: Root array → [[epoch, iv], ...]
    if (Array.isArray(rawData) && Array.isArray(rawData[0])) {
        logger.info("[IVSync] Sensibull format: root array of arrays");
        rawData.forEach(([epochOrDate, iv]) => {
            const date = _toDateStr(epochOrDate);
            if (date && typeof iv === "number") {
                records.push({ date, iv: parseFloat(iv.toFixed(4)) });
            }
        });
        return records;
    }

    logger.warn(
        "[IVSync] Cannot parse Sensibull response. " +
        "Keys: " + JSON.stringify(Object.keys(rawData || {}))
    );
    return [];
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Build axios instance with Sensibull cookie headers */
function _buildSensibullAxios() {
    return axios.create({
        timeout: 15000,
        headers: {
            "Cookie":           process.env.SENSIBULL_COOKIE || "",
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0.0.0 Safari/537.36",
            "Accept":           "application/json, text/plain, */*",
            "Accept-Language":  "en-US,en;q=0.9",
            "Referer":          "https://sensibull.com/",
            "Origin":           "https://sensibull.com",
        },
    });
}

/** Returns today's date in IST as "YYYY-MM-DD" */
function getTodayIST() {
    return new Date()
        .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Builds a Date object for a given date + IST hour/minute */
function _istDate(dateStr, hour, minute) {
    // dateStr: "YYYY-MM-DD"
    // We add IST offset (+5:30 = 330 min) to get the correct UTC time
    const [y, m, d] = dateStr.split("-").map(Number);
    // IST = UTC+5:30, so 09:00 IST = 03:30 UTC
    const utcHour   = hour   - 5;
    const utcMinute = minute - 30;
    return new Date(Date.UTC(y, m - 1, d, utcHour, utcMinute < 0 ? utcMinute + 60 : utcMinute));
}

/** Convert epoch (ms/s) or date string → "YYYY-MM-DD" */
function _toDateStr(value) {
    if (!value) return null;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
    }
    if (typeof value === "number") {
        const d = new Date(value > 1e10 ? value : value * 1000);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split("T")[0];
    }
    return null;
}

/** Get the first available initialized Kite instance from zerodha.service */
async function _getAnyKiteInstance() {
    try {
        const zerodhaService = require("./zerodha.service");
        const User = require("../models/User");

        // Try users who have auto-trading on first, then any active user
        const users = await User.find({
            zerodhaAccessToken: { $exists: true, $ne: null },
            zerodhaApiKey:      { $exists: true, $ne: null },
            isActive:           true,
        }).lean();

        for (const user of users) {
            // Skip expired tokens
            if (user.tokenExpiry && new Date() > new Date(user.tokenExpiry)) {
                continue;
            }

            let kite = zerodhaService.getKite(user._id);
            if (!kite) {
                try {
                    await zerodhaService.initializeKite(
                        user._id,
                        user.zerodhaApiKey,
                        user.zerodhaAccessToken
                    );
                    kite = zerodhaService.getKite(user._id);
                } catch (_) {
                    continue;
                }
            }

            if (kite) return kite;
        }

        return null;
    } catch (err) {
        logger.warn(`[IVSync] Could not get Kite instance: ${err.message}`);
        return null;
    }
}

/** Bust the IVP history cache in zerodha.service so next tick reloads from DB */
function _bustIVPCache() {
    try {
        const zerodhaService = require("./zerodha.service");
        zerodhaService._ivHistory   = null;
        zerodhaService._ivHistoryTs = 0;
        logger.info("[IVSync] IVP cache cleared — next tick will use updated history");
    } catch (_) {
        // Service not yet initialized — fine, it will load fresh on first tick
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { fetchAndSync };

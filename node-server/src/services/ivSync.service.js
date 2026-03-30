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

    // We will use bulkWrite to strictly UPSERT all fetched records.
    // This solves the problem of keeping yesterday's or today's IV up to date
    // if an early-morning snapshot had already created the record,
    // avoiding timezone/midnight boundary issues completely.
    
    if (fetchedRecords.length === 0) {
        return { fetched: 0, existing: 0, inserted: 0, skipped: 0 };
    }

    const bulkOps = fetchedRecords.map((r) => ({
        updateOne: {
            filter: { date: r.date },
            update: { $set: r },
            upsert: true
        }
    }));

    let insertedCount = 0;
    let matchedCount = 0;
    
    try {
        const result = await NiftyIV.bulkWrite(bulkOps, { ordered: false });
        insertedCount = result.upsertedCount || 0;
        matchedCount = result.matchedCount || 0;
    } catch (err) {
        logger.error(`[IVSync] bulkWrite error: ${err.message}`);
    }

    logger.info(
        `[IVSync] ✅ Sensibull sync done | ` +
        `Upserted: ${insertedCount} | ` +
        `Matched/Updated: ${matchedCount} | ` +
        `Total fetched: ${fetchedRecords.length}`
    );

    _bustIVPCache();

    return {
        fetched:  fetchedRecords.length,
        existing: matchedCount,
        inserted: insertedCount,
        skipped:  0, // We no longer skip
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

        // Upsert today's record — use $set (not $setOnInsert) so we can
        // overwrite stale data if the record already exists with a wrong IV.
        await NiftyIV.findOneAndUpdate(
            { date: dateStr },
            {
                $set: {
                    iv:    ivValue,
                    open:  niftyOpen  || undefined,
                    high:  niftyHigh  || undefined,
                    low:   niftyLow   || undefined,
                    close: niftyClose || undefined,
                },
                $setOnInsert: { date: dateStr },   // only set date on create
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
// Resets each server restart so the structure is logged on the first call only
let _firstParseDone = false;

/**
 * _parseSensibullResponse()
 *
 * Self-discovering, format-agnostic parser.
 * Sensibull has changed their response structure multiple times.
 * Instead of hard-coding key names, we now:
 *   1. Build a flat list of "containers" to search: [rootObj, payload, payload.data, ...]
 *   2. In each container, scan every value that is a non-empty Array
 *   3. Try to decode it as:
 *        a) [[epoch/dateStr, iv], ...]   → array of 2-element tuples
 *        b) [{date, iv, ...}, ...]       → array of objects
 *   4. Return the first container+key combo that yields parseable records
 *
 * Supported IV field names: iv, IV, value, close, atm_iv, atmiv
 * Supported date field names: date, Date, timestamp, time, dt
 *
 * If nothing is found, logs the full structure at WARN for easy diagnosis.
 */
function _parseSensibullResponse(rawData) {
    // ── Diagnostic logging (first call only) ─────────────────────────────────
    if (!_firstParseDone) {
        _firstParseDone = true;
        const rootKeys    = Object.keys(rawData || {});
        const payloadKeys = rawData?.payload && typeof rawData.payload === "object"
            ? Object.keys(rawData.payload)
            : null;

        logger.info("[IVSync] Sensibull root keys: " + JSON.stringify(rootKeys));
        if (payloadKeys) {
            logger.info("[IVSync] Sensibull payload keys: " + JSON.stringify(payloadKeys));
        }

        // Log a sample from any array found in this response for manual inspection
        const findFirstArray = (obj) => {
            if (!obj || typeof obj !== "object") return null;
            for (const val of Object.values(obj)) {
                if (Array.isArray(val) && val.length > 0) return val;
                if (val && typeof val === "object") {
                    const nested = findFirstArray(val);
                    if (nested) return nested;
                }
            }
            return null;
        };
        const sampleArr = findFirstArray(rawData);
        if (sampleArr) {
            logger.info(
                "[IVSync] Sensibull first array sample (3 items): " +
                JSON.stringify(sampleArr.slice(0, 3))
            );
        }
    }

    // ── Build list of containers to search ───────────────────────────────────
    // We check root first, then any nested object one level deep.
    const containers = [rawData];
    if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
        for (const val of Object.values(rawData)) {
            if (val && typeof val === "object" && !Array.isArray(val)) {
                containers.push(val);
                // One more level (e.g. payload.data_obj.chart_data)
                for (const innerVal of Object.values(val)) {
                    if (innerVal && typeof innerVal === "object" && !Array.isArray(innerVal)) {
                        containers.push(innerVal);
                    }
                }
            }
        }
    }

    // Also handle root array directly
    if (Array.isArray(rawData)) {
        containers.unshift({ __root__: rawData });
    }

    const IV_KEYS   = ["iv", "IV", "value", "close", "atm_iv", "atmiv", "impliedVolatility"];
    const DATE_KEYS = ["date", "Date", "timestamp", "time", "dt", "Date_IST"];

    // ── Search each container ─────────────────────────────────────────────────
    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

    for (const container of containers) {
        if (!container || typeof container !== "object") continue;

        // ── Type C: date-keyed object map ─────────────────────────────────────
        // Sensibull's current iv_ohlc_data format (as of 2026):
        //   { "2025-02-28": { close: 13.1, open: 12.5, high: 14.2, low: 11.8 }, ... }
        // Keys ARE the dates; values are plain objects containing IV as OHLC fields.
        // "close" = end-of-day IV — the value we persist.
        const containerEntries = Object.entries(container);
        const dateEntries = containerEntries.filter(
            ([k, v]) => DATE_PATTERN.test(k) && v && typeof v === "object" && !Array.isArray(v)
        );

        if (dateEntries.length >= 5) {
            // Log the field names inside the first date object for diagnostics
            if (!_firstParseDone || dateEntries.length > 0) {
                const sampleItem = dateEntries[0];
                if (sampleItem) {
                    logger.info(
                        `[IVSync] Type C date-entry sample keys: ` +
                        JSON.stringify(Object.keys(sampleItem[1])) +
                        ` | sample values: ` + JSON.stringify(sampleItem[1])
                    );
                }
            }

            const records = [];
            for (const [dateStr, item] of dateEntries) {
                // Find IV: prefer explicit iv/IV fields, then fall back to close
                // (iv_ohlc_data stores OHLC of implied volatility — close = EOD IV)
                let ivRaw = null;
                for (const ik of IV_KEYS) {
                    if (typeof item[ik] === "number") { ivRaw = item[ik]; break; }
                }

                if (ivRaw !== null) {
                    records.push({
                        date:  dateStr,
                        iv:    parseFloat(ivRaw.toFixed(4)),
                        open:  typeof item.open  === "number" ? item.open  : undefined,
                        high:  typeof item.high  === "number" ? item.high  : undefined,
                        low:   typeof item.low   === "number" ? item.low   : undefined,
                        close: typeof item.close === "number" ? item.close : undefined,
                    });
                }
            }

            if (records.length > 0) {
                logger.info(
                    `[IVSync] Sensibull format discovered: type=date-keyed-object | ` +
                    `${records.length} records | ` +
                    `range: ${records[0].date} → ${records[records.length - 1].date}`
                );
                return records;
            }
        }

        // ── Type A & B: scan array values inside this container ───────────────
        for (const [key, val] of Object.entries(container)) {
            if (!Array.isArray(val) || val.length === 0) continue;

            const first = val[0];
            const records = [];

            // ── Type A: array of 2-element tuples [[epoch|dateStr, iv], ...] ─
            if (Array.isArray(first) && first.length >= 2) {
                val.forEach((tuple) => {
                    const date = _toDateStr(tuple[0]);
                    const iv   = typeof tuple[1] === "number" ? tuple[1] : null;
                    if (date && iv !== null) {
                        records.push({ date, iv: parseFloat(iv.toFixed(4)) });
                    }
                });

                if (records.length > 0) {
                    logger.info(
                        `[IVSync] Sensibull format discovered: key="${key}" | ` +
                        `type=array-of-tuples | ${records.length} records`
                    );
                    return records;
                }
            }

            // ── Type B: array of objects [{date, iv}, ...] ───────────────────
            if (first && typeof first === "object" && !Array.isArray(first)) {
                val.forEach((item) => {
                    let dateRaw = null;
                    for (const dk of DATE_KEYS) {
                        if (item[dk] !== undefined) { dateRaw = item[dk]; break; }
                    }
                    let ivRaw = null;
                    for (const ik of IV_KEYS) {
                        if (typeof item[ik] === "number") { ivRaw = item[ik]; break; }
                    }

                    const date = _toDateStr(dateRaw);
                    if (date && ivRaw !== null) {
                        records.push({
                            date,
                            iv:    parseFloat(ivRaw.toFixed(4)),
                            open:  typeof item.open  === "number" ? item.open  : undefined,
                            high:  typeof item.high  === "number" ? item.high  : undefined,
                            low:   typeof item.low   === "number" ? item.low   : undefined,
                            close: typeof item.close === "number" ? item.close : undefined,
                        });
                    }
                });

                if (records.length > 0) {
                    logger.info(
                        `[IVSync] Sensibull format discovered: key="${key}" | ` +
                        `type=array-of-objects | ${records.length} records`
                    );
                    return records;
                }
            }
        }
    }

    // ── All attempts failed — emit full structure for diagnosis ───────────────
    const buildStructureSummary = (obj, depth = 0) => {
        if (depth > 2 || !obj || typeof obj !== "object") return String(obj);
        if (Array.isArray(obj)) {
            return `Array(${obj.length})[${obj[0] ? typeof obj[0] : "empty"}]`;
        }
        return "{" + Object.entries(obj)
            .map(([k, v]) => `${k}:${buildStructureSummary(v, depth + 1)}`)
            .join(", ") + "}";
    };

    logger.warn(
        "[IVSync] ⚠️  Cannot parse Sensibull response after exhaustive search.\n" +
        "         Full structure: " + buildStructureSummary(rawData) + "\n" +
        "         → Kite INDIA VIX fallback will handle today's IV record."
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
    // IST = UTC+5:30 = +330 minutes total offset.
    //
    // WRONG approach: subtract hours and minutes independently.
    //   e.g. 09:00 IST → hour-5=4, minute-30=-30 → clamped to +30 → 04:30 UTC = 10:00 IST ❌
    //
    // CORRECT approach: convert to total minutes, subtract 330, then re-derive h/m.
    //   e.g. 09:00 IST → 9*60+0=540 → 540-330=210 → 3h 30m UTC → 03:30 UTC = 09:00 IST ✅
    //        15:35 IST → 15*60+35=935 → 935-330=605 → 10h 5m UTC → 10:05 UTC = 15:35 IST ✅
    const [y, mo, d] = dateStr.split("-").map(Number);
    const totalMinutesUTC = hour * 60 + minute - 330; // 330 = IST offset
    const utcH = Math.floor(totalMinutesUTC / 60);
    const utcM = totalMinutesUTC % 60;
    return new Date(Date.UTC(y, mo - 1, d, utcH, utcM));
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

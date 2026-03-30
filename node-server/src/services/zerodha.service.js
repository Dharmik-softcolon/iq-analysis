/**
 * WhaleHQ v6.0 — Native Zerodha Market Data Engine
 *
 * 100% self-reliant. No external scrapers.
 * All OI, PCR, IV, and IVP data is computed natively from:
 *   - Zerodha Kite API (live option quotes)
 *   - Black-Scholes math engine (IV per strike)
 *   - MongoDB NiftyIV collection (IVP percentile)
 *
 * Architecture:
 *   getCompleteMarketData()
 *     ├── _getNiftySpot()            Spot price, OHLC from Kite
 *     ├── _getChainInstruments()     ATM ±10 strike symbols (cached 1hr)
 *     ├── _fetchOptionQuotes()       Batch quote for all strikes
 *     ├── _calculateOIDelta()        OI change vs previous tick (memory + DB)
 *     ├── _computeIVForStrikes()     Black-Scholes IV per CE/PE
 *     ├── _computePCR()              PCR, ITM-PCR
 *     ├── _classifyBuildup()         LB / SB / SC / LU dominant
 *     └── _getIVP()                  Exact IVP rank from MongoDB history
 */

const { KiteConnect }         = require("kiteconnect");
const { createLogger }        = require("../utils/logger");
const {
    impliedVolatility,
    calculateIVP,
    timeToExpiry,
    averageATMIV,
    RISK_FREE_RATE,
}                             = require("../utils/blackScholes");
const User                    = require("../models/User");
const NiftyIV                 = require("../models/NiftyIV");

const logger = createLogger("ZerodhaService");

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const LOT_SIZE           = parseInt(process.env.LOT_SIZE || "65", 10);
const STRIKES_EACH_SIDE  = 10;        // ATM ± 10 → 21 strikes
const ATM_IV_RANGE       = 4;         // ATM ± 4 for avg IV calculation
const OI_SCALE           = 1e7;       // Lots → Crore conversion factor
const INSTRUMENTS_TTL    = 60 * 60 * 1000;    // Cache instruments list 1 hour
const IV_HISTORY_DAYS    = 252;                // 1 trading year for IVP
const OI_PERSIST_EVERY   = 5;                  // Persist snapshot to DB every N ticks
const QUOTE_TIMEOUT      = 8000;               // 8s timeout for quote calls


class ZerodhaService {

    constructor() {
        // ── Kite instances (one per user) ─────────────────────────────────────
        this.kiteInstances = new Map();         // userId → KiteConnect

        // ── In-memory OI tick store ───────────────────────────────────────────
        // key: `${strike}_${expiry}` → { ceOI, peOI, ceLTP, peLTP, ts }
        this.prevOISnapshot = new Map();
        this._tickCount     = 0;
        this._dbHydrated    = false;            // has the snapshot been loaded from DB?

        // ── Instruments cache ─────────────────────────────────────────────────
        // Stores all NFO instruments for the nearest NIFTY expiry
        this._instrumentsCache = null;          // { expiry, strikeMap } where
                                                // strikeMap: strike → {ceSymbol, peSymbol, ceToken, peToken}
        this._instrumentsCacheExpiry = 0;

        // ── IV history cache (refresh once per session) ───────────────────────
        this._ivHistory     = null;
        this._ivHistoryTs   = 0;
        this._ivHistoryTTL  = 4 * 60 * 60 * 1000;  // Re-fetch every 4 hours
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC: Kite session management
    // ═════════════════════════════════════════════════════════════════════════

    getKite(userId) {
        return this.kiteInstances.get(userId.toString());
    }

    async initializeKite(userId, apiKey, accessToken) {
        const kite = new KiteConnect({ api_key: apiKey });
        kite.setAccessToken(accessToken);
        this.kiteInstances.set(userId.toString(), kite);
        logger.info(`Kite initialized for user: ${userId}`);

        // On (re-)initialization, try to hydrate OI snapshot from DB
        if (!this._dbHydrated) {
            await this._hydrateOISnapshotFromDB();
        }

        return kite;
    }

    async generateLoginUrl(apiKey) {
        const kite = new KiteConnect({ api_key: apiKey });
        return kite.getLoginURL();
    }

    async generateAccessToken(userId, apiKey, apiSecret, requestToken) {
        try {
            const kite    = new KiteConnect({ api_key: apiKey });
            const session = await kite.generateSession(requestToken, apiSecret);
            const accessToken = session.access_token;

            await User.findByIdAndUpdate(userId, {
                zerodhaAccessToken: accessToken,
                tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });

            await this.initializeKite(userId, apiKey, accessToken);
            logger.info(`Access token generated for user: ${userId}`);
            return accessToken;
        } catch (err) {
            logger.error(`Token generation failed: ${err.message}`);
            throw err;
        }
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC: getCompleteMarketData()
    //
    // The single source of truth for all market data. Called by:
    //   - GET /api/market/chain  (Python engine every 60s)
    //   - Any internal caller needing full market context
    // ═════════════════════════════════════════════════════════════════════════

    async getCompleteMarketData(userId, symbol = "NIFTY") {
        const kite = this.getKite(userId);
        if (!kite) throw new Error("Kite not initialized for user " + userId);

        logger.info(`[NativeEngine] Starting market data computation | symbol=${symbol}`);

        // ── 1. Spot price + OHLC ─────────────────────────────────────────────
        const spot = await this._getNiftySpot(kite);

        // ── 2. Instrument map for ATM ± STRIKES_EACH_SIDE ───────────────────
        const chainMeta = await this._getChainInstruments(kite, symbol, spot.ltp);

        // ── 3. Batch-fetch all option quotes ─────────────────────────────────
        const rawQuotes = await this._fetchOptionQuotes(kite, chainMeta.strikeMap);
        if (!rawQuotes) {
            logger.error("[NativeEngine] Option quote fetch returned null — returning empty OI");
            return this._buildFallbackData(spot, chainMeta);
        }

        // ── 4. Time-to-expiry for Black-Scholes ──────────────────────────────
        const T = timeToExpiry(chainMeta.expiry);
        const dte_days = (T * 365).toFixed(3);
        const atmQ = rawQuotes[chainMeta.atmStrike];
        logger.info(
            `[NativeEngine] T=${dte_days}d | expiry=${chainMeta.expiry} | ` +
            `ATM ${chainMeta.atmStrike}: CE=${atmQ?.ceLTP} PE=${atmQ?.peLTP}`
        );

        // ── 5. Compute IV per strike (Black-Scholes) ─────────────────────────
        const ivMap = this._computeIVForStrikes(
            rawQuotes, spot.ltp, chainMeta.atmStrike, T
        );

        // ── 6. Average IV (ATM ± ATM_IV_RANGE strikes) ───────────────────────
        const atmIVData = this._computeATMIV(
            ivMap, chainMeta.atmStrike
        );
        logger.info(
            `[NativeEngine] ATM IV: CE=${ivMap[chainMeta.atmStrike]?.ceIV} ` +
            `PE=${ivMap[chainMeta.atmStrike]?.peIV} | avg=${atmIVData.ivAvg}`
        );

        // ── 7. IVP from MongoDB history ───────────────────────────────────────
        const ivp = await this._getIVP(atmIVData.ivAvg);

        // ── 8. OI delta vs previous tick ─────────────────────────────────────
        const oiDelta = this._calculateOIDelta(rawQuotes, chainMeta.expiry, spot.ltp);

        // ── 9. Persist snapshot (every N ticks, async, non-blocking) ─────────
        this._tickCount++;
        this._saveCurrentSnapshot(rawQuotes, chainMeta.expiry);
        if (this._tickCount % OI_PERSIST_EVERY === 0) {
            this._persistSnapshotToDB().catch((e) =>
                logger.warn(`Snapshot persist skipped: ${e.message}`)
            );
        }

        // ── 10. PCR + ITM-PCR ─────────────────────────────────────────────────
        const pcrData = this._computePCR(rawQuotes, spot.ltp);

        // ── 11. Buildup classification ────────────────────────────────────────
        const buildupData = this._classifyBuildup(oiDelta, spot.ltp);

        // ── 12. DTE ──────────────────────────────────────────────────────────
        const dte = Math.ceil(T * 365);

        // ── 13. Assemble & return ─────────────────────────────────────────────
        const result = {
            timestamp:          new Date().toISOString(),

            // Price
            niftyLTP:           spot.ltp,
            niftyOpen:          spot.open,
            niftyHigh:          spot.high,
            niftyLow:           spot.low,
            niftyPrevClose:     spot.prevClose,
            niftyVWAP:          spot.vwap,

            // Option metadata
            atmStrike:          chainMeta.atmStrike,
            atmCELTP:           rawQuotes[chainMeta.atmStrike]?.ceLTP || 0,
            atmPELTP:           rawQuotes[chainMeta.atmStrike]?.peLTP || 0,
            expiryDate:         chainMeta.expiry,
            dte,

            // OI Buildups (in Crore)
            totalBullishOI:     buildupData.totalBullishOI,
            totalBearishOI:     buildupData.totalBearishOI,
            lbOIChg:            buildupData.lbOIChg,
            sbOIChg:            buildupData.sbOIChg,
            scOIChg:            buildupData.scOIChg,
            luOIChg:            buildupData.luOIChg,
            dominantBuildup:    buildupData.dominant,

            // Premium changes
            totalCallPremChg:   oiDelta.callPremChg,
            totalPutPremChg:    oiDelta.putPremChg,

            // PCR
            pcrOI:              pcrData.pcrOI,
            itmPCR:             pcrData.itmPCR,

            // IV & IVP (native Black-Scholes)
            ivAvg:              atmIVData.ivAvg,
            ivp,
            atmCEIV:            ivMap[chainMeta.atmStrike]?.ceIV || 0,
            atmPEIV:            ivMap[chainMeta.atmStrike]?.peIV || 0,

            // Source tag
            dataSources: {
                price: "ZERODHA",
                oi:    "ZERODHA_NATIVE",
                iv:    "BLACK_SCHOLES",
                ivp:   "MONGODB_NIFTYIV",
            },
        };

        logger.info(
            `[NativeEngine] ✅ Done | ` +
            `NIFTY: ${result.niftyLTP} | ATM: ${result.atmStrike} | ` +
            `PCR: ${result.pcrOI} | IV: ${result.ivAvg}% | ` +
            `IVP: ${result.ivp} | Buildup: ${result.dominantBuildup}`
        );

        return result;
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _getNiftySpot()
    // ═════════════════════════════════════════════════════════════════════════

    async _getNiftySpot(kite) {
        const quote    = await kite.getQuote(["NSE:NIFTY 50"]);
        const raw      = quote["NSE:NIFTY 50"];
        if (!raw) throw new Error("NSE:NIFTY 50 quote missing from Kite");

        return {
            ltp:       raw.last_price,
            open:      raw.ohlc?.open      || raw.last_price,
            high:      raw.ohlc?.high      || raw.last_price,
            low:       raw.ohlc?.low       || raw.last_price,
            prevClose: raw.ohlc?.close     || raw.last_price,
            vwap:      raw.average_price   || raw.last_price,
        };
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _getChainInstruments()
    //
    // Fetches NFO instruments for symbol+nearest-expiry, builds a map of
    // strike → { ceSymbol, peSymbol }. Cached for INSTRUMENTS_TTL ms.
    // ═════════════════════════════════════════════════════════════════════════

    async _getChainInstruments(kite, symbol, spotPrice) {
        const now = Date.now();

        // Recalculate ATM every tick (spot moves) but reuse instrument list
        const atmStrike     = Math.round(spotPrice / 50) * 50;
        const strikeInterval = 50;

        if (this._instrumentsCache && now < this._instrumentsCacheExpiry) {
            // Rebuild strike map around the new ATM using cached instrument list
            return this._buildStrikeMap(
                this._instrumentsCache.allInstruments,
                this._instrumentsCache.expiry,
                atmStrike,
                strikeInterval,
                symbol
            );
        }

        // Cache miss — fetch full NFO instrument list
        logger.info("[NativeEngine] Fetching NFO instruments (cache miss)");
        const instruments = await kite.getInstruments("NFO");

        // Filter to this symbol's options only
        const optionInstruments = instruments.filter(
            (i) => i.name === symbol && i.instrument_type !== "FUT"
        );

        // Find the nearest weekly/monthly expiry
        const today    = new Date();
        today.setHours(0, 0, 0, 0);

        // Helper to safely get YYYY-MM-DD from Kite's expiry (which can be a Date object)
        const getExpiryStr = (val) => {
            if (!val) return null;
            if (val instanceof Date) {
                // Kite sets expiry dates to midnight UTC.
                // toISOString safely returns the UTC "YYYY-MM-DD" exactly matching what Kite sent.
                return val.toISOString().split("T")[0];
            }
            if (typeof val === 'string') return val.split("T")[0];
            return null;
        };

        const expiriesSet = new Set();
        optionInstruments.forEach((i) => {
            const dStr = getExpiryStr(i.expiry);
            if (dStr) expiriesSet.add(dStr);
        });

        const expiries = Array.from(expiriesSet)
            .map((e) => new Date(e))
            .filter((d) => d >= today)
            .sort((a, b) => a - b);

        if (expiries.length === 0) throw new Error("No valid expiries found for " + symbol);

        // Iterate through expiries to find the closest one that actually has strikes around the ATM
        for (let i = 0; i < expiries.length; i++) {
            const nearestExpiry = expiries[i];
            const expiryStr = nearestExpiry.toISOString().split("T")[0];

            const strikeMap = this._buildStrikeMap(
                optionInstruments, expiryStr, atmStrike, strikeInterval, symbol, false
            );
            
            if (Object.keys(strikeMap).length > 0) {
                // Cache: store all option instruments for this expiry
                this._instrumentsCache = {
                    allInstruments: optionInstruments,
                    expiry: expiryStr,
                };
                this._instrumentsCacheExpiry = now + INSTRUMENTS_TTL;

                logger.info(
                    `[NativeEngine] Instruments cached | expiry=${expiryStr} | ` +
                    `${Object.keys(strikeMap).length} strikes mapped`
                );

                return { expiry: expiryStr, atmStrike, strikeMap };
            }
        }

        throw new Error(`No expiries found with option instruments for ATM=${atmStrike}`);
    }

    _buildStrikeMap(instruments, expiry, atmStrike, strikeInterval, symbol, throwOnEmpty = true) {
        const strikeMap = {};

        const getExpiryStr = (val) => {
            if (!val) return null;
            if (val instanceof Date) {
                return val.toISOString().split("T")[0];
            }
            if (typeof val === 'string') return val.split("T")[0];
            return null;
        };

        // Build lookup: strike+type → tradingsymbol
        const lookup = {};
        instruments.forEach((i) => {
            const itemExpiryStr = getExpiryStr(i.expiry);
            if (itemExpiryStr !== expiry) return;
            const key = `${i.strike}_${i.instrument_type}`;
            lookup[key] = `NFO:${i.tradingsymbol}`;
        });

        // Select ATM ± STRIKES_EACH_SIDE
        for (let n = -STRIKES_EACH_SIDE; n <= STRIKES_EACH_SIDE; n++) {
            const strike = atmStrike + n * strikeInterval;
            const ceKey  = `${strike}_CE`;
            const peKey  = `${strike}_PE`;

            if (lookup[ceKey] && lookup[peKey]) {
                strikeMap[strike] = {
                    ceSymbol: lookup[ceKey],
                    peSymbol: lookup[peKey],
                };
            }
        }

        if (Object.keys(strikeMap).length === 0 && throwOnEmpty) {
            throw new Error(
                `No option instruments found for ATM=${atmStrike} expiry=${expiry}`
            );
        }

        return typeof throwOnEmpty !== 'undefined' && !throwOnEmpty ? strikeMap : { expiry, atmStrike, strikeMap };
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _fetchOptionQuotes()
    //
    // Batch-fetches CE+PE quotes for all strikes in strikeMap.
    // Returns: { [strike]: { ceLTP, peITP, ceOI, peOI, ceVolume, peVolume } }
    // ═════════════════════════════════════════════════════════════════════════

    async _fetchOptionQuotes(kite, strikeMap) {
        // Build flat list of symbols to fetch
        const symbols = [];
        Object.values(strikeMap).forEach(({ ceSymbol, peSymbol }) => {
            symbols.push(ceSymbol, peSymbol);
        });

        if (symbols.length === 0) return null;

        let rawQuoteData;
        try {
            rawQuoteData = await kite.getQuote(symbols);
        } catch (err) {
            logger.error(`[NativeEngine] kite.getQuote() failed: ${err.message}`);
            return null;
        }

        // Reshape to { [strike]: { ceLTP, peLTP, ceOI, peOI, ... } }
        const out = {};

        Object.entries(strikeMap).forEach(([strikeStr, { ceSymbol, peSymbol }]) => {
            const strike = parseInt(strikeStr, 10);
            const ceQ    = rawQuoteData[ceSymbol];
            const peQ    = rawQuoteData[peSymbol];

            out[strike] = {
                ceLTP:    ceQ?.last_price       || 0,
                peLTP:    peQ?.last_price       || 0,
                ceOI:     ceQ?.oi               || 0,
                peOI:     peQ?.oi               || 0,
                ceOIDay:  ceQ?.oi_day_high      || 0,   // day's OI high
                peOIDay:  peQ?.oi_day_high      || 0,
                ceVolume: ceQ?.volume           || 0,
                peVolume: peQ?.volume           || 0,
                ceAvgPrice: ceQ?.average_price  || 0,
                peAvgPrice: peQ?.average_price  || 0,
            };
        });

        return out;
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _computeIVForStrikes()
    //
    // Runs Black-Scholes IV solver for each strike that has a non-zero LTP.
    // Returns: { [strike]: { ceIV, peIV } }   (values in PERCENTAGE e.g. 15.3)
    // ═════════════════════════════════════════════════════════════════════════

    _computeIVForStrikes(rawQuotes, spot, atmStrike, T) {
        const ivMap = {};

        Object.entries(rawQuotes).forEach(([strikeStr, data]) => {
            const strike = parseInt(strikeStr, 10);
            const ceIV   = (data.ceLTP > 0.1)
                ? impliedVolatility(data.ceLTP, spot, strike, T, RISK_FREE_RATE, "CE")
                : null;
            const peIV   = (data.peLTP > 0.1)
                ? impliedVolatility(data.peLTP, spot, strike, T, RISK_FREE_RATE, "PE")
                : null;

            ivMap[strike] = { ceIV, peIV };
        });

        return ivMap;
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _computeATMIV()
    //
    // Averages IV across ATM ± ATM_IV_RANGE strikes using averageATMIV helper.
    // Returns: { ivAvg (percentage), ivPairs [] }
    // ═════════════════════════════════════════════════════════════════════════

    _computeATMIV(ivMap, atmStrike) {
        const interval    = 50;
        const ivPairs     = [];

        for (let n = -ATM_IV_RANGE; n <= ATM_IV_RANGE; n++) {
            const strike = atmStrike + n * interval;
            if (ivMap[strike]) {
                ivPairs.push({
                    ceIV: ivMap[strike].ceIV,
                    peIV: ivMap[strike].peIV,
                });
            }
        }

        const ivAvg = averageATMIV(ivPairs);
        return { ivAvg, ivPairs };
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _getIVP()
    //
    // Fetches historical IVs from MongoDB and computes exact percentile rank.
    // Caches history for _ivHistoryTTL ms to avoid DB query every tick.
    // ═════════════════════════════════════════════════════════════════════════

    async _getIVP(currentIV) {
        if (currentIV <= 0) return 50;

        const now = Date.now();

        // Refresh cache if stale
        if (!this._ivHistory || (now - this._ivHistoryTs) > this._ivHistoryTTL) {
            try {
                this._ivHistory = await NiftyIV.getHistoricalIVs(IV_HISTORY_DAYS);
                this._ivHistoryTs = now;
                logger.info(
                    `[NativeEngine] IV history loaded: ${this._ivHistory.length} days`
                );
            } catch (err) {
                logger.warn(`[NativeEngine] IV history fetch failed: ${err.message}`);
                this._ivHistory = this._ivHistory || [];  // keep stale cache if available
            }
        }

        if (!this._ivHistory || this._ivHistory.length === 0) {
            logger.warn("[NativeEngine] No IV history in MongoDB — IVP defaulting to 50");
            return 50;
        }

        return calculateIVP(currentIV, this._ivHistory);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _calculateOIDelta()
    //
    // Computes OI change and price change vs previous tick.
    // Uses this.prevOISnapshot (Map) hydrated from DB on startup.
    // Returns per-strike delta arrays used by _classifyBuildup().
    // ═════════════════════════════════════════════════════════════════════════

    _calculateOIDelta(rawQuotes, expiry, spot) {
        let callPremChg = 0;
        let putPremChg  = 0;

        const strikeDeltas = [];

        Object.entries(rawQuotes).forEach(([strikeStr, current]) => {
            const strike   = parseInt(strikeStr, 10);
            const snapKey  = `${strike}_${expiry}`;
            const prev     = this.prevOISnapshot.get(snapKey) || {
                ceOI: 0, peOI: 0, ceLTP: 0, peLTP: 0,
            };

            const ceOIChg  = current.ceOI  - prev.ceOI;
            const peOIChg  = current.peOI  - prev.peOI;
            const cePriceChg = current.ceLTP - prev.ceLTP;
            const pePriceChg = current.peLTP - prev.peLTP;

            // Weighted premium change (OI × price change → premium flow)
            callPremChg += cePriceChg * (current.ceOI || 1);
            putPremChg  += pePriceChg * (current.peOI || 1);

            // Convert OI lots → Crore
            const ceOIChgCr = this._lotsToCr(ceOIChg, spot);
            const peOIChgCr = this._lotsToCr(peOIChg, spot);

            strikeDeltas.push({
                strike,
                ceOIChgCr,
                peOIChgCr,
                cePriceChg,
                pePriceChg,
                ceOI: current.ceOI,
                peOI: current.peOI,
            });
        });

        // Total raw OI (in Cr) for PCR
        const totalCallOICr = this._lotsToCr(
            Object.values(rawQuotes).reduce((s, q) => s + q.ceOI, 0), spot
        );
        const totalPutOICr  = this._lotsToCr(
            Object.values(rawQuotes).reduce((s, q) => s + q.peOI, 0), spot
        );

        // Normalise premium change (per OI unit)
        const totalCEOI = Object.values(rawQuotes).reduce((s, q) => s + q.ceOI, 0);
        const totalPEOI = Object.values(rawQuotes).reduce((s, q) => s + q.peOI, 0);
        const normCallPremChg = totalCEOI > 0 ? callPremChg / totalCEOI : 0;
        const normPutPremChg  = totalPEOI > 0 ? putPremChg  / totalPEOI : 0;

        return {
            strikeDeltas,
            callPremChg:   normCallPremChg,
            putPremChg:    normPutPremChg,
            totalCallOICr,
            totalPutOICr,
        };
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _classifyBuildup()
    //
    // Classifies each strike as LB / SB / SC / LU and aggregates:
    //   LB — Long Buildup  (OI↑ Price↑) → Bullish
    //   SB — Short Buildup (OI↑ Price↓) → Bearish
    //   SC — Short Cover   (OI↓ Price↑) → Bullish
    //   LU — Long Unwind   (OI↓ Price↓) → Bearish
    // ═════════════════════════════════════════════════════════════════════════

    _classifyBuildup(oiDelta, spot) {
        let lbOIChg = 0;  // Bullish
        let sbOIChg = 0;  // Bearish
        let scOIChg = 0;  // Bullish
        let luOIChg = 0;  // Bearish

        oiDelta.strikeDeltas.forEach(
            ({ ceOIChgCr, peOIChgCr, cePriceChg, pePriceChg }) => {

            // ── Call side ────────────────────────────────────────────────────
            if (ceOIChgCr > 0) {
                if (cePriceChg >= 0) lbOIChg += ceOIChgCr;  // Call LB = Bullish
                else                 sbOIChg += ceOIChgCr;  // Call SB = Bearish
            } else {
                const abs = Math.abs(ceOIChgCr);
                if (cePriceChg > 0)  scOIChg += abs;        // Call SC = Bullish
                else                 luOIChg += abs;        // Call LU = Bearish
            }

            // ── Put side (directional meaning inverted) ───────────────────────
            if (peOIChgCr > 0) {
                if (pePriceChg >= 0) sbOIChg += peOIChgCr; // Put LB = Bearish
                else                 lbOIChg += peOIChgCr; // Put SB = Bullish
            } else {
                const abs = Math.abs(peOIChgCr);
                if (pePriceChg < 0)  scOIChg += abs;       // Put SC = Bearish
                else                 luOIChg += abs;       // Put LU = Bullish
            }
        });

        const totalBullishOI = parseFloat((lbOIChg + scOIChg).toFixed(4));
        const totalBearishOI = parseFloat((sbOIChg + luOIChg).toFixed(4));

        // Determine dominant buildup
        let dominant = "NONE";
        if (totalBullishOI > 0 || totalBearishOI > 0) {
            const candidates = [
                { name: "LB", val: lbOIChg },
                { name: "SB", val: sbOIChg },
                { name: "SC", val: scOIChg },
                { name: "LU", val: luOIChg },
            ];
            const max = candidates.reduce((a, b) => (b.val > a.val ? b : a));
            dominant = max.val > 0 ? max.name : "MIXED";
        }

        return {
            lbOIChg:      parseFloat(lbOIChg.toFixed(4)),
            sbOIChg:      parseFloat(sbOIChg.toFixed(4)),
            scOIChg:      parseFloat(scOIChg.toFixed(4)),
            luOIChg:      parseFloat(luOIChg.toFixed(4)),
            totalBullishOI,
            totalBearishOI,
            dominant,
        };
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: _computePCR()
    //
    // Calculates PCR (total put OI / total call OI) and ITM-PCR.
    // ITM calls:  strike < spot
    // ITM puts:   strike > spot
    // ═════════════════════════════════════════════════════════════════════════

    _computePCR(rawQuotes, spot) {
        let totalCallOI = 0;
        let totalPutOI  = 0;
        let itmCallOI   = 0;
        let itmPutOI    = 0;

        Object.entries(rawQuotes).forEach(([strikeStr, data]) => {
            const strike = parseInt(strikeStr, 10);
            totalCallOI += data.ceOI;
            totalPutOI  += data.peOI;
            if (strike < spot) itmCallOI += data.ceOI;
            if (strike > spot) itmPutOI  += data.peOI;
        });

        const pcrOI  = totalCallOI > 0
            ? parseFloat((totalPutOI / totalCallOI).toFixed(3))
            : 1.0;

        const itmPCR = itmCallOI > 0
            ? parseFloat((itmPutOI / itmCallOI).toFixed(3))
            : 0;

        return { pcrOI, itmPCR, totalCallOI, totalPutOI };
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: OI Snapshot persistence
    // ═════════════════════════════════════════════════════════════════════════

    /** Save current tick's OI as the new "previous" snapshot in memory */
    _saveCurrentSnapshot(rawQuotes, expiry) {
        Object.entries(rawQuotes).forEach(([strikeStr, data]) => {
            const snapKey = `${strikeStr}_${expiry}`;
            this.prevOISnapshot.set(snapKey, {
                ceOI:  data.ceOI,
                peOI:  data.peOI,
                ceLTP: data.ceLTP,
                peLTP: data.peLTP,
            });
        });
    }

    /** Async: persist snapshot to MongoDB Session document every OI_PERSIST_EVERY ticks */
    async _persistSnapshotToDB() {
        const Session = require("../models/Session");
        const today   = new Date().toISOString().split("T")[0];

        // Convert Map to plain object for Mongoose
        const snapshotObj = {};
        this.prevOISnapshot.forEach((val, key) => {
            snapshotObj[key] = val;
        });

        await Session.findOneAndUpdate(
            { date: today },
            {
                $set: {
                    oiSnapshot:          snapshotObj,
                    oiSnapshotUpdatedAt: new Date(),
                },
            },
            { upsert: true }
        );

        logger.info(
            `[NativeEngine] OI snapshot persisted to DB (${this.prevOISnapshot.size} strikes)`
        );
    }

    /** On startup: load yesterday's/today's OI snapshot from DB into memory */
    async _hydrateOISnapshotFromDB() {
        try {
            const Session = require("../models/Session");
            const today   = new Date().toISOString().split("T")[0];

            const session = await Session.findOne({ date: today }).lean();

            // session.oiSnapshot is stored as a Mongoose Mixed (plain object),
            // NOT a JS Map — so we must use Object.entries(), not .size/.forEach()
            const snap = session && session.oiSnapshot;
            const snapKeys = snap && typeof snap === "object" ? Object.keys(snap) : [];

            if (snapKeys.length > 0) {
                for (const [key, val] of Object.entries(snap)) {
                    // Validate shape before restoring to avoid corrupt data
                    if (val && typeof val === "object") {
                        this.prevOISnapshot.set(key, {
                            ceOI:  val.ceOI  || 0,
                            peOI:  val.peOI  || 0,
                            ceLTP: val.ceLTP || 0,
                            peLTP: val.peLTP || 0,
                        });
                    }
                }
                logger.info(
                    `[NativeEngine] OI snapshot hydrated from DB: ` +
                    `${this.prevOISnapshot.size} strikes restored`
                );
            } else {
                logger.info(
                    "[NativeEngine] No OI snapshot in DB for today — starting fresh"
                );
            }
            this._dbHydrated = true;
        } catch (err) {
            logger.warn(`[NativeEngine] OI hydration failed: ${err.message}`);
            this._dbHydrated = true; // Don't retry forever
        }
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE: Helpers
    // ═════════════════════════════════════════════════════════════════════════

    _lotsToCr(lots, spot) {
        return (lots * LOT_SIZE * (spot || 22000)) / OI_SCALE;
    }

    _buildFallbackData(spot, chainMeta) {
        return {
            timestamp:       new Date().toISOString(),
            niftyLTP:        spot.ltp,
            niftyOpen:       spot.open,
            niftyHigh:       spot.high,
            niftyLow:        spot.low,
            niftyPrevClose:  spot.prevClose,
            niftyVWAP:       spot.vwap,
            atmStrike:       chainMeta?.atmStrike || 0,
            atmCELTP:        0,
            atmPELTP:        0,
            expiryDate:      chainMeta?.expiry || "",
            dte:             0,
            totalBullishOI:  0,  totalBearishOI: 0,
            lbOIChg:         0,  sbOIChg:        0,
            scOIChg:         0,  luOIChg:        0,
            dominantBuildup: "NONE",
            totalCallPremChg:0,  totalPutPremChg:0,
            pcrOI:           1.0, itmPCR:        0,
            ivAvg:           0,  ivp:            50,
            dataSources: { price: "ZERODHA", oi: "ERROR_FALLBACK" },
        };
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC: Order placement (unchanged)
    // ═════════════════════════════════════════════════════════════════════════

    async placeOrder(userId, orderParams) {
        const kite = this.getKite(userId);
        if (!kite) throw new Error("Kite not initialized");

        const {
            tradingsymbol, exchange, transaction_type,
            quantity, order_type, product, price,
        } = orderParams;

        try {
            const orderId = await kite.placeOrder("regular", {
                tradingsymbol,
                exchange:         exchange      || "NFO",
                transaction_type,
                quantity,
                order_type:       order_type   || "MARKET",
                product:          product      || "MIS",
                price:            price        || 0,
                validity:         "DAY",
            });

            logger.info(
                `Order placed: ${orderId} | ${transaction_type} ${quantity} ${tradingsymbol}`
            );
            return { success: true, orderId };
        } catch (err) {
            logger.error(`Order failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC: Option symbol builder (unchanged — used by order.service.js)
    // ═════════════════════════════════════════════════════════════════════════

    buildOptionSymbol(symbol, expiry, strike, optionType) {
        // Format: NIFTY25APR24000CE  (symbol + YY + MMM + strike + type)
        // NOTE: This generates Kite-compatible CE/PE tradingsymbols for market orders.
        const date   = new Date(expiry);
        const months = [
            "JAN","FEB","MAR","APR","MAY","JUN",
            "JUL","AUG","SEP","OCT","NOV","DEC",
        ];
        const year  = date.getFullYear().toString().slice(-2);
        const month = months[date.getMonth()];
        const day   = date.getDate().toString().padStart(2, "0");
        return `${symbol}${year}${day}${month}${strike}${optionType}`;
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC: Indices quotes (unchanged)
    // ═════════════════════════════════════════════════════════════════════════

    async getIndicesQuotes(userId) {
        const kite = this.getKite(userId);
        if (!kite) return null;

        try {
            const symbols = ["NSE:NIFTY 50", "NSE:NIFTY BANK", "BSE:SENSEX"];
            const quotes  = await kite.getQuote(symbols);
            return {
                timestamp:  new Date().toISOString(),
                nifty:      quotes["NSE:NIFTY 50"]   || null,
                bankNifty:  quotes["NSE:NIFTY BANK"] || null,
                sensex:     quotes["BSE:SENSEX"]     || null,
            };
        } catch (err) {
            logger.error(`Failed to fetch indices quotes: ${err.message}`);
            throw err;
        }
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC: Margins (unchanged)
    // ═════════════════════════════════════════════════════════════════════════

    async getMargins(userId) {
        const kite = this.getKite(userId);
        if (!kite) return null;

        try {
            const margins = await kite.getMargins();
            return {
                timestamp: new Date().toISOString(),
                available: margins.equity?.net       || 0,
                used:      margins.equity?.utilised  || 0,
            };
        } catch (err) {
            logger.error(`Failed to fetch margins: ${err.message}`);
            throw err;
        }
    }


    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC: generateLoginUrl (for Zerodha OAuth flow)
    // ═════════════════════════════════════════════════════════════════════════

    async generateLoginUrl(apiKey) {
        const kite = new KiteConnect({ api_key: apiKey });
        return kite.getLoginURL();
    }
}

module.exports = new ZerodhaService();
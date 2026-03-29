const axios = require("axios");
const { createLogger } = require("../utils/logger");

const logger = createLogger("OpstraService");

class OpstraService {
    constructor() {
        this.opstraURL = "https://opstra.definedge.com";

        // ── Dedicated axios instance for Opstra (JSON API)
        this.opstraSession = axios.create({
            timeout: 10000,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/124.0.0.0 Safari/537.36",
                Accept: "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                Origin: "https://opstra.definedge.com",
                Referer: "https://opstra.definedge.com/",
            },
        });

        // ── Dedicated axios instance for NSE (needs HTML cookie first)
        this.nseSession = axios.create({
            timeout: 12000,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });

        // Cache: {data, expiry}
        this.cache = new Map();
        this.cacheExpiry = 58 * 1000; // 58 seconds — slightly under the 60-sec tick

        // NSE cookie state
        this._nseCookies = "";
        this._nseCookieExpiry = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC: Get complete OI data for IAE
    // Returns the fully normalised OI object expected by zerodha.service.js
    // ─────────────────────────────────────────────────────────────────────────
    async getCompleteOIData(symbol = "NIFTY", expiry = null) {
        const cacheKey = `oi_${symbol}_${expiry}`;
        const cached = this._getCache(cacheKey);
        if (cached) {
            logger.info(`OI data served from cache (source: ${cached.source})`);
            return cached;
        }

        // Try NSE first (most reliable for OI + IV + PCR)
        try {
            const data = await this._fetchFromNSE(symbol);
            this._setCache(cacheKey, data);
            return data;
        } catch (nseErr) {
            logger.warn(`NSE fetch failed: ${nseErr.message} — trying Opstra`);
        }

        // Fallback: Opstra
        try {
            const data = await this._fetchFromOpstra(symbol, expiry);
            this._setCache(cacheKey, data);
            return data;
        } catch (opstraErr) {
            logger.error(`Opstra fetch also failed: ${opstraErr.message} — returning empty OI`);
            return this._getEmptyOIData();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NSE OPTION CHAIN  (primary source)
    // ─────────────────────────────────────────────────────────────────────────
    async _fetchFromNSE(symbol = "NIFTY") {
        logger.info(`Fetching option chain from NSE for ${symbol}`);

        // Ensure we have a fresh cookie
        await this._ensureNSECookies();

        const indexSymbol = symbol === "NIFTY" ? "NIFTY" : "BANKNIFTY";
        const url = `https://www.nseindia.com/api/option-chain-indices?symbol=${indexSymbol}`;

        let resp;
        try {
            resp = await this.nseSession.get(url, {
                headers: {
                    Accept: "application/json, text/plain, */*",
                    Referer: "https://www.nseindia.com/option-chain",
                    Cookie: this._nseCookies,
                    "X-Requested-With": "XMLHttpRequest",
                },
            });
        } catch (err) {
            // If 401/403, reset cookies and retry once
            if (err.response && [401, 403].includes(err.response.status)) {
                logger.warn("NSE returned 401/403 — refreshing cookies and retrying");
                this._nseCookieExpiry = 0; // force refresh
                await this._ensureNSECookies();
                resp = await this.nseSession.get(url, {
                    headers: {
                        Accept: "application/json, text/plain, */*",
                        Referer: "https://www.nseindia.com/option-chain",
                        Cookie: this._nseCookies,
                        "X-Requested-With": "XMLHttpRequest",
                    },
                });
            } else {
                throw err;
            }
        }

        if (!resp.data || !resp.data.records) {
            throw new Error("Invalid NSE response — missing records");
        }

        return this._parseNSEData(resp.data, symbol);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NSE COOKIE MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    async _ensureNSECookies() {
        if (this._nseCookies && Date.now() < this._nseCookieExpiry) return;

        try {
            // Visit NSE homepage to get session cookies (must be HTML, not JSON)
            const homeResp = await this.nseSession.get("https://www.nseindia.com", {
                headers: {
                    Accept:
                        "text/html,application/xhtml+xml,application/xml;q=0.9," +
                        "image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                },
            });

            const setCookie = homeResp.headers["set-cookie"];
            if (setCookie && setCookie.length > 0) {
                this._nseCookies = setCookie.map((c) => c.split(";")[0]).join("; ");
                this._nseCookieExpiry = Date.now() + 5 * 60 * 1000; // 5 min
                logger.info("NSE cookies refreshed successfully");
            } else {
                logger.warn("NSE homepage returned no cookies");
                this._nseCookies = "";
                this._nseCookieExpiry = Date.now() + 60 * 1000; // retry in 1 min
            }
        } catch (err) {
            logger.error(`NSE cookie refresh failed: ${err.message}`);
            this._nseCookies = "";
            this._nseCookieExpiry = Date.now() + 30 * 1000; // retry in 30s
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PARSE NSE OPTION CHAIN
    // ─────────────────────────────────────────────────────────────────────────
    _parseNSEData(rawData, symbol) {
        const records = rawData.records?.data || [];
        const filtered = rawData.filtered?.data || [];
        const spotPrice = rawData.records?.underlyingValue || 0;
        const atmStrike = Math.round(spotPrice / 50) * 50;

        // Aggregate OI & premium
        let totalCallOI = 0;
        let totalPutOI = 0;
        let totalCallOIChg = 0;
        let totalPutOIChg = 0;
        let totalCallPremium = 0;
        let totalPutPremium = 0;
        let itmCallOI = 0;
        let itmPutOI = 0;

        records.forEach((record) => {
            const strike = record.strikePrice;

            if (record.CE) {
                const ce = record.CE;
                totalCallOI += ce.openInterest || 0;
                totalCallOIChg += ce.changeinOpenInterest || 0;
                totalCallPremium += (ce.lastPrice || 0) * (ce.openInterest || 0);
                if (strike < spotPrice) itmCallOI += ce.openInterest || 0;
            }

            if (record.PE) {
                const pe = record.PE;
                totalPutOI += pe.openInterest || 0;
                totalPutOIChg += pe.changeinOpenInterest || 0;
                totalPutPremium += (pe.lastPrice || 0) * (pe.openInterest || 0);
                if (strike > spotPrice) itmPutOI += pe.openInterest || 0;
            }
        });

        // PCR
        const pcrOI = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;
        const itmPCR = itmCallOI > 0 ? itmPutOI / itmCallOI : 0;

        // Convert OI lots → Crores  (1 lot = LOT_SIZE units; ~₹ face = spot × LOT_SIZE)
        // We scale to match how the IAE thresholds are defined (200Cr / 100Cr).
        // Using: Cr ≈ (OI_lots × LOT_SIZE × spot) / 1e7
        const lotSize = parseInt(process.env.LOT_SIZE || "65", 10);
        const spotRef = spotPrice > 0 ? spotPrice : 22000; // fallback if spotPrice missing
        const toCr = (lots) => (lots * lotSize * spotRef) / 1e7;

        // Premium change vs previous cycle
        const prevKey = `prev_premium_${symbol}`;
        const prevData = this._getCache(prevKey);
        const callPremChg = prevData ? totalCallPremium - prevData.callPremium : 0;
        const putPremChg  = prevData ? totalPutPremium  - prevData.putPremium  : 0;

        // Store for next cycle
        this._setCache(prevKey, { callPremium: totalCallPremium, putPremium: totalPutPremium }, 24 * 60 * 60 * 1000);

        // Buildup classification
        const callOIChgCr = toCr(totalCallOIChg);
        const putOIChgCr  = toCr(totalPutOIChg);
        const buildupData = this._classifyBuildup(callOIChgCr, putOIChgCr, callPremChg, putPremChg);

        // Premium change in points (as IAE IS/IB engine expects ₹ point change)
        // Approximate: total_premium_change / total_OI gives per-contract change
        const callPremChgPts = totalCallOI > 0 ? callPremChg / totalCallOI : 0;
        const putPremChgPts  = totalPutOI  > 0 ? putPremChg  / totalPutOI  : 0;

        // IV from chain
        const ivData = this._calculateIVFromChain(filtered.length ? filtered : records, atmStrike);

        logger.info(
            `NSE OI parsed | Spot: ${spotPrice} | PCR: ${pcrOI.toFixed(2)} | ` +
            `Call OI: ${toCr(totalCallOI).toFixed(0)}Cr | ` +
            `Put OI: ${toCr(totalPutOI).toFixed(0)}Cr | ` +
            `Buildup: ${buildupData.dominant} | IV: ${ivData.ivAvg.toFixed(1)}%`
        );

        return {
            totalCallPremChg: callPremChgPts,
            totalPutPremChg: putPremChgPts,
            totalBullishOI: buildupData.totalBullishOICr,
            totalBearishOI: buildupData.totalBearishOICr,
            sbOIChg: buildupData.sbOIChg,
            lbOIChg: buildupData.lbOIChg,
            scOIChg: buildupData.scOIChg,
            luOIChg: buildupData.luOIChg,
            pcrOI: parseFloat(pcrOI.toFixed(3)),
            itmPCR: parseFloat(itmPCR.toFixed(3)),
            ivAvg: ivData.ivAvg,
            ivp: ivData.ivp,
            dominantBuildup: buildupData.dominant,
            // Raw totals (for reference)
            totalCallOI: toCr(totalCallOI),
            totalPutOI: toCr(totalPutOI),
            source: "NSE",
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OPSTRA FREE API  (fallback)
    // ─────────────────────────────────────────────────────────────────────────
    async _fetchFromOpstra(symbol, expiry) {
        logger.info(`Fetching OI data from Opstra for ${symbol}`);

        const resolvedExpiry = expiry || (await this._getNearestExpiry());
        const url = `${this.opstraURL}/api/openinterest/optionchainsnapshot`;

        const chainResp = await this.opstraSession.get(url, {
            params: { index: symbol, expiry: resolvedExpiry },
        });

        const chainData = chainResp.data;
        if (!chainData || !chainData.data) {
            throw new Error("Invalid Opstra response — missing data");
        }

        return this._parseOpstraData(chainData.data, symbol);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PARSE OPSTRA DATA
    // ─────────────────────────────────────────────────────────────────────────
    _parseOpstraData(data, symbol) {
        let totalBullishOI = 0;
        let totalBearishOI = 0;
        let sbOIChg = 0;
        let lbOIChg = 0;
        let scOIChg = 0;
        let luOIChg = 0;
        let callPremChg = 0;
        let putPremChg  = 0;
        let totalCallOI = 0;
        let totalPutOI  = 0;
        let totalCallOIChg = 0;
        let totalPutOIChg  = 0;
        let ivSum = 0;
        let ivCount = 0;
        let dominant = "NONE";

        if (Array.isArray(data)) {
            data.forEach((row) => {
                const ceOIChg  = row.ceOIChange  || 0;
                const ceLTPChg = row.ceLTPChange || 0;
                const peOIChg  = row.peOIChange  || 0;
                const peLTPChg = row.peLTPChange || 0;
                const ceOI     = row.ceOI  || 0;
                const peOI     = row.peOI  || 0;
                const ceIV     = row.ceIV  || 0;
                const peIV     = row.peIV  || 0;

                totalCallOI    += ceOI;
                totalPutOI     += peOI;
                totalCallOIChg += ceOIChg;
                totalPutOIChg  += peOIChg;

                // Aggregate IV
                if (ceIV > 0) { ivSum += ceIV; ivCount++; }
                if (peIV > 0) { ivSum += peIV; ivCount++; }

                // Call buildup
                if (ceOIChg > 0 && ceLTPChg < 0) sbOIChg += Math.abs(ceOIChg);      // Call SB = bearish
                else if (ceOIChg < 0 && ceLTPChg > 0) scOIChg += Math.abs(ceOIChg); // Call SC = bullish
                else if (ceOIChg > 0 && ceLTPChg > 0) lbOIChg += Math.abs(ceOIChg); // Call LB = bullish

                // Put buildup
                if (peOIChg > 0 && peLTPChg > 0) totalBearishOI += Math.abs(peOIChg);      // Put LB = bearish
                else if (peOIChg > 0 && peLTPChg < 0) totalBullishOI += Math.abs(peOIChg); // Put SB = bullish

                callPremChg += ceLTPChg;
                putPremChg  += peLTPChg;
            });
        }

        // Convert lots → Crores
        const lotSize = parseInt(process.env.LOT_SIZE || "65", 10);
        const scale = lotSize / 1e7;

        totalBullishOI *= scale;
        totalBearishOI *= scale;
        sbOIChg *= scale;
        lbOIChg *= scale;
        scOIChg *= scale;
        luOIChg *= scale;

        // PCR from raw OI totals
        const pcrOI = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;

        // Dominant buildup
        if (totalBullishOI > 0 && totalBearishOI === 0)       dominant = "LB";
        else if (totalBearishOI > 0 && totalBullishOI === 0)  dominant = "SB";
        else if (scOIChg > sbOIChg && scOIChg > lbOIChg)     dominant = "SC";
        else if (lbOIChg > sbOIChg)                           dominant = "LB";
        else if (sbOIChg > lbOIChg)                           dominant = "SB";
        else                                                    dominant = "MIXED";

        // IV
        const ivAvg = ivCount > 0 ? ivSum / ivCount : 0;
        const ivp   = this._estimateIVP(ivAvg);

        return {
            totalCallPremChg: callPremChg,
            totalPutPremChg: putPremChg,
            totalBullishOI,
            totalBearishOI,
            sbOIChg,
            lbOIChg,
            scOIChg,
            luOIChg,
            pcrOI: parseFloat(pcrOI.toFixed(3)),
            itmPCR: 0, // Opstra snapshot doesn't split by ITM easily
            ivAvg,
            ivp,
            dominantBuildup: dominant,
            totalCallOI: totalCallOI * scale,
            totalPutOI:  totalPutOI  * scale,
            source: "OPSTRA",
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILDUP CLASSIFIER
    // ─────────────────────────────────────────────────────────────────────────
    _classifyBuildup(callOIChgCr, putOIChgCr, callPremChg, putPremChg) {
        let lbOIChg = 0; // Long Buildup
        let sbOIChg = 0; // Short Buildup
        let scOIChg = 0; // Short Cover
        let luOIChg = 0; // Long Unwind

        // ── Call side
        if (callOIChgCr > 0) {
            if (callPremChg >= 0)  lbOIChg += callOIChgCr; // Call LB = bullish
            else                   sbOIChg += callOIChgCr; // Call SB = bearish
        } else {
            if (callPremChg > 0)   scOIChg += Math.abs(callOIChgCr); // Call SC = bullish
            else                   luOIChg += Math.abs(callOIChgCr); // Call LU = bearish
        }

        // ── Put side (inverted directional meaning)
        if (putOIChgCr > 0) {
            if (putPremChg >= 0)   sbOIChg += putOIChgCr; // Put LB = bearish
            else                   lbOIChg += putOIChgCr; // Put SB = bullish
        } else {
            if (putPremChg < 0)    scOIChg += Math.abs(putOIChgCr); // Put SC = bearish
            else                   luOIChg += Math.abs(putOIChgCr); // Put LU = bullish
        }

        const totalBullishOICr = lbOIChg + scOIChg;
        const totalBearishOICr = sbOIChg + luOIChg;

        let dominant = "NONE";
        if (totalBullishOICr > 0 && totalBearishOICr === 0) {
            dominant = lbOIChg >= scOIChg ? "LB" : "SC";
        } else if (totalBearishOICr > 0 && totalBullishOICr === 0) {
            dominant = sbOIChg >= luOIChg ? "SB" : "LU";
        } else if (totalBullishOICr > 0 && totalBearishOICr > 0) {
            dominant = "MIXED";
        }

        return { totalBullishOICr, totalBearishOICr, lbOIChg, sbOIChg, scOIChg, luOIChg, dominant };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IV CALCULATION FROM CHAIN DATA
    // ─────────────────────────────────────────────────────────────────────────
    _calculateIVFromChain(chainData, atmStrike) {
        let ivSum = 0;
        let ivCount = 0;

        if (Array.isArray(chainData)) {
            chainData.forEach((row) => {
                const strike = row.strikePrice;
                // ATM ± 4 strikes (200 pts for NIFTY @ 50pt intervals)
                if (Math.abs(strike - atmStrike) <= 200) {
                    const ceIV = row.CE?.impliedVolatility || 0;
                    const peIV = row.PE?.impliedVolatility || 0;
                    if (ceIV > 0) { ivSum += ceIV; ivCount++; }
                    if (peIV > 0) { ivSum += peIV; ivCount++; }
                }
            });
        }

        const ivAvg = ivCount > 0 ? parseFloat((ivSum / ivCount).toFixed(2)) : 0;
        const ivp   = this._estimateIVP(ivAvg);

        return { ivAvg, ivp };
    }

    // IVP percentile estimate (simplified without 52-week history)
    _estimateIVP(currentIV) {
        if (currentIV <= 0) return 50;
        const ivLow  = 8;   // NIFTY historical low IV %
        const ivHigh = 40;  // NIFTY historical high IV %
        const ivp = ((currentIV - ivLow) / (ivHigh - ivLow)) * 100;
        return Math.max(0, Math.min(100, parseFloat(ivp.toFixed(1))));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NEAREST WEEKLY EXPIRY (Thursday)
    // ─────────────────────────────────────────────────────────────────────────
    async _getNearestExpiry() {
        const cacheKey = "nearest_expiry";
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const today = new Date();
        const day = today.getDay(); // 0=Sun, 4=Thu
        const daysToThursday = day <= 4 ? 4 - day : 11 - day;
        const thursday = new Date(today);
        thursday.setDate(today.getDate() + daysToThursday);

        // Opstra expects: "04-Apr-24" style
        const expiry = thursday
            .toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
            .toUpperCase()
            .replace(/ /g, "-");

        this._setCache(cacheKey, expiry, 60 * 60 * 1000); // cache 1 hour
        return expiry;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CACHE HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    _getCache(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) { this.cache.delete(key); return null; }
        return entry.data;
    }

    _setCache(key, data, ttl = null) {
        this.cache.set(key, { data, expiry: Date.now() + (ttl || this.cacheExpiry) });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMPTY FALLBACK
    // ─────────────────────────────────────────────────────────────────────────
    _getEmptyOIData() {
        return {
            totalCallPremChg: 0,
            totalPutPremChg: 0,
            totalBullishOI: 0,
            totalBearishOI: 0,
            sbOIChg: 0,
            lbOIChg: 0,
            scOIChg: 0,
            luOIChg: 0,
            pcrOI: 1.0,
            itmPCR: 0,
            ivAvg: 0,
            ivp: 0,
            dominantBuildup: "NONE",
            source: "EMPTY_FALLBACK",
        };
    }
}

module.exports = new OpstraService();
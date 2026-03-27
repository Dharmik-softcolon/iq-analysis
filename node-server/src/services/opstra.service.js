const axios = require("axios");
const { createLogger } = require("../utils/logger");

const logger = createLogger("OpstraService");

class OpstraService {
    constructor() {
        this.baseURL = "https://opstra.definedge.com/api";
        this.freeURL = "https://opstra.definedge.com";
        this.session = axios.create({
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0",
                Accept: "application/json",
            },
        });

        // Cache to avoid hammering API
        this.cache = new Map();
        this.cacheExpiry = 60 * 1000; // 60 seconds
    }

    // ─────────────────────────────────────────────
    // MAIN METHOD: Get complete OI data for IAE
    // ─────────────────────────────────────────────
    async getCompleteOIData(symbol = "NIFTY", expiry = null) {
        const cacheKey = `oi_${symbol}_${expiry}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        try {
            // Try Opstra first
            const data = await this._fetchFromOpstra(symbol, expiry);
            this._setCache(cacheKey, data);
            return data;
        } catch (err) {
            logger.warn(`Opstra failed: ${err.message} — trying NSE fallback`);
            try {
                const data = await this._fetchFromNSE(symbol);
                this._setCache(cacheKey, data);
                return data;
            } catch (err2) {
                logger.error(`NSE fallback also failed: ${err2.message}`);
                return this._getEmptyOIData();
            }
        }
    }

    // ─────────────────────────────────────────────
    // OPSTRA API FETCH
    // ─────────────────────────────────────────────
    async _fetchFromOpstra(symbol, expiry) {
        logger.info(`Fetching OI data from Opstra for ${symbol}`);

        // Step 1: Get option chain from Opstra
        const chainResp = await this.session.get(
            `${this.freeURL}/api/openinterest/optionchainsnapshot`,
            {
                params: {
                    index: symbol,
                    expiry: expiry || await this._getNearestExpiry(symbol),
                },
            }
        );

        const chainData = chainResp.data;
        if (!chainData || !chainData.data) {
            throw new Error("Invalid Opstra response");
        }

        return this._parseOpstraData(chainData.data, symbol);
    }

    // ─────────────────────────────────────────────
    // NSE OPTION CHAIN FALLBACK
    // ─────────────────────────────────────────────
    async _fetchFromNSE(symbol = "NIFTY") {
        logger.info(`Fetching option chain from NSE for ${symbol}`);

        const indexSymbol = symbol === "NIFTY" ? "NIFTY" : "BANKNIFTY";

        const resp = await this.session.get(
            `https://www.nseindia.com/api/option-chain-indices?symbol=${indexSymbol}`,
            {
                headers: {
                    "Referer": "https://www.nseindia.com",
                    "Accept": "application/json",
                    "Cookie": await this._getNSECookies(),
                },
            }
        );

        if (!resp.data || !resp.data.records) {
            throw new Error("Invalid NSE response");
        }

        return this._parseNSEData(resp.data, symbol);
    }

    // ─────────────────────────────────────────────
    // GET NSE SESSION COOKIES
    // ─────────────────────────────────────────────
    async _getNSECookies() {
        try {
            const cacheKey = "nse_cookies";
            const cached = this._getCache(cacheKey);
            if (cached) return cached;

            const resp = await this.session.get(
                "https://www.nseindia.com",
                {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                            "AppleWebKit/537.36 (KHTML, like Gecko) " +
                            "Chrome/120.0.0.0 Safari/537.36",
                    },
                }
            );

            const cookies = resp.headers["set-cookie"]
                ?.map((c) => c.split(";")[0])
                .join("; ") || "";

            // Cache cookies for 5 minutes
            this.cache.set(cacheKey, {
                data: cookies,
                expiry: Date.now() + 5 * 60 * 1000,
            });

            return cookies;
        } catch (err) {
            logger.error(`NSE cookie fetch failed: ${err.message}`);
            return "";
        }
    }

    // ─────────────────────────────────────────────
    // PARSE NSE OPTION CHAIN DATA
    // ─────────────────────────────────────────────
    _parseNSEData(rawData, symbol) {
        const records = rawData.records?.data || [];
        const filtered = rawData.filtered?.data || [];

        const spotPrice = rawData.records?.underlyingValue || 0;
        const atmStrike = Math.round(spotPrice / 50) * 50;

        // Aggregate OI data
        let totalCallOI = 0;
        let totalPutOI = 0;
        let totalCallOIChg = 0;
        let totalPutOIChg = 0;
        let totalCallPremium = 0;
        let totalPutPremium = 0;
        let prevCallPremium = 0;
        let prevPutPremium = 0;

        // ITM data
        let itmCallOI = 0;
        let itmPutOI = 0;

        records.forEach((record) => {
            const strike = record.strikePrice;

            // Call data
            if (record.CE) {
                const ce = record.CE;
                totalCallOI += ce.openInterest || 0;
                totalCallOIChg += ce.changeinOpenInterest || 0;
                totalCallPremium += (ce.lastPrice || 0) * (ce.openInterest || 0);

                // ITM calls = strike < spot
                if (strike < spotPrice) {
                    itmCallOI += ce.openInterest || 0;
                }
            }

            // Put data
            if (record.PE) {
                const pe = record.PE;
                totalPutOI += pe.openInterest || 0;
                totalPutOIChg += pe.changeinOpenInterest || 0;
                totalPutPremium += (pe.lastPrice || 0) * (pe.openInterest || 0);

                // ITM puts = strike > spot
                if (strike > spotPrice) {
                    itmPutOI += pe.openInterest || 0;
                }
            }
        });

        // Calculate PCR
        const pcrOI = totalCallOI > 0
            ? totalPutOI / totalCallOI
            : 1.0;

        // ITM PCR
        const itmPCR = itmCallOI > 0
            ? itmPutOI / itmCallOI
            : 0;

        // Convert OI to approximate Crores
        // Each NIFTY lot = 65, each lot face ~₹1L
        const lotSize = parseInt(process.env.LOT_SIZE || "65", 10);
        const croreMultiplier = lotSize / 10000000;

        const totalCallOICr = totalCallOI * croreMultiplier;
        const totalPutOICr = totalPutOI * croreMultiplier;
        const callOIChgCr = totalCallOIChg * croreMultiplier;
        const putOIChgCr = totalPutOIChg * croreMultiplier;

        // Premium change approximation
        // We track current vs previous to get change
        const prevData = this._getCache(`prev_premium_${symbol}`);
        const callPremChg = prevData
            ? totalCallPremium - prevData.callPremium
            : 0;
        const putPremChg = prevData
            ? totalPutPremium - prevData.putPremium
            : 0;

        // Store current for next comparison
        this._setCache(`prev_premium_${symbol}`, {
            callPremium: totalCallPremium,
            putPremium: totalPutPremium,
        });

        // Scale premium change to points
        const callPremChgPts = spotPrice > 0
            ? (callPremChg / spotPrice) * 100
            : 0;
        const putPremChgPts = spotPrice > 0
            ? (putPremChg / spotPrice) * 100
            : 0;

        // Buildup classification
        const buildupData = this._classifyBuildup(
            callOIChgCr,
            putOIChgCr,
            callPremChg,
            putPremChg
        );

        // Get IV from filtered data
        const ivData = this._calculateIVFromChain(filtered, atmStrike);

        logger.info(
            `NSE Chain Parsed | Spot: ${spotPrice} | ` +
            `PCR: ${pcrOI.toFixed(2)} | ` +
            `Call OI: ${totalCallOICr.toFixed(0)}Cr | ` +
            `Put OI: ${totalPutOICr.toFixed(0)}Cr`
        );

        return {
            // Premium Changes (in points)
            totalCallPremChg: callPremChgPts,
            totalPutPremChg: putPremChgPts,

            // OI in Crores (approximated)
            totalBullishOI: buildupData.totalBullishOICr,
            totalBearishOI: buildupData.totalBearishOICr,

            // OI Changes
            sbOIChg: buildupData.sbOIChg,
            lbOIChg: buildupData.lbOIChg,
            scOIChg: buildupData.scOIChg,
            luOIChg: buildupData.luOIChg,

            // PCR
            pcrOI: parseFloat(pcrOI.toFixed(3)),
            itmPCR: parseFloat(itmPCR.toFixed(3)),

            // IV
            ivAvg: ivData.ivAvg,
            ivp: ivData.ivp,

            // Buildup
            dominantBuildup: buildupData.dominant,

            // Raw OI for reference
            totalCallOI: totalCallOICr,
            totalPutOI: totalPutOICr,

            source: "NSE",
        };
    }

    // ─────────────────────────────────────────────
    // PARSE OPSTRA DATA
    // ─────────────────────────────────────────────
    _parseOpstraData(data, symbol) {
        // Opstra provides structured buildup data directly
        let totalBullishOI = 0;
        let totalBearishOI = 0;
        let sbOIChg = 0;
        let lbOIChg = 0;
        let scOIChg = 0;
        let luOIChg = 0;
        let callPremChg = 0;
        let putPremChg = 0;
        let dominant = "NONE";

        // Process each strike
        if (Array.isArray(data)) {
            data.forEach((row) => {
                // Call side
                const ceOIChg = row.ceOIChange || 0;
                const ceLTPChg = row.ceLTPChange || 0;

                // Put side
                const peOIChg = row.peOIChange || 0;
                const peLTPChg = row.peLTPChange || 0;

                // Classify each strike buildup
                // Call side
                if (ceOIChg > 0 && ceLTPChg < 0) {
                    // Short Buildup in calls (bearish)
                    sbOIChg += Math.abs(ceOIChg);
                } else if (ceOIChg < 0 && ceLTPChg > 0) {
                    // Short Covering in calls (bullish)
                    scOIChg += Math.abs(ceOIChg);
                } else if (ceOIChg > 0 && ceLTPChg > 0) {
                    // Long Buildup in calls (bullish for CE)
                    lbOIChg += Math.abs(ceOIChg);
                }

                // Put side
                if (peOIChg > 0 && peLTPChg > 0) {
                    // Long Buildup in puts (bearish signal)
                    totalBearishOI += Math.abs(peOIChg);
                } else if (peOIChg > 0 && peLTPChg < 0) {
                    // Short Buildup in puts (bullish signal)
                    totalBullishOI += Math.abs(peOIChg);
                }

                callPremChg += ceLTPChg || 0;
                putPremChg += peLTPChg || 0;
            });
        }

        // Convert to Crores (approximate)
        const scale = parseInt(process.env.LOT_SIZE || "65", 10) / 10000000;
        totalBullishOI = totalBullishOI * scale;
        totalBearishOI = totalBearishOI * scale;
        sbOIChg = sbOIChg * scale;
        lbOIChg = lbOIChg * scale;
        scOIChg = scOIChg * scale;
        luOIChg = luOIChg * scale;

        // Determine dominant
        if (totalBullishOI > 0 && totalBearishOI === 0) {
            dominant = "LB";
        } else if (totalBearishOI > 0 && totalBullishOI === 0) {
            dominant = "SB";
        } else if (scOIChg > sbOIChg && scOIChg > lbOIChg) {
            dominant = "SC";
        } else if (lbOIChg > sbOIChg) {
            dominant = "LB";
        } else if (sbOIChg > lbOIChg) {
            dominant = "SB";
        } else {
            dominant = "MIXED";
        }

        return {
            totalCallPremChg: callPremChg,
            totalPutPremChg: putPremChg,
            totalBullishOI,
            totalBearishOI,
            sbOIChg,
            lbOIChg,
            scOIChg,
            luOIChg,
            pcrOI: 1.0, // Will be merged with Kite data
            itmPCR: 0,
            ivAvg: 0,
            ivp: 0,
            dominantBuildup: dominant,
            source: "OPSTRA",
        };
    }

    // ─────────────────────────────────────────────
    // CLASSIFY BUILDUP FROM RAW OI CHANGES
    // ─────────────────────────────────────────────
    _classifyBuildup(
        callOIChgCr,
        putOIChgCr,
        callPremChg,
        putPremChg
    ) {
        // Buildup classification logic:
        // Call OI up + Call Price up = Long Buildup (CE) = BULLISH
        // Call OI up + Call Price down = Short Buildup (CE) = BEARISH
        // Put OI up + Put Price up = Long Buildup (PE) = BEARISH
        // Put OI up + Put Price down = Short Buildup (PE) = BULLISH

        let lbOIChg = 0; // Long buildup
        let sbOIChg = 0; // Short buildup
        let scOIChg = 0; // Short cover
        let luOIChg = 0; // Long unwind
        let dominant = "NONE";

        // Call side analysis
        if (callOIChgCr > 0) {
            if (callPremChg > 0) {
                lbOIChg += callOIChgCr; // Calls LB = BULL
            } else {
                sbOIChg += callOIChgCr; // Calls SB = BEAR
            }
        } else {
            if (callPremChg > 0) {
                scOIChg += Math.abs(callOIChgCr); // Calls SC = BULL
            } else {
                luOIChg += Math.abs(callOIChgCr); // Calls LU = BEAR
            }
        }

        // Put side analysis (inverted)
        if (putOIChgCr > 0) {
            if (putPremChg > 0) {
                sbOIChg += putOIChgCr; // Puts LB = BEAR
            } else {
                lbOIChg += putOIChgCr; // Puts SB = BULL
            }
        } else {
            if (putPremChg < 0) {
                scOIChg += Math.abs(putOIChgCr); // Puts SC = BEAR
            } else {
                luOIChg += Math.abs(putOIChgCr); // Puts LU = BULL
            }
        }

        // Total Bullish vs Bearish
        const totalBullishOICr = lbOIChg + scOIChg;
        const totalBearishOICr = sbOIChg + luOIChg;

        // Determine dominant buildup
        const maxVal = Math.max(lbOIChg, sbOIChg, scOIChg, luOIChg);

        if (totalBullishOICr > 0 && totalBearishOICr === 0) {
            dominant = lbOIChg > scOIChg ? "LB" : "SC";
        } else if (totalBearishOICr > 0 && totalBullishOICr === 0) {
            dominant = sbOIChg > luOIChg ? "SB" : "LU";
        } else if (
            (lbOIChg > 0 || scOIChg > 0) &&
            (sbOIChg > 0 || luOIChg > 0)
        ) {
            dominant = "MIXED";
        }

        return {
            totalBullishOICr,
            totalBearishOICr,
            lbOIChg,
            sbOIChg,
            scOIChg,
            luOIChg,
            dominant,
        };
    }

    // ─────────────────────────────────────────────
    // CALCULATE IV FROM CHAIN DATA
    // ─────────────────────────────────────────────
    _calculateIVFromChain(filteredData, atmStrike) {
        let ivSum = 0;
        let ivCount = 0;

        if (Array.isArray(filteredData)) {
            filteredData.forEach((row) => {
                // Only ATM ± 2 strikes for IV average
                const strike = row.strikePrice;
                if (Math.abs(strike - atmStrike) <= 200) {
                    if (row.CE?.impliedVolatility) {
                        ivSum += row.CE.impliedVolatility;
                        ivCount++;
                    }
                    if (row.PE?.impliedVolatility) {
                        ivSum += row.PE.impliedVolatility;
                        ivCount++;
                    }
                }
            });
        }

        const ivAvg = ivCount > 0 ? ivSum / ivCount : 0;

        // IVP calculation requires historical IV data
        // Simplified: use VIX as proxy if available
        const ivp = this._estimateIVP(ivAvg);

        return { ivAvg, ivp };
    }

    // ─────────────────────────────────────────────
    // IVP ESTIMATION (simplified)
    // ─────────────────────────────────────────────
    _estimateIVP(currentIV) {
        // Simplified IVP:
        // Historical NIFTY IV ranges roughly:
        // Low: ~8%, High: ~40%, Normal: ~12-16%
        if (currentIV <= 0) return 50;

        const ivLow = 8;
        const ivHigh = 40;

        const ivp = ((currentIV - ivLow) / (ivHigh - ivLow)) * 100;
        return Math.max(0, Math.min(100, ivp));
    }

    // ─────────────────────────────────────────────
    // GET NEAREST WEEKLY EXPIRY
    // ─────────────────────────────────────────────
    async _getNearestExpiry(symbol) {
        const cacheKey = `expiry_${symbol}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        // Calculate nearest Thursday
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Sun, 4=Thu
        const daysToThursday = (4 - dayOfWeek + 7) % 7;
        const nearestThursday = new Date(today);
        nearestThursday.setDate(today.getDate() + daysToThursday);

        const expiry = nearestThursday
            .toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "2-digit",
            })
            .toUpperCase()
            .replace(/ /g, "-");

        this._setCache(cacheKey, expiry);
        return expiry;
    }

    // ─────────────────────────────────────────────
    // CACHE HELPERS
    // ─────────────────────────────────────────────
    _getCache(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }

    _setCache(key, data, ttl = null) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + (ttl || this.cacheExpiry),
        });
    }

    // ─────────────────────────────────────────────
    // EMPTY OI DATA (fallback)
    // ─────────────────────────────────────────────
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
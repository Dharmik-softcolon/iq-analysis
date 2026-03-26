const { KiteConnect } = require("kiteconnect");
const { createLogger } = require("../utils/logger");
const User = require("../models/User");

const logger = createLogger("ZerodhaService");

class ZerodhaService {
    constructor() {
        this.kiteInstances = new Map(); // userId → KiteConnect instance
    }

    getKite(userId) {
        return this.kiteInstances.get(userId.toString());
    }

    async initializeKite(userId, apiKey, accessToken) {
        const kite = new KiteConnect({ api_key: apiKey });
        kite.setAccessToken(accessToken);
        this.kiteInstances.set(userId.toString(), kite);
        logger.info(`Kite initialized for user: ${userId}`);
        return kite;
    }

    async generateLoginUrl(apiKey) {
        const kite = new KiteConnect({ api_key: apiKey });
        return kite.getLoginURL();
    }

    async generateAccessToken(userId, apiKey, apiSecret, requestToken) {
        try {
            const kite = new KiteConnect({ api_key: apiKey });
            const session = await kite.generateSession(requestToken, apiSecret);
            const accessToken = session.access_token;

            // Save to DB
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

    async getOptionChainData(userId, symbol = "NIFTY") {
        const kite = this.getKite(userId);
        if (!kite) throw new Error("Kite not initialized");

        try {
            // Get NIFTY quote
            const quote = await kite.getQuote([`NSE:${symbol} 50`]);
            const niftyData = quote[`NSE:${symbol} 50`];

            // Get expiry dates
            const instruments = await kite.getInstruments("NFO");
            const niftyOptions = instruments.filter(
                (i) => i.name === symbol && i.instrument_type !== "FUT"
            );

            // Get nearest weekly expiry
            const today = new Date();
            const expiries = [
                ...new Set(niftyOptions.map((i) => i.expiry)),
            ].sort();
            const nearestExpiry = expiries.find((e) => new Date(e) >= today);

            // Calculate ATM strike
            const ltp = niftyData.last_price;
            const atmStrike = Math.round(ltp / 50) * 50;

            // Get ATM CE and PE quotes
            const atmCESymbol = `NFO:${symbol}${nearestExpiry
                .replace(/-/g, "")
                .slice(2, 8)}${atmStrike}CE`;
            const atmPESymbol = `NFO:${symbol}${nearestExpiry
                .replace(/-/g, "")
                .slice(2, 8)}${atmStrike}PE`;

            let atmCELTP = 0;
            let atmPELTP = 0;

            try {
                const optionQuotes = await kite.getQuote([atmCESymbol, atmPESymbol]);
                atmCELTP = optionQuotes[atmCESymbol]?.last_price || 0;
                atmPELTP = optionQuotes[atmPESymbol]?.last_price || 0;
            } catch (e) {
                logger.warn(`Option quote fetch issue: ${e.message}`);
            }

            // Calculate DTE
            const expiryDate = new Date(nearestExpiry);
            const dte = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

            return {
                timestamp: new Date().toISOString(),
                niftyLTP: ltp,
                niftyOpen: niftyData.ohlc?.open || ltp,
                niftyHigh: niftyData.ohlc?.high || ltp,
                niftyLow: niftyData.ohlc?.low || ltp,
                niftyPrevClose: niftyData.ohlc?.close || ltp,
                niftyVWAP: niftyData.average_price || ltp,
                atmStrike,
                atmCELTP,
                atmPELTP,
                expiryDate: nearestExpiry,
                dte,
                // NOTE: OI data fields below come from Sensibull/Opstra
                // These are mocked — replace with real API calls
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
            };
        } catch (err) {
            logger.error(`Chain data fetch failed: ${err.message}`);
            throw err;
        }
    }

    async placeOrder(userId, orderParams) {
        const kite = this.getKite(userId);
        if (!kite) throw new Error("Kite not initialized");

        const {
            tradingsymbol,
            exchange,
            transaction_type,
            quantity,
            order_type,
            product,
            price,
        } = orderParams;

        try {
            const orderId = await kite.placeOrder("regular", {
                tradingsymbol,
                exchange: exchange || "NFO",
                transaction_type,
                quantity,
                order_type: order_type || "MARKET",
                product: product || "MIS",
                price: price || 0,
                validity: "DAY",
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

    // Add this method to existing ZerodhaService class

    async getCompleteMarketData(userId, symbol = "NIFTY") {
        const opstraService = require("./opstra.service");

        // Step 1: Get price data from Zerodha
        const priceData = await this.getOptionChainData(userId, symbol);

        // Step 2: Get OI data from Opstra/NSE
        const oiData = await opstraService.getCompleteOIData(
            symbol,
            priceData.expiryDate
        );

        // Step 3: Merge both datasets
        const merged = {
            ...priceData,
            ...oiData,

            // Zerodha price data takes priority
            niftyLTP: priceData.niftyLTP,
            niftyOpen: priceData.niftyOpen,
            niftyHigh: priceData.niftyHigh,
            niftyLow: priceData.niftyLow,
            niftyPrevClose: priceData.niftyPrevClose,
            atmStrike: priceData.atmStrike,
            atmCELTP: priceData.atmCELTP,
            atmPELTP: priceData.atmPELTP,
            expiryDate: priceData.expiryDate,
            dte: priceData.dte,

            // OI data from Opstra/NSE
            totalCallPremChg: oiData.totalCallPremChg,
            totalPutPremChg: oiData.totalPutPremChg,
            totalBullishOI: oiData.totalBullishOI,
            totalBearishOI: oiData.totalBearishOI,
            sbOIChg: oiData.sbOIChg,
            lbOIChg: oiData.lbOIChg,
            scOIChg: oiData.scOIChg,
            luOIChg: oiData.luOIChg,
            pcrOI: oiData.pcrOI,
            itmPCR: oiData.itmPCR,
            ivAvg: oiData.ivAvg,
            ivp: oiData.ivp,
            dominantBuildup: oiData.dominantBuildup,

            // VWAP will be added by VWAP calculator
            niftyVWAP: priceData.niftyVWAP,

            timestamp: new Date().toISOString(),
            dataSources: {
                price: "ZERODHA",
                oi: oiData.source,
            },
        };

        logger.info(
            `Market data merged | ` +
            `NIFTY: ${merged.niftyLTP} | ` +
            `PCR: ${merged.pcrOI} | ` +
            `Buildup: ${merged.dominantBuildup} | ` +
            `Sources: ${JSON.stringify(merged.dataSources)}`
        );

        return merged;
    }

    buildOptionSymbol(symbol, expiry, strike, optionType) {
        // Format: NIFTY24JAN25000CE
        const date = new Date(expiry);
        const months = [
            "JAN","FEB","MAR","APR","MAY","JUN",
            "JUL","AUG","SEP","OCT","NOV","DEC"
        ];
        const year = date.getFullYear().toString().slice(-2);
        const month = months[date.getMonth()];
        const day = date.getDate().toString().padStart(2, "0");
        return `${symbol}${year}${day}${month}${strike}${optionType}`;
    }
}

module.exports = new ZerodhaService();
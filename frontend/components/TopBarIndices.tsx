"use client";

import { useEffect, useState } from "react";
import { systemAPI } from "@/lib/api";

interface IndexData {
    instrument_token: number;
    timestamp: string;
    last_price: number;
    ohlc: {
        open: number;
        high: number;
        low: number;
        close: number;
    };
}

interface IndicesResponse {
    timestamp: string;
    nifty: IndexData | null;
    bankNifty: IndexData | null;
    sensex: IndexData | null;
}

export default function TopBarIndices() {
    const [data, setData] = useState<IndicesResponse | null>(null);
    const [error, setError] = useState<boolean>(false);

    useEffect(() => {
        let mounted = true;
        
        const fetchIndices = async () => {
            try {
                const res = await systemAPI.getIndices();
                if (res.data?.success && mounted) {
                    setData(res.data.data);
                    setError(false);
                } else {
                    if (mounted) setError(true);
                }
            } catch (err) {
                if (mounted) setError(true);
            }
        };

        fetchIndices();
        const interval = setInterval(fetchIndices, 2000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const renderIndex = (name: string, indexData: IndexData | null) => {
        if (!indexData) return null;

        const ltp = indexData.last_price;
        const prevClose = indexData.ohlc?.close || ltp;
        const diff = ltp - prevClose;
        const pctDiff = prevClose > 0 ? (diff / prevClose) * 100 : 0;
        
        const isUp = diff >= 0;
        const colorClass = isUp ? "text-green-500" : "text-red-500";
        const sign = isUp ? "+" : "";

        return (
            <div className={`flex flex-col mx-2 px-3 py-1 bg-gray-900/50 rounded border border-gray-800`}>
                <span className="text-[10px] text-gray-500 uppercase font-bold">{name}</span>
                <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-semibold ${colorClass}`}>
                        {ltp.toFixed(2)}
                    </span>
                    <span className={`text-xs ${colorClass}`}>
                        {sign}{diff.toFixed(2)} ({sign}{pctDiff.toFixed(2)}%)
                    </span>
                </div>
            </div>
        );
    };

    const dummyData: IndexData = {
        instrument_token: 0,
        timestamp: "",
        last_price: 0,
        ohlc: { open: 0, high: 0, low: 0, close: 0 }
    };

    if (error) {
            return (
                <a href="/settings/zerodha" className="flex items-center text-xs text-red-500 bg-red-900/20 px-4 py-1 rounded border border-red-900 mx-4 cursor-pointer hover:bg-red-900/40">
                    Zerodha Login Required — Click to Connect
                </a>
            );
    }

    const renderData = data || {
        nifty: dummyData,
        bankNifty: dummyData,
        sensex: dummyData
    };

    return (
        <div className="flex items-center">
            {renderIndex("Nifty 50", renderData.nifty)}
            {renderIndex("Bank Nifty", renderData.bankNifty)}
            {renderIndex("Sensex", renderData.sensex)}
        </div>
    );
}

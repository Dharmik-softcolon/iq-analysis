"use client";

import { useEffect, useState } from "react";
import { systemAPI } from "@/lib/api";

interface IndexData {
    instrument_token: number;
    timestamp: string;
    last_price: number;
    ohlc: { open: number; high: number; low: number; close: number };
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
        const fetch = async () => {
            try {
                const res = await systemAPI.getIndices();
                if (res.data?.success && mounted) { setData(res.data.data); setError(false); }
                else if (mounted) setError(true);
            } catch { if (mounted) setError(true); }
        };
        fetch();
        const iv = setInterval(fetch, 2000);
        return () => { mounted = false; clearInterval(iv); };
    }, []);

    const renderIndex = (name: string, indexData: IndexData | null) => {
        if (!indexData) return null;
        const ltp = indexData.last_price;
        const prev = indexData.ohlc?.close || ltp;
        const diff = ltp - prev;
        const pct = prev > 0 ? (diff / prev) * 100 : 0;
        const isUp = diff >= 0;
        const sign = isUp ? "+" : "";

        return (
            <div
                key={name}
                className="flex items-center gap-2.5 px-3 py-1.5"
                style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-base)",
                    borderRadius: "2px",
                    minWidth: 140,
                }}
            >
                <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
                        {name}
                    </div>
                    <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="num text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>
                            {ltp.toFixed(2)}
                        </span>
                        <span className="num text-[10px] font-semibold" style={{ color: isUp ? "var(--green)" : "var(--red)" }}>
                            {sign}{pct.toFixed(2)}%
                        </span>
                    </div>
                </div>
                <div
                    className="text-[10px] font-bold"
                    style={{ color: isUp ? "var(--green)" : "var(--red)", alignSelf: "center", marginLeft: "auto" }}
                >
                    {isUp ? "▲" : "▼"}
                </div>
            </div>
        );
    };

    if (error) {
        return (
            <a
                href="/settings/zerodha"
                className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-80"
                style={{
                    background: "var(--red-dim)",
                    border: "1px solid var(--red-border)",
                    color: "var(--red)",
                    borderRadius: "2px",
                }}
            >
                <span className="pulse-dot bg-[var(--red)] animate-pulse" />
                Zerodha Login Required
            </a>
        );
    }

    if (!data) return null;

    return (
        <div className="flex items-center gap-2">
            {renderIndex("Nifty 50", data.nifty)}
            {renderIndex("Bank Nifty", data.bankNifty)}
            {renderIndex("Sensex", data.sensex)}
        </div>
    );
}

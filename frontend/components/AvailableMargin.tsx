"use client";

import { useEffect, useState } from "react";
import { systemAPI } from "@/lib/api";

interface MarginsResponse {
    timestamp: string;
    available: number;
    used: number;
}

export default function AvailableMargin() {
    const [margins, setMargins] = useState<MarginsResponse | null>(null);
    const [isVisible, setIsVisible] = useState<boolean>(true);
    const [error, setError] = useState<boolean>(false);

    useEffect(() => {
        let mounted = true;
        const fetch = async () => {
            try {
                const res = await systemAPI.getMargins();
                if (res.data?.success && mounted) { setMargins(res.data.data); setError(false); }
                else if (mounted) setError(true);
            } catch { if (mounted) setError(true); }
        };
        fetch();
        const iv = setInterval(fetch, 2000);
        return () => { mounted = false; clearInterval(iv); };
    }, []);

    if (error) return null;

    const value = isVisible
        ? `₹${(margins?.available || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "₹ ••••••";

    return (
        <div
            className="flex items-center gap-2.5 px-3 py-1.5"
            style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-base)",
                borderRadius: "2px",
            }}
        >
            <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
                    Available Margin
                </div>
                <div className="num text-[12px] font-bold mt-0.5" style={{ color: margins ? "var(--blue)" : "var(--text-muted)" }}>
                    {value}
                </div>
            </div>
            <button
                onClick={() => setIsVisible(!isVisible)}
                className="transition-colors focus:outline-none"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                title={isVisible ? "Hide" : "Show"}
            >
                {isVisible ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                )}
            </button>
        </div>
    );
}

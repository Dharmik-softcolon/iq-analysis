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
        
        const fetchMargins = async () => {
            try {
                const res = await systemAPI.getMargins();
                if (res.data?.success && mounted) {
                    setMargins(res.data.data);
                    setError(false);
                } else {
                    if (mounted) setError(true);
                }
            } catch (err) {
                if (mounted) setError(true);
            }
        };

        fetchMargins();
        const interval = setInterval(fetchMargins, 2000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    if (error) {
        return null; // Fail silently to not clutter the UI exactly like 0.00
    }

    const valueStr = isVisible 
        ? `₹ ${(margins?.available || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
        : `₹ ••••••••`;

    return (
        <div className="flex items-center gap-3 bg-gray-900 border border-gray-800/80 rounded-lg px-4 py-2">
            <span className="text-gray-400 text-sm font-medium">Available Margin:</span>
            <div className="flex items-center gap-2">
                <span className={`text-sm font-medium font-mono tabular-nums tracking-tight ${!margins ? 'text-gray-500' : 'text-blue-400/90'}`}>
                    {valueStr}
                </span>
                <button 
                    onClick={() => setIsVisible(!isVisible)} 
                    className="text-gray-500 hover:text-white transition focus:outline-none"
                    title={isVisible ? "Hide Balance" : "Show Balance"}
                >
                    {isVisible ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}

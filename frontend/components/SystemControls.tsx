"use client";

import { useState } from "react";
import { systemAPI } from "@/lib/api";

interface Props {
    isAutoTrading: boolean;
    capital: number;
    onUpdate: () => void;
}

export default function SystemControls({
                                           isAutoTrading,
                                           capital,
                                           onUpdate,
                                       }: Props) {
    const [loading, setLoading] = useState(false);
    const [newCapital, setNewCapital] = useState(capital.toString());
    const [isChoppy, setIsChoppy] = useState(false);
    const [isTrend, setIsTrend] = useState(false);

    const toggleAutoTrading = async () => {
        if (
            !isAutoTrading &&
            !confirm(
                "Enable auto trading? System will place real orders using Zerodha."
            )
        )
            return;

        setLoading(true);
        try {
            await systemAPI.toggleAutoTrading();
            onUpdate();
        } catch {
            alert("Failed to toggle auto trading");
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        try {
            await systemAPI.updateSettings({
                capital: Number(newCapital),
                isChoppyMonth: isChoppy,
                isTrendMonth: isTrend,
            });
            alert("Settings saved");
            onUpdate();
        } catch {
            alert("Failed to save settings");
        }
    };

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-white font-bold text-lg mb-4">
                System Controls
            </h2>

            {/* Auto Trading Toggle */}
            <div className="mb-6 p-4 rounded-lg bg-gray-800 border border-gray-700">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-white font-medium">Auto Trading</div>
                        <div className="text-gray-400 text-sm">
                            {isAutoTrading
                                ? "🟢 LIVE — Real orders being placed"
                                : "🔴 DISABLED — Paper mode"}
                        </div>
                    </div>
                    <button
                        onClick={toggleAutoTrading}
                        disabled={loading}
                        className={`px-6 py-3 rounded-lg font-bold transition ${
                            isAutoTrading
                                ? "bg-red-700 hover:bg-red-600 text-white"
                                : "bg-green-700 hover:bg-green-600 text-white"
                        } disabled:opacity-50`}
                    >
                        {loading
                            ? "..."
                            : isAutoTrading
                                ? "DISABLE"
                                : "ENABLE"}
                    </button>
                </div>
            </div>

            {/* Capital Setting */}
            <div className="mb-4">
                <label className="text-gray-400 text-sm block mb-2">
                    Trading Capital (₹)
                </label>
                <input
                    type="number"
                    value={newCapital}
                    onChange={(e) => setNewCapital(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg
                     px-4 py-2 text-white focus:outline-none
                     focus:border-blue-500"
                />
            </div>

            {/* Month Type */}
            <div className="mb-4">
                <label className="text-gray-400 text-sm block mb-2">
                    Month Classification
                </label>
                <div className="flex gap-3">
                    <button
                        onClick={() => { setIsChoppy(false); setIsTrend(false); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                            !isChoppy && !isTrend
                                ? "bg-blue-900 border-blue-600 text-blue-400"
                                : "bg-gray-800 border-gray-600 text-gray-400"
                        }`}
                    >
                        Normal
                    </button>
                    <button
                        onClick={() => { setIsChoppy(true); setIsTrend(false); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                            isChoppy
                                ? "bg-orange-900 border-orange-600 text-orange-400"
                                : "bg-gray-800 border-gray-600 text-gray-400"
                        }`}
                    >
                        Choppy
                    </button>
                    <button
                        onClick={() => { setIsTrend(true); setIsChoppy(false); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                            isTrend
                                ? "bg-green-900 border-green-600 text-green-400"
                                : "bg-gray-800 border-gray-600 text-gray-400"
                        }`}
                    >
                        Trending
                    </button>
                </div>
            </div>

            {/* Save */}
            <button
                onClick={saveSettings}
                className="w-full py-3 bg-blue-700 hover:bg-blue-600
                   text-white rounded-lg font-bold transition"
            >
                Save Settings
            </button>

            {/* Warning */}
            {isAutoTrading && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                    <div className="text-red-400 text-sm font-bold mb-1">
                        ⚠️ LIVE TRADING ACTIVE
                    </div>
                    <div className="text-red-300 text-xs">
                        Real money is at risk. System is placing live orders on Zerodha.
                        Monitor constantly. Emergency exit available on active positions.
                    </div>
                </div>
            )}
        </div>
    );
}
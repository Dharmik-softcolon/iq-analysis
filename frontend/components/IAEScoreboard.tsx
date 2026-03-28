"use client";

import { IAEBreakdown } from "@/lib/types";

interface Props {
    score: number;
    breakdown: IAEBreakdown;
}

const engines = [
    { key: "isIb", label: "IS/IB Engine", max: 2, desc: "Premium Change > 80" },
    { key: "pureOI", label: "Pure OI", max: 2, desc: "One-sided OI conviction" },
    { key: "oiDelta", label: "OI Delta", max: 1, desc: "Fresh positioning > 100Cr" },
    { key: "volX", label: "VolX (PCR)", max: 1, desc: "PCR < 0.75 or > 1.30" },
    { key: "gamma", label: "Gamma", max: 1, desc: "IV > 9% near expiry" },
    { key: "mp", label: "MP Accept", max: 1, desc: "Price vs VWAP" },
    { key: "tre", label: "TRE", max: 1, desc: "Trap reversal setup" },
];

const getScoreColor = (score: number) => {
    if (score >= 7) return "text-green-400";
    if (score >= 6) return "text-green-500";
    if (score >= 5) return "text-yellow-400";
    if (score >= 4) return "text-orange-400";
    return "text-red-500";
};

const getScoreLabel = (score: number) => {
    if (score >= 7) return "MAX CONVICTION";
    if (score >= 6) return "FULL SIZE";
    if (score >= 5) return "3/4 SIZE";
    if (score >= 4) return "HALF SIZE";
    return "NO TRADE";
};

export default function IAEScoreboard({ score, breakdown }: Props) {
    return (
        <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-6 shadow-sm flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-gray-100 font-semibold tracking-tight text-lg">
                        IAE Scoring Engine
                    </h2>
                    <p className="text-gray-500 text-xs mt-0.5">
                        Institutional Aggression v2.0
                    </p>
                </div>
                <div className="text-right">
                    <div className={`text-4xl font-bold tracking-tighter font-mono tabular-nums ${getScoreColor(score)}`}>
                        {score}<span className="text-2xl text-gray-500">/8</span>
                    </div>
                    <div className={`text-[11px] font-bold tracking-wider mt-1 ${getScoreColor(score)}`}>
                        {getScoreLabel(score)}
                    </div>
                </div>
            </div>

            {/* Score bar */}
            <div className="mb-6">
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${
                            score >= 6
                                ? "bg-green-500"
                                : score >= 4
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                        }`}
                        style={{ width: `${(score / 8) * 100}%` }}
                    />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>4 (MIN)</span>
                    <span>6</span>
                    <span>8</span>
                </div>
            </div>

            {/* Engine breakdown */}
            <div className="grid grid-cols-2 gap-3">
                {engines.map((engine) => {
                    const value = (breakdown ?? {})[engine.key as keyof IAEBreakdown] || 0;

                    const fired = value > 0;

                    return (
                        <div
                            key={engine.key}
                            className={`flex items-center justify-between p-2.5 rounded-lg border ${
                                fired
                                    ? "border-green-700/40 bg-green-900/10"
                                    : "border-gray-800/50 bg-gray-800/20"
                            }`}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        fired ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-gray-700"
                                    }`}
                                />
                                <div className="min-w-0 pr-2">
                                    <div className={`text-xs font-semibold truncate ${fired ? 'text-gray-200' : 'text-gray-400'}`}>
                                        {engine.label}
                                    </div>
                                    <div className="text-[10px] text-gray-500 truncate">{engine.desc}</div>
                                </div>
                            </div>
                            <div
                                className={`text-sm font-semibold font-mono tabular-nums tracking-tight shrink-0 ${
                                    fired ? "text-green-400" : "text-gray-600"
                                }`}
                            >
                                <span className={fired ? '' : 'opacity-0'}>+</span>{value}<span className="text-[10px] text-gray-600">/{engine.max}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Trade verdict */}
            <div className="mt-auto pt-6">
                <div
                    className={`p-3 rounded-lg text-center font-semibold tracking-tight text-sm ${
                        score >= 6
                            ? "bg-green-900/20 border border-green-700/50 text-green-400"
                            : score >= 4
                                ? "bg-yellow-900/20 border border-yellow-700/50 text-yellow-400"
                                : "bg-red-900/10 border border-red-900/50 text-red-500/80"
                    }`}
                >
                    {score >= 4
                        ? `TRADE PERMITTED — ${(
                            score >= 6 ? 100 : score === 5 ? 75 : 50
                        )}% SIZE`
                        : "NO TRADE — SCORE BELOW MINIMUM"}
                </div>
            </div>
        </div>
    );
}
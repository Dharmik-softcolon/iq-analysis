"use client";

import { IAEBreakdown } from "@/lib/types";

interface Props {
    score: number;
    breakdown: IAEBreakdown;
}

const engines = [
    { key: "isIb",   label: "IS / IB Engine",   max: 2, desc: "Premium Δ > 80" },
    { key: "pureOI", label: "Pure OI",           max: 2, desc: "One-sided conviction" },
    { key: "oiDelta",label: "OI Delta",          max: 1, desc: "Fresh pos > ₹100Cr" },
    { key: "volX",   label: "VolX · PCR",        max: 1, desc: "PCR < 0.75 or > 1.30" },
    { key: "gamma",  label: "Gamma",             max: 1, desc: "IV > 9% near expiry" },
    { key: "mp",     label: "MP Accept",         max: 1, desc: "Price vs VWAP" },
    { key: "tre",    label: "TRE",               max: 1, desc: "Trap reversal setup" },
];

const getScoreColor = (score: number) => {
    if (score >= 7) return "var(--green)";
    if (score >= 6) return "#6EE7B7";
    if (score >= 5) return "var(--yellow)";
    if (score >= 4) return "#F97316";
    return "var(--red)";
};

const getScoreLabel = (score: number) => {
    if (score >= 7) return "MAX CONVICTION";
    if (score >= 6) return "FULL SIZE";
    if (score >= 5) return "¾ SIZE";
    if (score >= 4) return "½ SIZE";
    return "NO TRADE";
};

const getVerdictStyle = (score: number) => {
    if (score >= 6) return { bg: "var(--green-dim)", border: "var(--green-border)", color: "var(--green)" };
    if (score >= 4) return { bg: "var(--yellow-dim)", border: "var(--yellow-border)", color: "var(--yellow)" };
    return { bg: "var(--red-dim)", border: "var(--red-border)", color: "var(--red)" };
};

export default function IAEScoreboard({ score, breakdown }: Props) {
    const scoreColor = getScoreColor(score);
    const verdict = getVerdictStyle(score);
    const pct = (score / 8) * 100;

    const barColor = score >= 6 ? "var(--green)" : score >= 4 ? "var(--yellow)" : "var(--red)";

    return (
        <div className="card p-5 flex flex-col h-full">

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="section-title mb-1">IAE Scoring Engine</div>
                    <div className="text-[12px] font-medium text-white">Institutional Aggression v2.0</div>
                </div>
                <div className="text-right">
                    <div className="num font-black leading-none" style={{ fontSize: 40, color: scoreColor, letterSpacing: "-0.04em" }}>
                        {score}
                        <span className="text-xl font-semibold" style={{ color: "var(--text-muted)" }}>/8</span>
                    </div>
                    <div className="text-[10px] font-bold tracking-widest mt-1" style={{ color: scoreColor }}>
                        {getScoreLabel(score)}
                    </div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
                <div className="h-1.5 rounded-none overflow-hidden" style={{ background: "var(--border-strong)" }}>
                    <div
                        className="h-full transition-all duration-700 ease-out"
                        style={{ width: `${pct}%`, background: barColor }}
                    />
                </div>
                <div className="flex justify-between mt-1.5">
                    {[0, 4, 6, 8].map(n => (
                        <span key={n} className="text-[9px] font-semibold" style={{ color: "var(--text-muted)" }}>{n}</span>
                    ))}
                </div>
            </div>

            {/* Engine rows */}
            <div className="grid grid-cols-2 gap-1.5 mb-4">
                {engines.map((engine) => {
                    const value = (breakdown ?? {})[engine.key as keyof IAEBreakdown] || 0;
                    const fired = value > 0;
                    return (
                        <div
                            key={engine.key}
                            className="flex items-center justify-between px-3 py-2 transition-colors"
                            style={{
                                background: fired ? "rgba(34,208,122,0.05)" : "var(--bg-elevated)",
                                border: `1px solid ${fired ? "var(--green-border)" : "var(--border-subtle)"}`,
                                borderRadius: "2px",
                            }}
                        >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                                <div
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{
                                        background: fired ? "var(--green)" : "var(--text-muted)",
                                        boxShadow: fired ? "0 0 6px rgba(34,208,122,0.6)" : "none",
                                    }}
                                />
                                <div className="min-w-0">
                                    <div className="text-[11px] font-semibold truncate" style={{ color: fired ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                        {engine.label}
                                    </div>
                                    <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                                        {engine.desc}
                                    </div>
                                </div>
                            </div>
                            <div className="num text-[11px] font-bold shrink-0 ml-2" style={{ color: fired ? "var(--green)" : "var(--text-muted)" }}>
                                {fired ? `+${value}` : "—"}
                                <span className="text-[9px] ml-0.5" style={{ color: "var(--text-muted)" }}>/{engine.max}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Verdict banner */}
            <div className="mt-auto">
                <div
                    className="w-full px-4 py-3 text-center text-[11px] font-bold tracking-widest uppercase"
                    style={{
                        background: verdict.bg,
                        border: `1px solid ${verdict.border}`,
                        color: verdict.color,
                        borderRadius: "2px",
                    }}
                >
                    {score >= 4
                        ? `Trade Permitted — ${score >= 6 ? 100 : score === 5 ? 75 : 50}% Size`
                        : "No Trade — Score Below Minimum"}
                </div>
            </div>
        </div>
    );
}
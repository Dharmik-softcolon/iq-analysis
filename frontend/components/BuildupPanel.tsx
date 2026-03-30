"use client";

interface Props {
    dominantBuildup?: string;
    iv?: number;
    ivp?: number;
    lbOIChg?: number;
    sbOIChg?: number;
    scOIChg?: number;
    luOIChg?: number;
    totalBullishOI?: number;
    totalBearishOI?: number;
}

const BUILDUP_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: string; desc: string }> = {
    LB:   { label: "Long Buildup",   color: "var(--green)",  bg: "var(--green-dim)",  border: "var(--green-border)",  icon: "↑", desc: "OI↑ Price↑ · Bullish" },
    SB:   { label: "Short Buildup",  color: "var(--red)",    bg: "var(--red-dim)",    border: "var(--red-border)",    icon: "↓", desc: "OI↑ Price↓ · Bearish" },
    SC:   { label: "Short Cover",    color: "var(--green)",  bg: "var(--green-dim)",  border: "var(--green-border)",  icon: "↗", desc: "OI↓ Price↑ · Bullish" },
    LU:   { label: "Long Unwind",    color: "var(--red)",    bg: "var(--red-dim)",    border: "var(--red-border)",    icon: "↘", desc: "OI↓ Price↓ · Bearish" },
    NONE: { label: "No Signal",      color: "var(--text-secondary)", bg: "var(--bg-elevated)", border: "var(--border-base)", icon: "—", desc: "Awaiting data" },
    MIXED:{ label: "Mixed",          color: "var(--yellow)", bg: "var(--yellow-dim)", border: "var(--yellow-border)", icon: "~", desc: "Conflicting signals" },
};

function fmtCr(v?: number) {
    if (v == null || isNaN(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 100) return `${v >= 0 ? "+" : ""}${v.toFixed(1)}Cr`;
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}Cr`;
}

function fmtIVP(v?: number) {
    if (v == null) return "—";
    return `${v.toFixed(1)}`;
}

export default function BuildupPanel({
    dominantBuildup = "NONE",
    iv, ivp,
    lbOIChg = 0, sbOIChg = 0, scOIChg = 0, luOIChg = 0,
    totalBullishOI = 0, totalBearishOI = 0,
}: Props) {

    const cfg = BUILDUP_CONFIG[dominantBuildup] ?? BUILDUP_CONFIG.NONE;
    const totalOI = (totalBullishOI + totalBearishOI) || 1;
    const bullPct = Math.round((totalBullishOI / totalOI) * 100);
    const bearPct = 100 - bullPct;

    const ivpColor = ivp == null ? "var(--text-secondary)"
        : ivp >= 80 ? "var(--red)"
        : ivp >= 60 ? "var(--yellow)"
        : ivp >= 40 ? "var(--green)"
        : "var(--blue)";

    const rows = [
        { key: "LB", label: "Long Buildup",  icon: "↑", color: "var(--green)", value: lbOIChg,  dir: "Bull" },
        { key: "SC", label: "Short Cover",   icon: "↗", color: "var(--green)", value: scOIChg,  dir: "Bull" },
        { key: "SB", label: "Short Buildup", icon: "↓", color: "var(--red)",   value: sbOIChg,  dir: "Bear" },
        { key: "LU", label: "Long Unwind",   icon: "↘", color: "var(--red)",   value: luOIChg,  dir: "Bear" },
    ];

    return (
        <div className="card p-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <span className="section-title">OI Buildup</span>
                <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
                {/* Dominant badge */}
                <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold border"
                    style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}
                >
                    <span className="text-[13px] leading-none">{cfg.icon}</span>
                    <span>{cfg.label}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">

                {/* ── Buildup rows ── */}
                <div className="grid grid-cols-2 gap-2">
                    {rows.map((r) => (
                        <div
                            key={r.key}
                            className="flex items-center justify-between px-3 py-2 rounded"
                            style={{
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-subtle)",
                            }}
                        >
                            <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-bold" style={{ color: r.color }}>{r.icon}</span>
                                <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                                        {r.key}
                                    </div>
                                    <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>{r.label}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="num text-[13px] font-semibold" style={{ color: r.value >= 0.001 ? r.color : "var(--text-secondary)" }}>
                                    {fmtCr(r.value)}
                                </div>
                                <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>{r.dir}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Bull vs Bear bar ── */}
                <div>
                    <div className="flex justify-between text-[10px] mb-1" style={{ color: "var(--text-secondary)" }}>
                        <span style={{ color: "var(--green)" }}>▲ Bullish {fmtCr(totalBullishOI)} ({bullPct}%)</span>
                        <span style={{ color: "var(--red)" }}>Bearish {fmtCr(totalBearishOI)} ({bearPct}%) ▼</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "var(--bg-elevated)" }}>
                        <div
                            className="h-full transition-all duration-700 rounded-l-full"
                            style={{ width: `${bullPct}%`, background: "var(--green)" }}
                        />
                        <div
                            className="h-full transition-all duration-700 rounded-r-full"
                            style={{ width: `${bearPct}%`, background: "var(--red)" }}
                        />
                    </div>
                </div>

                {/* ── IV & IVP ── */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="stat-pill">
                        <div className="label">Implied Volatility</div>
                        <div className="num metric text-[15px]" style={{ color: "var(--text-primary)" }}>
                            {iv != null ? `${iv.toFixed(2)}%` : "—"}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Black-Scholes ATM</div>
                    </div>
                    <div className="stat-pill">
                        <div className="label">IVP</div>
                        <div className="num metric text-[15px]" style={{ color: ivpColor }}>
                            {fmtIVP(ivp)}{ivp != null ? "%" : ""}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {ivp == null ? "—" : ivp >= 80 ? "Very High IV" : ivp >= 60 ? "High IV" : ivp >= 40 ? "Normal" : "Low IV"}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

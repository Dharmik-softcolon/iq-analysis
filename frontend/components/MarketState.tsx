"use client";

import { MarketState, Direction, SystemMode } from "@/lib/types";

interface Props {
    state: MarketState;
    direction: Direction;
    systemMode: SystemMode;
    niftyLTP: number;
    pcr: number;
    dte: number;
    dailyPnL: number;
    tradesToday: number;
}

const stateConfig = {
    DISCOVERY:  { color: "var(--green)",  bg: "var(--green-dim)",  border: "var(--green-border)",  desc: "200-400 pts · Full size" },
    TRANSITION: { color: "var(--yellow)", bg: "var(--yellow-dim)", border: "var(--yellow-border)", desc: "80-200 pts · Normal" },
    BALANCE:    { color: "#F97316",       bg: "#1A0D00",           border: "#6B3010",              desc: "30-80 pts · IAE 6+" },
    UNKNOWN:    { color: "var(--text-secondary)", bg: "var(--bg-elevated)", border: "var(--border-base)", desc: "Awaiting IB..." },
};

const directionConfig = {
    BULL:     { color: "var(--green)",  icon: "▲", label: "BULL · CE" },
    BEAR:     { color: "var(--red)",    icon: "▼", label: "BEAR · PE" },
    NO_TRADE: { color: "var(--text-secondary)", icon: "—", label: "NONE" },
};

const modeConfig = {
    NORMAL:   { color: "var(--blue)",   label: "NORMAL" },
    EVENT:    { color: "var(--purple)", label: "EVENT" },
    STANDBY:  { color: "var(--text-secondary)", label: "STANDBY" },
    SHUTDOWN: { color: "var(--red)",    label: "SHUTDOWN" },
};

const metrics = (
    state: MarketState, direction: Direction, systemMode: SystemMode,
    niftyLTP: number, pcr: number, dte: number, dailyPnL: number, tradesToday: number
) => {
    const sc = stateConfig[state] ?? stateConfig.UNKNOWN;
    const dc = directionConfig[direction] ?? directionConfig.NO_TRADE;
    const mc = modeConfig[systemMode] ?? modeConfig.STANDBY;
    const pnlPos = (dailyPnL ?? 0) >= 0;

    return [
        {
            label: "Market State",
            value: state,
            valueColor: sc.color,
            sub: sc.desc,
            bg: sc.bg,
            border: sc.border,
        },
        {
            label: "Direction",
            value: `${dc.icon} ${dc.label}`,
            valueColor: dc.color,
            sub: direction === "BULL" ? "Long CE" : direction === "BEAR" ? "Long PE" : "No signal",
            bg: direction === "BULL" ? "var(--green-dim)" : direction === "BEAR" ? "var(--red-dim)" : "var(--bg-elevated)",
            border: direction === "BULL" ? "var(--green-border)" : direction === "BEAR" ? "var(--red-border)" : "var(--border-base)",
        },
        {
            label: "Nifty LTP",
            value: (niftyLTP ?? 0).toLocaleString("en-IN"),
            valueColor: "var(--text-primary)",
            sub: "NSE Cash",
            mono: true,
        },
        {
            label: "PCR OI",
            value: (pcr ?? 0).toFixed(2),
            valueColor: pcr < 0.75 ? "var(--red)" : pcr > 1.3 ? "var(--green)" : "var(--yellow)",
            sub: pcr < 0.75 ? "Bearish" : pcr > 1.3 ? "Bullish" : "Neutral",
            mono: true,
        },
        {
            label: "Daily P&L",
            value: `${pnlPos ? "+" : ""}₹${Math.abs(dailyPnL ?? 0).toLocaleString("en-IN")}`,
            valueColor: pnlPos ? "var(--green)" : "var(--red)",
            sub: pnlPos ? "Profitable" : "Drawdown",
            bg: pnlPos ? "var(--green-dim)" : "var(--red-dim)",
            border: pnlPos ? "var(--green-border)" : "var(--red-border)",
            mono: true,
        },
        {
            label: "DTE",
            value: String(dte ?? 0),
            valueColor: (dte ?? 0) <= 1 ? "var(--red)" : "var(--text-primary)",
            sub: (dte ?? 0) <= 1 ? "Expiry day" : "Days to expiry",
            mono: true,
        },
        {
            label: "Trades Today",
            value: `${tradesToday ?? 0}/2`,
            valueColor: "var(--text-primary)",
            sub: tradesToday >= 2 ? "Max trades" : `${2 - (tradesToday ?? 0)} remaining`,
            mono: true,
        },
        {
            label: "System Mode",
            value: mc.label,
            valueColor: mc.color,
            sub: systemMode === "NORMAL" ? "Trading active" : systemMode === "EVENT" ? "Event rules" : systemMode === "SHUTDOWN" ? "Halted" : "Waiting",
        },
    ];
};

export default function MarketStatePanel({ state, direction, systemMode, niftyLTP, pcr, dte, dailyPnL, tradesToday }: Props) {
    const cells = metrics(state, direction, systemMode, niftyLTP, pcr, dte, dailyPnL, tradesToday);

    return (
        <div className="card p-4">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
                <span className="section-title">Market Overview</span>
                <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {cells.map((cell) => (
                    <div
                        key={cell.label}
                        className="stat-pill"
                        style={cell.bg ? {
                            background: cell.bg,
                            borderColor: cell.border ?? "var(--border-base)",
                        } : undefined}
                    >
                        <div className="label">{cell.label}</div>
                        <div
                            className={`metric text-[15px] ${cell.mono ? "num" : ""}`}
                            style={{ color: cell.valueColor }}
                        >
                            {cell.value}
                        </div>
                        {cell.sub && (
                            <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                                {cell.sub}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
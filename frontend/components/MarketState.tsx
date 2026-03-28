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
    DISCOVERY: {
        color: "text-green-400",
        bg: "bg-green-900/30 border-green-600",
        desc: "200-400 pts expected | Full size permitted",
    },
    TRANSITION: {
        color: "text-yellow-400",
        bg: "bg-yellow-900/30 border-yellow-600",
        desc: "80-200 pts expected | Normal trading",
    },
    BALANCE: {
        color: "text-orange-400",
        bg: "bg-orange-900/30 border-orange-600",
        desc: "30-80 pts | IAE 6+ only",
    },
    UNKNOWN: {
        color: "text-gray-400",
        bg: "bg-gray-900/30 border-gray-600",
        desc: "Waiting for IB close...",
    },
};

const directionConfig = {
    BULL: { color: "text-green-400", icon: "▲", label: "BULL (CE)" },
    BEAR: { color: "text-red-400", icon: "▼", label: "BEAR (PE)" },
    NO_TRADE: {
        color: "text-gray-400",
        icon: "—",
        label: "NO DIRECTION",
    },
};

const modeConfig = {
    NORMAL: { color: "text-blue-400", label: "NORMAL MODE" },
    EVENT: { color: "text-purple-400", label: "EVENT MODE" },
    STANDBY: { color: "text-gray-400", label: "STANDBY" },
    SHUTDOWN: { color: "text-red-500", label: "SHUTDOWN" },
};

export default function MarketStatePanel({
                                             state,
                                             direction,
                                             systemMode,
                                             niftyLTP,
                                             pcr,
                                             dte,
                                             dailyPnL,
                                             tradesToday,
                                         }: Props) {
    const sc = stateConfig[state];
    const dc = directionConfig[direction];
    const mc = modeConfig[systemMode];

    return (
        <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-6 shadow-sm">
            <h2 className="text-gray-100 font-semibold tracking-tight text-lg mb-4">
                Market Overview
            </h2>

            <div className="grid grid-cols-2 gap-4">
                {/* Market State */}
                <div className={`p-4 rounded-lg border ${sc.bg}`}>
                    <div className="text-gray-500 text-[11px] font-medium tracking-wider mb-1">MARKET STATE</div>
                    <div className={`text-2xl font-bold tracking-tight ${sc.color}`}>{state}</div>
                    <div className="text-gray-500 text-xs mt-1">{sc.desc}</div>
                </div>

                {/* Direction */}
                <div
                    className={`p-4 rounded-lg border ${
                        direction === "BULL"
                            ? "bg-green-900/30 border-green-600/50"
                            : direction === "BEAR"
                                ? "bg-red-900/30 border-red-600/50"
                                : "bg-gray-800/40 border-gray-700/50"
                    }`}
                >
                    <div className="text-gray-500 text-[11px] font-medium tracking-wider mb-1">DIRECTION</div>
                    <div className={`text-2xl font-bold tracking-tight ${dc.color}`}>
                        {dc.icon} {dc.label}
                    </div>
                </div>

                {/* NIFTY LTP */}
                <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/50">
                    <div className="text-gray-500 text-[11px] font-medium tracking-wider mb-1">NIFTY LTP</div>
                    <div className="text-2xl font-semibold tracking-tight text-gray-100 font-mono tabular-nums">
                        {(niftyLTP ?? 0).toLocaleString("en-IN")}
                    </div>
                </div>

                {/* PCR */}
                <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/50">
                    <div className="text-gray-500 text-[11px] font-medium tracking-wider mb-1">PCR OI</div>
                    <div
                        className={`text-2xl font-semibold tracking-tight font-mono tabular-nums ${
                            pcr < 0.75
                                ? "text-red-400"
                                : pcr > 1.3
                                    ? "text-green-400"
                                    : "text-yellow-400"
                        }`}
                    >
                        {(pcr ?? 0).toFixed(2)}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                        {(pcr ?? 0) < 0.75
                            ? "Bear pressure"
                            : (pcr ?? 0) > 1.3
                                ? "Bull support"
                                : "Balanced"}
                    </div>
                </div>

                {/* Daily P&L */}
                <div
                    className={`p-4 rounded-lg border ${
                        (dailyPnL ?? 0) >= 0
                            ? "bg-green-900/20 border-green-700/50"
                            : "bg-red-900/20 border-red-700/50"
                    }`}
                >
                    <div className="text-gray-500 text-[11px] font-medium tracking-wider mb-1">DAILY P&L</div>
                    <div
                        className={`text-2xl font-semibold tracking-tight font-mono tabular-nums ${
                            (dailyPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        {(dailyPnL ?? 0) >= 0 ? "+" : ""}₹
                        {Math.abs(dailyPnL ?? 0).toLocaleString("en-IN")}
                    </div>
                </div>

                {/* DTE + Trades */}
                <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/50">
                    <div className="flex justify-between">
                        <div>
                            <div className="text-gray-500 text-[11px] font-medium tracking-wider mb-1">DTE</div>
                            <div
                                className={`text-2xl font-semibold tracking-tight font-mono tabular-nums ${
                                    (dte ?? 0) <= 1 ? "text-red-400" : "text-gray-100"
                                }`}
                            >
                                {dte ?? 0}
                            </div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-[11px] font-medium tracking-wider mb-1">TRADES</div>
                            <div className="text-2xl font-semibold tracking-tight text-gray-100 font-mono tabular-nums">
                                {tradesToday ?? 0}/2
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* System Mode */}
            <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-700/50">
                <div className="text-gray-400 text-sm font-medium">System Mode</div>
                <div className={`font-semibold tracking-tight ${mc.color}`}>{mc.label}</div>
            </div>
        </div>
    );
}
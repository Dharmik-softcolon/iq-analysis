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
        bg: "bg-green-900/30 border-green-600/50",
        desc: "200-400 pts | Full size",
    },
    TRANSITION: {
        color: "text-yellow-400",
        bg: "bg-yellow-900/30 border-yellow-600/50",
        desc: "80-200 pts | Normal",
    },
    BALANCE: {
        color: "text-orange-400",
        bg: "bg-orange-900/30 border-orange-600/50",
        desc: "30-80 pts | IAE 6+",
    },
    UNKNOWN: {
        color: "text-gray-400",
        bg: "bg-gray-900/30 border-gray-600/50",
        desc: "Waiting for IB...",
    },
};

const directionConfig = {
    BULL: { color: "text-green-400", icon: "▲", label: "BULL (CE)" },
    BEAR: { color: "text-red-400", icon: "▼", label: "BEAR (PE)" },
    NO_TRADE: {
        color: "text-gray-400",
        icon: "—",
        label: "NONE",
    },
};

const modeConfig = {
    NORMAL: { color: "text-blue-400", label: "NORMAL" },
    EVENT: { color: "text-purple-400", label: "EVENT" },
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
        <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-4 shadow-sm">
            <h2 className="text-gray-100 font-medium tracking-tight text-sm mb-3">
                Market Overview
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* Market State */}
                <div className={`p-2.5 rounded-lg border flex flex-col justify-center ${sc.bg}`}>
                    <div className="text-gray-500 text-[10px] font-medium tracking-wider mb-0.5">MARKET STATE</div>
                    <div className={`text-base font-bold tracking-tight leading-tight ${sc.color}`}>{state}</div>
                    <div className="text-gray-500 text-[10px] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis" title={sc.desc}>{sc.desc}</div>
                </div>

                {/* Direction */}
                <div
                    className={`p-2.5 rounded-lg border flex flex-col justify-center ${
                        direction === "BULL"
                            ? "bg-green-900/30 border-green-600/50"
                            : direction === "BEAR"
                                ? "bg-red-900/30 border-red-600/50"
                                : "bg-gray-800/40 border-gray-700/50"
                    }`}
                >
                    <div className="text-gray-500 text-[10px] font-medium tracking-wider mb-0.5">DIRECTION</div>
                    <div className={`text-base font-bold tracking-tight leading-tight ${dc.color}`}>
                        {dc.icon} {dc.label}
                    </div>
                </div>

                {/* NIFTY LTP */}
                <div className="p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 flex flex-col justify-center">
                    <div className="text-gray-500 text-[10px] font-medium tracking-wider mb-0.5">NIFTY LTP</div>
                    <div className="text-base font-semibold tracking-tight leading-tight text-gray-100 font-mono tabular-nums">
                        {(niftyLTP ?? 0).toLocaleString("en-IN")}
                    </div>
                </div>

                {/* PCR */}
                <div className="p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 flex flex-col justify-center">
                    <div className="text-gray-500 text-[10px] font-medium tracking-wider mb-0.5">PCR OI</div>
                    <div
                        className={`text-base font-semibold tracking-tight leading-tight font-mono tabular-nums ${
                            pcr < 0.75
                                ? "text-red-400"
                                : pcr > 1.3
                                    ? "text-green-400"
                                    : "text-yellow-400"
                        }`}
                    >
                        {(pcr ?? 0).toFixed(2)}
                    </div>
                </div>

                {/* Daily P&L */}
                <div
                    className={`p-2.5 rounded-lg border flex flex-col justify-center ${
                        (dailyPnL ?? 0) >= 0
                            ? "bg-green-900/20 border-green-700/50"
                            : "bg-red-900/20 border-red-700/50"
                    }`}
                >
                    <div className="text-gray-500 text-[10px] font-medium tracking-wider mb-0.5">DAILY P&L</div>
                    <div
                        className={`text-base font-semibold tracking-tight leading-tight font-mono tabular-nums ${
                            (dailyPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        {(dailyPnL ?? 0) >= 0 ? "+" : ""}₹{Math.abs(dailyPnL ?? 0).toLocaleString("en-IN")}
                    </div>
                </div>

                {/* DTE */}
                <div className="p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 flex flex-col justify-center">
                    <div className="text-gray-500 text-[10px] font-medium tracking-wider mb-0.5">DTE</div>
                    <div className={`text-base font-semibold tracking-tight leading-tight font-mono tabular-nums ${
                        (dte ?? 0) <= 1 ? "text-red-400" : "text-gray-100"
                    }`}>
                        {dte ?? 0}
                    </div>
                </div>

                {/* Trades */}
                <div className="p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 flex flex-col justify-center">
                    <div className="text-gray-500 text-[10px] font-medium tracking-wider mb-0.5">TRADES</div>
                    <div className="text-base font-semibold tracking-tight leading-tight text-gray-100 font-mono tabular-nums">
                        {tradesToday ?? 0}/2
                    </div>
                </div>

                {/* System Mode */}
                <div className="p-2.5 rounded-lg bg-gray-800/30 border border-gray-700/50 flex flex-col justify-center">
                    <div className="text-gray-500 text-[10px] font-medium tracking-wider mb-0.5">SYSTEM MODE</div>
                    <div className={`text-base font-semibold tracking-tight leading-tight ${mc.color}`}>
                        {mc.label}
                    </div>
                </div>

            </div>
        </div>
    );
}
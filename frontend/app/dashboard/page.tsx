"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { systemAPI, tradeAPI, authAPI } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { SystemState, Trade, TradeStats } from "@/lib/types";

import IAEScoreboard from "@/components/IAEScoreboard";
import MarketStatePanel from "@/components/MarketState";
import ActiveTrade from "@/components/ActiveTrade";
import TradeHistory from "@/components/TradeHistory";
import SystemControls from "@/components/SystemControls";
import StatsPanel from "@/components/StatsPanel";
import PnLChart from "@/components/PnLChart";
import AlertPanel from "@/components/AlertPanel";
import TopBarIndices from "@/components/TopBarIndices";
import AvailableMargin from "@/components/AvailableMargin";
import BuildupPanel from "@/components/BuildupPanel";
import HistoricalBuildupView from "@/components/HistoricalBuildupView";

const defaultState: SystemState = {
    timestamp: "",
    systemMode: "STANDBY",
    marketState: "UNKNOWN",
    iaeScore: 0,
    iaeBreakdown: { isIb: 0, pureOI: 0, oiDelta: 0, volX: 0, gamma: 0, mp: 0, tre: 0 },
    direction: "NO_TRADE",
    activePositions: 0,
    tradesToday: 0,
    dailyPnL: 0,
    capital: 0,
    niftyLTP: 0,
    pcr: 1.0,
    dte: 5,
};

const TABS = [
    { id: "overview",   label: "Overview" },
    { id: "trades",     label: "Trade Log" },
    { id: "stats",      label: "Statistics" },
    { id: "positions",  label: "Positions" },
    { id: "alerts",     label: "Alerts" },
    { id: "curve",      label: "P&L Curve" },
    { id: "oibuildup",  label: "OI Buildup" },
] as const;

type TabId = typeof TABS[number]["id"];

const modeStyle: Record<string, { dot: string; text: string; bg: string }> = {
    NORMAL:   { dot: "bg-blue-400",   text: "text-blue-400",   bg: "bg-[var(--blue-dim)] border-[var(--blue-border)]" },
    EVENT:    { dot: "bg-purple-400", text: "text-purple-400", bg: "bg-[var(--purple-dim)] border-[var(--purple-border)]" },
    SHUTDOWN: { dot: "bg-red-400",    text: "text-red-400",    bg: "bg-[var(--red-dim)] border-[var(--red-border)]" },
    STANDBY:  { dot: "bg-gray-500",   text: "text-gray-400",   bg: "bg-[var(--bg-elevated)] border-[var(--border-base)]" },
};

export default function DashboardPage() {
    const router = useRouter();
    const [state, setState] = useState<SystemState>(defaultState);
    const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
    const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
    const [stats, setStats] = useState<TradeStats | null>(null);
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<TabId>("overview");
    const [lastUpdated, setLastUpdated] = useState<string>("");
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("whalehq_token");
        const userData = localStorage.getItem("whalehq_user");
        if (!token) { router.push("/"); return; }
        if (userData) setUser(JSON.parse(userData));
        loadData();
        setupSocket();
    }, []);

    const loadData = useCallback(async () => {
        try {
            const [stateRes, activeRes, historyRes, statsRes, userRes] = await Promise.all([
                systemAPI.getState(),
                tradeAPI.getActive(),
                tradeAPI.getHistory({ limit: 50 }),
                tradeAPI.getStats(),
                authAPI.getMe(),
            ]);
            if (stateRes.data.state) setState(stateRes.data.state);
            setActiveTrades(activeRes.data.trades || []);
            setTradeHistory(historyRes.data.trades || []);
            setStats(statsRes.data.stats || null);
            if (userRes.data.user) {
                setUser(userRes.data.user);
                localStorage.setItem("whalehq_user", JSON.stringify(userRes.data.user));
            }
        } catch (err) {
            console.error("Data load error:", err);
        }
    }, []);

    const setupSocket = useCallback(() => {
        const socket = getSocket();
        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));
        socket.on("system:state", (data: SystemState) => {
            setState(data);
            setLastUpdated(new Date().toLocaleTimeString("en-IN"));
        });
        socket.on("trade:entry", () => loadData());
        socket.on("trade:exit", () => loadData());
        socket.on("trade:straddle", () => loadData());
        return () => {
            socket.off("connect"); socket.off("disconnect");
            socket.off("system:state"); socket.off("trade:entry");
            socket.off("trade:exit"); socket.off("trade:straddle");
        };
    }, [loadData]);

    const handleLogout = () => { localStorage.clear(); router.push("/"); };

    const mode = modeStyle[state.systemMode] ?? modeStyle.STANDBY;

    return (
        <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>

            {/* ── Header ── */}
            <header className="sticky top-0 z-50" style={{ borderBottom: "1px solid var(--border-base)", background: "var(--bg-surface)" }}>

                {/* Primary bar */}
                <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between gap-6">

                    {/* Brand */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-7 h-7 flex items-center justify-center text-lg leading-none select-none">🐋</div>
                        <div>
                            <div className="text-[13px] font-bold tracking-tight text-white leading-none">WhaleHQ</div>
                            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] mt-0.5" style={{ color: "var(--text-muted)" }}>v6.0 · Options Engine</div>
                        </div>
                        {/* Separator */}
                        <div className="w-px h-8 ml-1" style={{ background: "var(--border-base)" }} />
                    </div>

                    {/* Live indices */}
                    <div className="hidden md:flex flex-1 items-center justify-center">
                        <TopBarIndices />
                    </div>

                    {/* Right controls */}
                    <div className="flex items-center gap-3 shrink-0">
                        {/* Socket status */}
                        <div className="hidden sm:flex items-center gap-1.5">
                            <span className={`pulse-dot ${connected ? "bg-[var(--green)]" : "bg-[var(--red)]"} ${connected ? "animate-pulse" : ""}`} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                                {connected ? "Live" : "Offline"}
                            </span>
                        </div>

                        <div className="w-px h-5" style={{ background: "var(--border-base)" }} />

                        {/* System mode badge */}
                        <div className={`badge border ${mode.bg} ${mode.text}`}>
                            <span className={`pulse-dot ${mode.dot} ${state.systemMode === "NORMAL" ? "animate-pulse" : ""}`} />
                            {state.systemMode}
                        </div>

                        {lastUpdated && (
                            <span className="text-[10px] hidden lg:block" style={{ color: "var(--text-muted)" }}>
                                {lastUpdated}
                            </span>
                        )}

                        <div className="w-px h-5" style={{ background: "var(--border-base)" }} />

                        <button
                            onClick={handleLogout}
                            className="btn btn-ghost text-[10px] py-1.5 px-3"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* Secondary nav bar */}
                <div className="max-w-screen-2xl mx-auto px-6 flex items-center justify-between gap-4 py-0"
                    style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-base)" }}>

                    {/* Tabs */}
                    <div className="flex items-center">
                        {TABS.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className="relative px-4 py-3 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150"
                                    style={{
                                        color: active ? "var(--text-accent)" : "var(--text-secondary)",
                                        borderBottom: active ? "2px solid var(--blue)" : "2px solid transparent",
                                    }}
                                >
                                    {tab.label}
                                    {tab.id === "positions" && activeTrades.length > 0 && (
                                        <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-sm"
                                            style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "1px solid var(--blue-border)" }}>
                                            {activeTrades.length}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Available Margin */}
                    <AvailableMargin />
                </div>
            </header>

            {/* ── Main content ── */}
            <main className="max-w-screen-2xl mx-auto px-6 py-5">

                {activeTab === "overview" && (
                    <div className="space-y-5">
                        <MarketStatePanel
                            state={state.marketState}
                            direction={state.direction}
                            systemMode={state.systemMode}
                            niftyLTP={state.niftyLTP}
                            pcr={state.pcr}
                            dte={state.dte}
                            dailyPnL={state.dailyPnL}
                            tradesToday={state.tradesToday}
                        />
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                            <IAEScoreboard score={state.iaeScore} breakdown={state.iaeBreakdown} />
                            <BuildupPanel
                                dominantBuildup={state.dominantBuildup}
                                iv={state.iv}
                                ivp={state.ivp}
                                lbOIChg={state.lbOIChg}
                                sbOIChg={state.sbOIChg}
                                scOIChg={state.scOIChg}
                                luOIChg={state.luOIChg}
                                totalBullishOI={state.totalBullishOI}
                                totalBearishOI={state.totalBearishOI}
                            />
                            <SystemControls isAutoTrading={user?.isAutoTrading || false} capital={user?.capital || 0} isChoppyMonth={user?.isChoppyMonth} isTrendMonth={user?.isTrendMonth} onUpdate={loadData} />
                        </div>
                    </div>
                )}

                {activeTab === "trades" && (
                    <TradeHistory trades={tradeHistory} />
                )}

                {activeTab === "stats" && stats && (
                    <StatsPanel stats={stats} />
                )}

                {activeTab === "positions" && (
                    <ActiveTrade trades={activeTrades} onUpdate={loadData} />
                )}

                {activeTab === "alerts" && (
                    <AlertPanel />
                )}

                {activeTab === "curve" && (
                    <div className="space-y-5">
                        <PnLChart trades={tradeHistory} />
                    </div>
                )}

                {activeTab === "oibuildup" && (
                    <HistoricalBuildupView liveData={state.buildupHistory || []} />
                )}
            </main>
        </div>
    );
}
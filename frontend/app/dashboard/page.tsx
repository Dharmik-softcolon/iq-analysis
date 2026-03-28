"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { systemAPI, tradeAPI } from "@/lib/api";
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

const defaultState: SystemState = {
    timestamp: "",
    systemMode: "STANDBY",
    marketState: "UNKNOWN",
    iaeScore: 0,
    iaeBreakdown: {
        isIb: 0,
        pureOI: 0,
        oiDelta: 0,
        volX: 0,
        gamma: 0,
        mp: 0,
        tre: 0,
    },
    direction: "NO_TRADE",
    activePositions: 0,
    tradesToday: 0,
    dailyPnL: 0,
    capital: 500000,
    niftyLTP: 0,
    pcr: 1.0,
    dte: 5,
};

export default function DashboardPage() {
    const router = useRouter();
    const [state, setState] = useState<SystemState>(defaultState);
    const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
    const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
    const [stats, setStats] = useState<TradeStats | null>(null);
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<
        "overview" | "trades" | "stats" | "positions" | "alerts" | "curve"
    >("overview");
    const [lastUpdated, setLastUpdated] = useState<string>("");

    // Auth check
    useEffect(() => {
        const token = localStorage.getItem("whalehq_token");
        const userData = localStorage.getItem("whalehq_user");

        if (!token) {
            router.push("/");
            return;
        }

        if (userData) {
            setUser(JSON.parse(userData));
        }

        loadData();
        setupSocket();
    }, []);

    const loadData = useCallback(async () => {
        try {
            const [stateRes, activeRes, historyRes, statsRes] = await Promise.all([
                systemAPI.getState(),
                tradeAPI.getActive(),
                tradeAPI.getHistory({ limit: 50 }),
                tradeAPI.getStats(),
            ]);

            if (stateRes.data.state) {
                setState(stateRes.data.state);
            }
            setActiveTrades(activeRes.data.trades || []);
            setTradeHistory(historyRes.data.trades || []);
            setStats(statsRes.data.stats || null);
        } catch (err) {
            console.error("Data load error:", err);
        }
    }, []);

    const setupSocket = useCallback(() => {
        const socket = getSocket();

        socket.on("system:state", (data: SystemState) => {
            setState(data);
            setLastUpdated(new Date().toLocaleTimeString("en-IN"));
        });

        socket.on("trade:entry", () => {
            loadData();
        });

        socket.on("trade:exit", () => {
            loadData();
        });

        socket.on("trade:straddle", () => {
            loadData();
        });

        return () => {
            socket.off("system:state");
            socket.off("trade:entry");
            socket.off("trade:exit");
            socket.off("trade:straddle");
        };
    }, [loadData]);

    const handleLogout = () => {
        localStorage.clear();
        router.push("/");
    };

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Header */}
            <header className="bg-gray-900 border-b border-gray-700
                         sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center
                        justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🐋</span>
                        <div>
                            <h1 className="text-white font-black text-lg leading-none">
                                WhaleHQ v6.0
                            </h1>
                            <p className="text-gray-500 text-xs">
                                NIFTY Weekly Options Engine
                            </p>
                        </div>
                    </div>

                    {/* Live Market Indices (Hidden on small mobile) */}
                    <div className="hidden md:flex flex-1 justify-center items-center">
                        <TopBarIndices />
                    </div>

                    {/* System mode badge */}
                    <div className="flex items-center gap-4">
                        <div
                            className={`flex items-center gap-2 px-3 py-1 rounded-full 
                           text-xs font-bold border ${
                                state.systemMode === "NORMAL"
                                    ? "bg-blue-900/50 border-blue-600 text-blue-400"
                                    : state.systemMode === "EVENT"
                                        ? "bg-purple-900/50 border-purple-600 text-purple-400"
                                        : state.systemMode === "SHUTDOWN"
                                            ? "bg-red-900/50 border-red-600 text-red-400"
                                            : "bg-gray-800 border-gray-600 text-gray-400"
                            }`}
                        >
              <span
                  className={`w-2 h-2 rounded-full ${
                      state.systemMode === "NORMAL"
                          ? "bg-blue-400 animate-pulse"
                          : state.systemMode === "EVENT"
                              ? "bg-purple-400 animate-pulse"
                              : state.systemMode === "SHUTDOWN"
                                  ? "bg-red-400"
                                  : "bg-gray-500"
                  }`}
              />
                            {state.systemMode}
                        </div>

                        {lastUpdated && (
                            <span className="text-gray-500 text-xs hidden md:block">
                Updated: {lastUpdated}
              </span>
                        )}

                        <button
                            onClick={handleLogout}
                            className="text-gray-400 hover:text-white text-sm transition"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="max-w-7xl mx-auto px-4 py-6">

                {/* Secondary Header Row: Tabs + Margins */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    {/* Tab navigation */}
                    <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1 w-fit flex-wrap">
                        {[
                            { id: "overview", label: "Overview" },
                            { id: "trades", label: "Trades" },
                            { id: "stats", label: "Stats" },
                            { id: "positions", label: "Active Positions" },
                            { id: "alerts", label: "Live Alerts" },
                            { id: "curve", label: "Cumulative P&L Curve" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-2 rounded-md text-sm font-medium 
                          transition ${
                                    activeTab === tab.id
                                        ? "bg-blue-600 text-white"
                                        : "text-gray-400 hover:text-white"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Live Available Margin */}
                    <AvailableMargin />
                </div>

                {/* Overview Tab */}
                {activeTab === "overview" && (
                    <div className="space-y-6">
                        {/* Top row */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                            <IAEScoreboard
                                score={state.iaeScore}
                                breakdown={state.iaeBreakdown}
                            />
                        </div>

                        {/* System Controls row */}
                        <div className="max-w-2xl">
                            <SystemControls
                                isAutoTrading={user?.isAutoTrading || false}
                                capital={user?.capital || 500000}
                                onUpdate={loadData}
                            />
                        </div>

                    </div>
                )}

                {/* Trades Tab */}
                {activeTab === "trades" && (
                    <div className="space-y-6">
                        <TradeHistory trades={tradeHistory} />
                    </div>
                )}

                {/* Stats Tab */}
                {activeTab === "stats" && stats && (
                    <div className="space-y-6">
                        <StatsPanel stats={stats} />
                    </div>
                )}

                {/* Positions Tab */}
                {activeTab === "positions" && (
                    <div className="space-y-6">
                        <ActiveTrade
                            trades={activeTrades}
                            onUpdate={loadData}
                        />
                    </div>
                )}

                {/* Alerts Tab */}
                {activeTab === "alerts" && (
                    <div className="space-y-6">
                        <AlertPanel />
                    </div>
                )}

                {/* Curve Tab */}
                {activeTab === "curve" && (
                    <div className="space-y-6">
                        <PnLChart trades={tradeHistory} />
                    </div>
                )}
            </main>
        </div>
    );
}
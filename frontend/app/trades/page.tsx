"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { tradeAPI } from "@/lib/api";
import { Trade, TradeStats } from "@/lib/types";

// ─────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────

type FilterStatus = "ALL" | "ACTIVE" | "PARTIAL" | "CLOSED" | "SL_HIT";
type FilterDirection = "ALL" | "BULL" | "BEAR";
type SortField = "date" | "pnl" | "iae" | "strike";
type SortOrder = "asc" | "desc";

interface Filters {
    status: FilterStatus;
    direction: FilterDirection;
    from: string;
    to: string;
    minIAE: number;
}

// ─────────────────────────────────────────────────────
// HELPER COMPONENTS
// ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        ACTIVE: "bg-blue-900 text-blue-300 border-blue-700",
        PARTIAL: "bg-yellow-900 text-yellow-300 border-yellow-700",
        CLOSED: "bg-green-900 text-green-300 border-green-700",
        SL_HIT: "bg-red-900 text-red-300 border-red-700",
    };
    return (
        <span
            className={`px-2 py-0.5 rounded text-xs font-bold border 
                  ${styles[status] || "bg-gray-800 text-gray-400"}`}
        >
      {status}
    </span>
    );
}

function DirectionBadge({
                            direction,
                            optionType,
                        }: {
    direction: string;
    optionType: string;
}) {
    const isBull = direction === "BULL";
    return (
        <span
            className={`flex items-center gap-1 text-sm font-bold ${
                isBull ? "text-green-400" : "text-red-400"
            }`}
        >
      {isBull ? "▲" : "▼"} {direction} {optionType}
    </span>
    );
}

function PnLCell({ value }: { value: number }) {
    const isPositive = value >= 0;
    return (
        <span
            className={`font-bold ${
                isPositive ? "text-green-400" : "text-red-400"
            }`}
        >
      {isPositive ? "+" : ""}₹{Math.abs(value).toLocaleString("en-IN")}
    </span>
    );
}

function IAEBadge({ score }: { score: number }) {
    const color =
        score >= 7
            ? "text-green-400"
            : score >= 6
                ? "text-green-500"
                : score >= 5
                    ? "text-yellow-400"
                    : score >= 4
                        ? "text-orange-400"
                        : "text-red-500";
    return (
        <span className={`font-bold ${color}`}>{score}</span>
    );
}

// ─────────────────────────────────────────────────────
// TRADE DETAIL MODAL
// ─────────────────────────────────────────────────────

function TradeDetailModal({
                              trade,
                              onClose,
                          }: {
    trade: Trade;
    onClose: () => void;
}) {
    const gainPct =
        trade.entryPremium > 0
            ? ((trade.totalPnL / trade.capitalDeployed) * 100).toFixed(1)
            : "0";

    return (
        <div
            className="fixed inset-0 bg-black/70 z-50 flex
                  items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-gray-900 border border-gray-700 rounded-xl
                    w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6
                        border-b border-gray-700">
                    <div>
                        <h2 className="text-white font-black text-xl">
                            Trade Detail
                        </h2>
                        <p className="text-gray-400 text-sm mt-0.5">
                            {new Date(trade.createdAt).toLocaleDateString(
                                "en-IN",
                                {
                                    weekday: "long",
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                }
                            )}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl
                       leading-none"
                    >
                        ×
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Direction + Status */}
                    <div className="flex items-center justify-between">
                        <DirectionBadge
                            direction={trade.direction}
                            optionType={trade.optionType}
                        />
                        <StatusBadge status={trade.status} />
                    </div>

                    {/* Strike + Expiry */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: "Strike", value: trade.strike },
                            {
                                label: "Option",
                                value: `${trade.optionType}`,
                            },
                            {
                                label: "Expiry",
                                value: trade.expiry,
                            },
                        ].map((item) => (
                            <div
                                key={item.label}
                                className="p-3 bg-gray-800 rounded-lg"
                            >
                                <div className="text-gray-400 text-xs mb-1">
                                    {item.label}
                                </div>
                                <div className="text-white font-bold">
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* IAE + Market State */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            {
                                label: "IAE Score",
                                value: `${trade.iaeScore}/8`,
                                color:
                                    trade.iaeScore >= 6
                                        ? "text-green-400"
                                        : "text-yellow-400",
                            },
                            {
                                label: "Market State",
                                value: trade.marketState,
                                color: "text-white",
                            },
                            {
                                label: "Entry Window",
                                value: (trade as any).entryWindow || "IB",
                                color: "text-white",
                            },
                        ].map((item) => (
                            <div
                                key={item.label}
                                className="p-3 bg-gray-800 rounded-lg"
                            >
                                <div className="text-gray-400 text-xs mb-1">
                                    {item.label}
                                </div>
                                <div className={`font-bold ${item.color}`}>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Entry Details */}
                    <div className="p-4 bg-gray-800 rounded-lg">
                        <div className="text-gray-400 text-sm font-medium mb-3">
                            Entry Details
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Premium</span>
                                <span className="text-white font-bold">
                  ₹{trade.entryPremium}
                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Lots</span>
                                <span className="text-white font-bold">
                  {trade.totalLots}
                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Deployed</span>
                                <span className="text-white font-bold">
                  ₹
                                    {trade.capitalDeployed?.toLocaleString("en-IN")}
                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Risk</span>
                                <span className="text-red-400 font-bold">
                  ₹
                                    {trade.riskAmount?.toLocaleString("en-IN")}
                </span>
                            </div>
                        </div>
                    </div>

                    {/* Exit Levels */}
                    <div className="p-4 bg-gray-800 rounded-lg">
                        <div className="text-gray-400 text-sm font-medium mb-3">
                            Exit Levels
                        </div>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500">T1 Target (+40%)</span>
                                <span className="text-white">₹{trade.t1Target}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500">T2 Target (+80%)</span>
                                <span className="text-white">₹{trade.t2Target}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500">SL (-32%)</span>
                                <span className="text-red-400">
                  ₹{trade.slPremium}
                </span>
                            </div>
                        </div>
                    </div>

                    {/* Tranche P&L */}
                    <div className="p-4 bg-gray-800 rounded-lg">
                        <div className="text-gray-400 text-sm font-medium mb-3">
                            Tranche Results
                        </div>
                        <div className="space-y-3">
                            {/* T1 */}
                            <div
                                className={`flex items-center justify-between 
                              p-2 rounded-lg text-sm ${
                                    trade.t1Exited
                                        ? "bg-green-900/20 border border-green-800"
                                        : "bg-gray-700/50"
                                }`}
                            >
                                <div>
                  <span className="text-white font-medium">
                    T1
                  </span>
                                    <span className="text-gray-400 ml-2 text-xs">
                    {trade.t1Lots} lots
                  </span>
                                </div>
                                {trade.t1Exited ? (
                                    <div className="text-right">
                                        <div className="text-green-400 font-bold">
                                            ✅ +₹{trade.t1PnL?.toLocaleString("en-IN")}
                                        </div>
                                        {trade.t1ExitTime && (
                                            <div className="text-gray-500 text-xs">
                                                {new Date(
                                                    trade.t1ExitTime
                                                ).toLocaleTimeString("en-IN")}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-gray-500 text-xs">
                    Pending ₹{trade.t1Target}
                  </span>
                                )}
                            </div>

                            {/* T2 */}
                            <div
                                className={`flex items-center justify-between 
                              p-2 rounded-lg text-sm ${
                                    trade.t2Exited
                                        ? "bg-green-900/20 border border-green-800"
                                        : "bg-gray-700/50"
                                }`}
                            >
                                <div>
                  <span className="text-white font-medium">
                    T2
                  </span>
                                    <span className="text-gray-400 ml-2 text-xs">
                    {trade.t2Lots} lots
                  </span>
                                </div>
                                {trade.t2Exited ? (
                                    <div className="text-right">
                                        <div className="text-green-400 font-bold">
                                            ✅ +₹{trade.t2PnL?.toLocaleString("en-IN")}
                                        </div>
                                        {trade.t2ExitTime && (
                                            <div className="text-gray-500 text-xs">
                                                {new Date(
                                                    trade.t2ExitTime
                                                ).toLocaleTimeString("en-IN")}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-gray-500 text-xs">
                    Pending ₹{trade.t2Target}
                  </span>
                                )}
                            </div>

                            {/* T3 */}
                            <div
                                className={`flex items-center justify-between 
                              p-2 rounded-lg text-sm ${
                                    trade.t3Exited
                                        ? "bg-green-900/20 border border-green-800"
                                        : trade.t2Exited
                                            ? "bg-blue-900/20 border border-blue-800"
                                            : "bg-gray-700/50"
                                }`}
                            >
                                <div>
                  <span className="text-white font-medium">
                    T3 Trail
                  </span>
                                    <span className="text-gray-400 ml-2 text-xs">
                    {trade.t3Lots} lots
                  </span>
                                </div>
                                {trade.t3Exited ? (
                                    <div className="text-right">
                                        <div className="text-green-400 font-bold">
                                            ✅ +₹{trade.t3PnL?.toLocaleString("en-IN")}
                                        </div>
                                        {trade.t3ExitTime && (
                                            <div className="text-gray-500 text-xs">
                                                {new Date(
                                                    trade.t3ExitTime
                                                ).toLocaleTimeString("en-IN")}
                                            </div>
                                        )}
                                    </div>
                                ) : trade.t2Exited ? (
                                    <span className="text-blue-400 text-xs animate-pulse">
                    🔄 Trail running...
                  </span>
                                ) : (
                                    <span className="text-gray-500 text-xs">
                    After T2
                  </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Total P&L */}
                    <div
                        className={`p-4 rounded-lg border text-center ${
                            trade.totalPnL >= 0
                                ? "bg-green-900/20 border-green-700"
                                : "bg-red-900/20 border-red-700"
                        }`}
                    >
                        <div className="text-gray-400 text-sm mb-1">
                            TOTAL P&L
                        </div>
                        <div
                            className={`text-3xl font-black ${
                                trade.totalPnL >= 0
                                    ? "text-green-400"
                                    : "text-red-400"
                            }`}
                        >
                            {trade.totalPnL >= 0 ? "+" : ""}₹
                            {Math.abs(trade.totalPnL).toLocaleString("en-IN")}
                        </div>
                        {trade.capitalDeployed > 0 && (
                            <div className="text-gray-400 text-sm mt-1">
                                {gainPct}% on ₹
                                {trade.capitalDeployed.toLocaleString("en-IN")}{" "}
                                deployed
                            </div>
                        )}
                        {trade.exitReason && (
                            <div className="text-gray-500 text-xs mt-2">
                                Exit: {trade.exitReason}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────
// STATS SUMMARY BAR
// ─────────────────────────────────────────────────────

function StatsSummaryBar({ stats }: { stats: TradeStats }) {
    const items = [
        {
            label: "Total Trades",
            value: stats.totalTrades,
            color: "text-white",
        },
        {
            label: "Win Rate",
            value: `${stats.winRate}%`,
            color:
                Number(stats.winRate) >= 70
                    ? "text-green-400"
                    : "text-yellow-400",
        },
        {
            label: "Total P&L",
            value: `${Number(stats.totalPnL) >= 0 ? "+" : ""}₹${Number(
                stats.totalPnL
            ).toLocaleString("en-IN")}`,
            color:
                Number(stats.totalPnL) >= 0
                    ? "text-green-400"
                    : "text-red-400",
        },
        {
            label: "Avg Win",
            value: `+₹${Number(stats.avgWin).toLocaleString("en-IN")}`,
            color: "text-green-400",
        },
        {
            label: "Avg Loss",
            value: `-₹${Math.abs(Number(stats.avgLoss)).toLocaleString(
                "en-IN"
            )}`,
            color: "text-red-400",
        },
        {
            label: "R:R Ratio",
            value: `${stats.rrRatio}:1`,
            color:
                Number(stats.rrRatio) >= 2
                    ? "text-green-400"
                    : "text-yellow-400",
        },
    ];

    return (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            {items.map((item) => (
                <div
                    key={item.label}
                    className="bg-gray-900 border border-gray-700
                     rounded-lg p-3 text-center"
                >
                    <div className="text-gray-500 text-xs mb-1">
                        {item.label}
                    </div>
                    <div className={`font-bold text-lg ${item.color}`}>
                        {item.value}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────
// MAIN TRADES PAGE
// ─────────────────────────────────────────────────────

export default function TradesPage() {
    const router = useRouter();

    // ── State ─────────────────────────────────────
    const [trades, setTrades] = useState<Trade[]>([]);
    const [stats, setStats] = useState<TradeStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedTrade, setSelectedTrade] = useState<Trade | null>(
        null
    );
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [sortField, setSortField] = useState<SortField>("date");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [activeTab, setActiveTab] = useState<"all" | "today">("all");

    const [filters, setFilters] = useState<Filters>({
        status: "ALL",
        direction: "ALL",
        from: "",
        to: "",
        minIAE: 0,
    });

    // ── Auth Check ────────────────────────────────
    useEffect(() => {
        const token = localStorage.getItem("whalehq_token");
        if (!token) {
            router.push("/");
            return;
        }
        loadData();
    }, [page, filters]);

    // ── Load Data ─────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, any> = {
                page,
                limit: 20,
            };

            if (filters.status !== "ALL") params.status = filters.status;
            if (filters.from) params.from = filters.from;
            if (filters.to) params.to = filters.to;

            const [historyRes, statsRes] = await Promise.all([
                tradeAPI.getHistory(params),
                tradeAPI.getStats(),
            ]);

            let filtered = historyRes.data.trades || [];

            // Client-side filters
            if (filters.direction !== "ALL") {
                filtered = filtered.filter(
                    (t: Trade) => t.direction === filters.direction
                );
            }
            if (filters.minIAE > 0) {
                filtered = filtered.filter(
                    (t: Trade) => t.iaeScore >= filters.minIAE
                );
            }

            // Sort
            filtered = [...filtered].sort((a: Trade, b: Trade) => {
                let aVal: any, bVal: any;
                switch (sortField) {
                    case "pnl":
                        aVal = a.totalPnL;
                        bVal = b.totalPnL;
                        break;
                    case "iae":
                        aVal = a.iaeScore;
                        bVal = b.iaeScore;
                        break;
                    case "strike":
                        aVal = a.strike;
                        bVal = b.strike;
                        break;
                    default:
                        aVal = new Date(a.createdAt).getTime();
                        bVal = new Date(b.createdAt).getTime();
                }
                return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
            });

            setTrades(filtered);
            setStats(statsRes.data.stats || null);
            setTotalPages(historyRes.data.pagination?.pages || 1);
            setTotalCount(historyRes.data.pagination?.total || 0);
        } catch (err) {
            console.error("Failed to load trades:", err);
        } finally {
            setLoading(false);
        }
    }, [page, filters, sortField, sortOrder]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "desc" ? "asc" : "desc");
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
    };

    const resetFilters = () => {
        setFilters({
            status: "ALL",
            direction: "ALL",
            from: "",
            to: "",
            minIAE: 0,
        });
        setPage(1);
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field)
            return <span className="text-gray-600 ml-1">↕</span>;
        return (
            <span className="text-blue-400 ml-1">
        {sortOrder === "desc" ? "↓" : "↑"}
      </span>
        );
    };

    // ─────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-950">
            {/* Header */}
            <header className="bg-gray-900 border-b border-gray-700
                         sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3
                        flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <a
                            href="/dashboard"
                            className="text-gray-400 hover:text-white
                         transition text-sm"
                        >
                            ← Dashboard
                        </a>
                        <div>
                            <h1 className="text-white font-black text-lg
                             leading-none">
                                Trade History
                            </h1>
                            <p className="text-gray-500 text-xs">
                                {totalCount} total trades
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <a
                            href="/settings"
                            className="px-3 py-1.5 text-gray-400
                         hover:text-white text-sm transition"
                        >
                            Settings
                        </a>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-6">

                {/* Stats Summary */}
                {stats && <StatsSummaryBar stats={stats} />}

                {/* Filters */}
                <div className="bg-gray-900 border border-gray-700
                        rounded-xl p-4 mb-6">
                    <div className="flex flex-wrap items-center gap-3">

                        {/* Status Filter */}
                        <div className="flex gap-1 flex-wrap">
                            {(
                                [
                                    "ALL",
                                    "ACTIVE",
                                    "PARTIAL",
                                    "CLOSED",
                                    "SL_HIT",
                                ] as FilterStatus[]
                            ).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => {
                                        setFilters({ ...filters, status: s });
                                        setPage(1);
                                    }}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold 
                               transition ${
                                        filters.status === s
                                            ? "bg-blue-600 text-white"
                                            : "bg-gray-800 text-gray-400 hover:text-white"
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        <div className="w-px h-6 bg-gray-700" />

                        {/* Direction Filter */}
                        <div className="flex gap-1">
                            {(["ALL", "BULL", "BEAR"] as FilterDirection[]).map(
                                (d) => (
                                    <button
                                        key={d}
                                        onClick={() => {
                                            setFilters({ ...filters, direction: d });
                                            setPage(1);
                                        }}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold 
                                 transition ${
                                            filters.direction === d
                                                ? d === "BULL"
                                                    ? "bg-green-700 text-white"
                                                    : d === "BEAR"
                                                        ? "bg-red-700 text-white"
                                                        : "bg-blue-600 text-white"
                                                : "bg-gray-800 text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {d === "BULL"
                                            ? "▲ BULL"
                                            : d === "BEAR"
                                                ? "▼ BEAR"
                                                : d}
                                    </button>
                                )
                            )}
                        </div>

                        <div className="w-px h-6 bg-gray-700" />

                        {/* IAE Filter */}
                        <select
                            value={filters.minIAE}
                            onChange={(e) => {
                                setFilters({
                                    ...filters,
                                    minIAE: Number(e.target.value),
                                });
                                setPage(1);
                            }}
                            className="bg-gray-800 border border-gray-600
                         text-white text-xs rounded-lg px-3 py-1.5
                         focus:outline-none focus:border-blue-500"
                        >
                            <option value={0}>All IAE</option>
                            <option value={4}>IAE 4+</option>
                            <option value={5}>IAE 5+</option>
                            <option value={6}>IAE 6+</option>
                            <option value={7}>IAE 7+</option>
                        </select>

                        {/* Date Range */}
                        <input
                            type="date"
                            value={filters.from}
                            onChange={(e) => {
                                setFilters({ ...filters, from: e.target.value });
                                setPage(1);
                            }}
                            className="bg-gray-800 border border-gray-600
                         text-white text-xs rounded-lg px-3 py-1.5
                         focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-gray-500 text-xs">to</span>
                        <input
                            type="date"
                            value={filters.to}
                            onChange={(e) => {
                                setFilters({ ...filters, to: e.target.value });
                                setPage(1);
                            }}
                            className="bg-gray-800 border border-gray-600
                         text-white text-xs rounded-lg px-3 py-1.5
                         focus:outline-none focus:border-blue-500"
                        />

                        {/* Reset */}
                        <button
                            onClick={resetFilters}
                            className="px-3 py-1.5 text-gray-400 hover:text-white
                         text-xs transition ml-auto"
                        >
                            Reset Filters
                        </button>
                    </div>
                </div>

                {/* Trades Table */}
                <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">

                    {/* Table Header */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="border-b border-gray-700 bg-gray-800/50">
                                <th
                                    className="text-left py-3 px-4 text-gray-400
                               font-medium cursor-pointer
                               hover:text-white transition"
                                    onClick={() => handleSort("date")}
                                >
                                    Date <SortIcon field="date" />
                                </th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">
                                    Direction
                                </th>
                                <th
                                    className="text-left py-3 px-4 text-gray-400
                               font-medium cursor-pointer
                               hover:text-white transition"
                                    onClick={() => handleSort("strike")}
                                >
                                    Strike <SortIcon field="strike" />
                                </th>
                                <th
                                    className="text-left py-3 px-4 text-gray-400
                               font-medium cursor-pointer
                               hover:text-white transition"
                                    onClick={() => handleSort("iae")}
                                >
                                    IAE <SortIcon field="iae" />
                                </th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">
                                    Entry ₹
                                </th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">
                                    Lots
                                </th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">
                                    Tranches
                                </th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">
                                    Status
                                </th>
                                <th
                                    className="text-right py-3 px-4 text-gray-400
                               font-medium cursor-pointer
                               hover:text-white transition"
                                    onClick={() => handleSort("pnl")}
                                >
                                    P&L <SortIcon field="pnl" />
                                </th>
                            </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-800">
                            {loading ? (
                                // Loading skeleton
                                Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {Array.from({ length: 9 }).map((_, j) => (
                                            <td key={j} className="py-3 px-4">
                                                <div className="h-4 bg-gray-800 rounded w-full" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : trades.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="py-16 text-center text-gray-500"
                                    >
                                        <div className="text-4xl mb-3">📋</div>
                                        <div className="font-medium">No trades found</div>
                                        <div className="text-sm mt-1">
                                            Try adjusting filters or wait for first trade
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                trades.map((trade) => (
                                    <tr
                                        key={trade._id}
                                        onClick={() => setSelectedTrade(trade)}
                                        className="hover:bg-gray-800/50 cursor-pointer
                                 transition group"
                                    >
                                        {/* Date */}
                                        <td className="py-3 px-4">
                                            <div className="text-gray-300 text-sm">
                                                {new Date(trade.createdAt).toLocaleDateString(
                                                    "en-IN",
                                                    {
                                                        day: "2-digit",
                                                        month: "short",
                                                    }
                                                )}
                                            </div>
                                            <div className="text-gray-500 text-xs">
                                                {new Date(trade.createdAt).toLocaleTimeString(
                                                    "en-IN",
                                                    {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    }
                                                )}
                                            </div>
                                        </td>

                                        {/* Direction */}
                                        <td className="py-3 px-4">
                                            <DirectionBadge
                                                direction={trade.direction}
                                                optionType={trade.optionType}
                                            />
                                        </td>

                                        {/* Strike */}
                                        <td className="py-3 px-4">
                                            <div className="text-white font-bold">
                                                {trade.strike}
                                            </div>
                                            <div className="text-gray-500 text-xs">
                                                {trade.expiry}
                                            </div>
                                        </td>

                                        {/* IAE Score */}
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1">
                                                <IAEBadge score={trade.iaeScore} />
                                                <span className="text-gray-500 text-xs">
                            /8
                          </span>
                                            </div>
                                            <div className="text-gray-500 text-xs">
                                                {trade.marketState}
                                            </div>
                                        </td>

                                        {/* Entry Premium */}
                                        <td className="py-3 px-4">
                                            <div className="text-white">
                                                ₹{trade.entryPremium}
                                            </div>
                                            <div className="text-gray-500 text-xs">
                                                ₹
                                                {trade.capitalDeployed?.toLocaleString(
                                                    "en-IN"
                                                )}{" "}
                                                dep.
                                            </div>
                                        </td>

                                        {/* Lots */}
                                        <td className="py-3 px-4 text-white">
                                            {trade.totalLots}
                                        </td>

                                        {/* Tranches */}
                                        <td className="py-3 px-4">
                                            <div className="flex gap-1">
                          <span
                              className={`w-6 h-6 rounded text-xs flex 
                                         items-center justify-center 
                                         font-bold ${
                                  trade.t1Exited
                                      ? "bg-green-800 text-green-300"
                                      : "bg-gray-700 text-gray-500"
                              }`}
                              title="T1 (+40%)"
                          >
                            1
                          </span>
                                                <span
                                                    className={`w-6 h-6 rounded text-xs flex 
                                         items-center justify-center 
                                         font-bold ${
                                                        trade.t2Exited
                                                            ? "bg-green-800 text-green-300"
                                                            : "bg-gray-700 text-gray-500"
                                                    }`}
                                                    title="T2 (+80%)"
                                                >
                            2
                          </span>
                                                <span
                                                    className={`w-6 h-6 rounded text-xs flex 
                                         items-center justify-center 
                                         font-bold ${
                                                        trade.t3Exited
                                                            ? "bg-green-800 text-green-300"
                                                            : trade.t2Exited
                                                                ? "bg-blue-800 text-blue-300 animate-pulse"
                                                                : "bg-gray-700 text-gray-500"
                                                    }`}
                                                    title="T3 (Trail)"
                                                >
                            3
                          </span>
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="py-3 px-4">
                                            <StatusBadge status={trade.status} />
                                        </td>

                                        {/* P&L */}
                                        <td className="py-3 px-4 text-right">
                                            <PnLCell value={trade.totalPnL} />
                                            {trade.capitalDeployed > 0 && (
                                                <div
                                                    className={`text-xs mt-0.5 ${
                                                        trade.totalPnL >= 0
                                                            ? "text-green-600"
                                                            : "text-red-600"
                                                    }`}
                                                >
                                                    {(
                                                        (trade.totalPnL /
                                                            trade.capitalDeployed) *
                                                        100
                                                    ).toFixed(1)}
                                                    %
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="border-t border-gray-700 px-4 py-3
                            flex items-center justify-between">
                            <div className="text-gray-500 text-sm">
                                Page {page} of {totalPages} ({totalCount} trades)
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1}
                                    className="px-3 py-1.5 bg-gray-800 text-white
                             rounded-lg text-sm disabled:opacity-40
                             hover:bg-gray-700 transition"
                                >
                                    ← Prev
                                </button>

                                {/* Page numbers */}
                                <div className="flex gap-1">
                                    {Array.from(
                                        { length: Math.min(5, totalPages) },
                                        (_, i) => {
                                            let pageNum: number;
                                            if (totalPages <= 5) {
                                                pageNum = i + 1;
                                            } else if (page <= 3) {
                                                pageNum = i + 1;
                                            } else if (page >= totalPages - 2) {
                                                pageNum = totalPages - 4 + i;
                                            } else {
                                                pageNum = page - 2 + i;
                                            }
                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => setPage(pageNum)}
                                                    className={`w-8 h-8 rounded-lg text-sm 
                                       font-medium transition ${
                                                        page === pageNum
                                                            ? "bg-blue-600 text-white"
                                                            : "bg-gray-800 text-gray-400 hover:text-white"
                                                    }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        }
                                    )}
                                </div>

                                <button
                                    onClick={() =>
                                        setPage(Math.min(totalPages, page + 1))
                                    }
                                    disabled={page === totalPages}
                                    className="px-3 py-1.5 bg-gray-800 text-white
                             rounded-lg text-sm disabled:opacity-40
                             hover:bg-gray-700 transition"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* IAE Performance Breakdown */}
                {stats && Object.keys(stats.iaeBreakdown || {}).length > 0 && (
                    <div className="mt-6 bg-gray-900 border border-gray-700
                          rounded-xl p-6">
                        <h3 className="text-white font-bold text-lg mb-4">
                            Performance by IAE Score
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Object.entries(stats.iaeBreakdown).map(
                                ([score, data]) => (
                                    <div
                                        key={score}
                                        className={`p-4 rounded-lg border ${
                                            Number(score) >= 7
                                                ? "bg-green-900/20 border-green-700"
                                                : Number(score) >= 6
                                                    ? "bg-green-900/10 border-green-800"
                                                    : Number(score) >= 5
                                                        ? "bg-yellow-900/10 border-yellow-800"
                                                        : "bg-orange-900/10 border-orange-800"
                                        }`}
                                    >
                                        <div
                                            className={`text-2xl font-black mb-2 ${
                                                Number(score) >= 7
                                                    ? "text-green-400"
                                                    : Number(score) >= 6
                                                        ? "text-green-500"
                                                        : Number(score) >= 5
                                                            ? "text-yellow-400"
                                                            : "text-orange-400"
                                            }`}
                                        >
                                            IAE {score}
                                        </div>
                                        <div className="space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Trades</span>
                                                <span className="text-white font-medium">
                          {data.trades}
                        </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Win Rate</span>
                                                <span
                                                    className={
                                                        Number(data.winRate) >= 70
                                                            ? "text-green-400 font-medium"
                                                            : "text-yellow-400 font-medium"
                                                    }
                                                >
                          {data.winRate}%
                        </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Avg P&L</span>
                                                <span
                                                    className={`font-medium ${
                                                        Number(data.avgPnL) >= 0
                                                            ? "text-green-400"
                                                            : "text-red-400"
                                                    }`}
                                                >
                          {Number(data.avgPnL) >= 0 ? "+" : ""}₹
                                                    {Number(
                                                        data.avgPnL
                                                    ).toLocaleString("en-IN")}
                        </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}

                {/* Monthly P&L Summary */}
                <div className="mt-6 bg-gray-900 border border-gray-700
                        rounded-xl p-6">
                    <h3 className="text-white font-bold text-lg mb-4">
                        Monthly Summary
                    </h3>

                    {trades.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">
                            No trades to summarize
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                <tr className="border-b border-gray-700
                                  text-gray-400">
                                    <th className="text-left py-2 pr-4 font-medium">
                                        Month
                                    </th>
                                    <th className="text-left py-2 pr-4 font-medium">
                                        Trades
                                    </th>
                                    <th className="text-left py-2 pr-4 font-medium">
                                        Wins
                                    </th>
                                    <th className="text-left py-2 pr-4 font-medium">
                                        Win Rate
                                    </th>
                                    <th className="text-right py-2 font-medium">
                                        P&L
                                    </th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                {(() => {
                                    // Group trades by month
                                    const monthMap: Record<
                                        string,
                                        {
                                            trades: number;
                                            wins: number;
                                            pnl: number;
                                        }
                                    > = {};

                                    trades.forEach((trade) => {
                                        const month = new Date(
                                            trade.createdAt
                                        ).toLocaleDateString("en-IN", {
                                            month: "short",
                                            year: "numeric",
                                        });

                                        if (!monthMap[month]) {
                                            monthMap[month] = {
                                                trades: 0,
                                                wins: 0,
                                                pnl: 0,
                                            };
                                        }
                                        monthMap[month].trades += 1;
                                        if (trade.totalPnL > 0) {
                                            monthMap[month].wins += 1;
                                        }
                                        monthMap[month].pnl += trade.totalPnL || 0;
                                    });

                                    return Object.entries(monthMap).map(
                                        ([month, data]) => {
                                            const winRate =
                                                data.trades > 0
                                                    ? (
                                                        (data.wins / data.trades) *
                                                        100
                                                    ).toFixed(0)
                                                    : "0";

                                            return (
                                                <tr
                                                    key={month}
                                                    className="hover:bg-gray-800/30"
                                                >
                                                    <td className="py-2.5 pr-4 text-white font-medium">
                                                        {month}
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-gray-300">
                                                        {data.trades}
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-gray-300">
                                                        {data.wins}W /{" "}
                                                        {data.trades - data.wins}L
                                                    </td>
                                                    <td className="py-2.5 pr-4">
                              <span
                                  className={
                                      Number(winRate) >= 70
                                          ? "text-green-400"
                                          : Number(winRate) >= 50
                                              ? "text-yellow-400"
                                              : "text-red-400"
                                  }
                              >
                                {winRate}%
                              </span>
                                                    </td>
                                                    <td className="py-2.5 text-right">
                                                        <PnLCell value={data.pnl} />
                                                    </td>
                                                </tr>
                                            );
                                        }
                                    );
                                })()}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Export Button */}
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={() => {
                            // Build CSV
                            const headers = [
                                "Date",
                                "Direction",
                                "Option",
                                "Strike",
                                "Expiry",
                                "IAE",
                                "Market State",
                                "Entry Premium",
                                "Lots",
                                "Deployed",
                                "T1 P&L",
                                "T2 P&L",
                                "T3 P&L",
                                "Total P&L",
                                "Status",
                                "Exit Reason",
                            ];

                            const rows = trades.map((t) => [
                                new Date(t.createdAt).toLocaleDateString("en-IN"),
                                t.direction,
                                t.optionType,
                                t.strike,
                                t.expiry,
                                t.iaeScore,
                                t.marketState,
                                t.entryPremium,
                                t.totalLots,
                                t.capitalDeployed || 0,
                                t.t1PnL || 0,
                                t.t2PnL || 0,
                                t.t3PnL || 0,
                                t.totalPnL,
                                t.status,
                                t.exitReason || "",
                            ]);

                            const csv = [headers, ...rows]
                                .map((r) => r.join(","))
                                .join("\n");

                            const blob = new Blob([csv], {
                                type: "text/csv",
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `whalehq_trades_${new Date()
                                .toISOString()
                                .split("T")[0]}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-2 px-4 py-2
                       bg-gray-800 hover:bg-gray-700 border
                       border-gray-600 text-gray-300 rounded-lg
                       text-sm transition"
                    >
                        📥 Export CSV
                    </button>
                </div>
            </main>

            {/* Trade Detail Modal */}
            {selectedTrade && (
                <TradeDetailModal
                    trade={selectedTrade}
                    onClose={() => setSelectedTrade(null)}
                />
            )}
        </div>
    );
}

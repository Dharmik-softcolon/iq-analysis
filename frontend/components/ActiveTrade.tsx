"use client";

import { Trade } from "@/lib/types";
import { useState } from "react";
import { tradeAPI } from "@/lib/api";

interface Props {
    trades: Trade[];
    onUpdate: () => void;
}

export default function ActiveTrade({ trades, onUpdate }: Props) {
    const [exiting, setExiting] = useState<string | null>(null);

    const handleManualExit = async (signalId: string) => {
        if (!confirm("Emergency exit? This will sell at market price.")) return;

        setExiting(signalId);
        try {
            await tradeAPI.manualExit(signalId, "Manual exit from UI");
            onUpdate();
        } catch {
            alert("Exit failed. Please check manually on Zerodha.");
        } finally {
            setExiting(null);
        }
    };

    if (trades.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                <h2 className="text-white font-bold text-lg mb-4">
                    Active Positions
                </h2>
                <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🎯</div>
                    <div>No active positions</div>
                    <div className="text-sm mt-1">System monitoring markets...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-white font-bold text-lg mb-4">
                Active Positions ({trades.length})
            </h2>

            <div className="space-y-4">
                {trades.map((trade) => {
                    const pnlColor =
                        (trade.totalPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400";

                    return (
                        <div
                            key={trade._id}
                            className={`p-4 rounded-lg border ${
                                trade.direction === "BULL"
                                    ? "border-green-700 bg-green-900/10"
                                    : "border-red-700 bg-red-900/10"
                            }`}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                  <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                          trade.direction === "BULL"
                              ? "bg-green-900 text-green-400"
                              : "bg-red-900 text-red-400"
                      }`}
                  >
                    {trade.direction === "BULL" ? "▲ BULL" : "▼ BEAR"}
                  </span>
                                    <span className="text-white font-bold">
                    {trade.strike} {trade.optionType}
                  </span>
                                    <span className="text-gray-400 text-sm">
                    IAE:{trade.iaeScore}
                  </span>
                                </div>
                                <div className={`font-bold ${pnlColor}`}>
                                    {(trade.totalPnL ?? 0) >= 0 ? "+" : ""}₹
                                    {(trade.totalPnL ?? 0).toLocaleString("en-IN")}
                                </div>
                            </div>

                            {/* Entry details */}
                            <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
                                <div>
                                    <div className="text-gray-500 text-xs">Entry</div>
                                    <div className="text-white font-medium">
                                        ₹{trade.entryPremium}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-500 text-xs">Lots</div>
                                    <div className="text-white font-medium">
                                        {trade.totalLots}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-500 text-xs">Deployed</div>
                                    <div className="text-white font-medium">
                                        ₹{trade.capitalDeployed?.toLocaleString("en-IN")}
                                    </div>
                                </div>
                            </div>

                            {/* Tranches */}
                            <div className="space-y-2 mb-3">
                                {/* T1 */}
                                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    T1 ({trade.t1Lots} lots) → ₹{trade.t1Target} (+40%)
                  </span>
                                    <span
                                        className={
                                            trade.t1Exited ? "text-green-400" : "text-gray-500"
                                        }
                                    >
                    {trade.t1Exited
                        ? `✅ ₹${trade.t1PnL?.toFixed(0)}`
                        : "Pending"}
                  </span>
                                </div>
                                {/* T2 */}
                                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    T2 ({trade.t2Lots} lots) → ₹{trade.t2Target} (+80%)
                  </span>
                                    <span
                                        className={
                                            trade.t2Exited ? "text-green-400" : "text-gray-500"
                                        }
                                    >
                    {trade.t2Exited
                        ? `✅ ₹${trade.t2PnL?.toFixed(0)}`
                        : "Pending"}
                  </span>
                                </div>
                                {/* T3 */}
                                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    T3 ({trade.t3Lots} lots) → 20% Trail
                  </span>
                                    <span
                                        className={
                                            trade.t3Exited ? "text-green-400" : "text-blue-400"
                                        }
                                    >
                    {trade.t3Exited
                        ? `✅ ₹${trade.t3PnL?.toFixed(0)}`
                        : "🔄 Running"}
                  </span>
                                </div>
                            </div>

                            {/* SL Levels */}
                            <div className="flex gap-4 text-xs text-gray-500 mb-3">
                                <span>Premium SL: ₹{trade.slPremium}</span>
                                <span>Index SL: {trade.adverseIndexSL}</span>
                            </div>

                            {/* Emergency exit */}
                            <button
                                onClick={() => handleManualExit(trade.signalId)}
                                disabled={exiting === trade.signalId}
                                className="w-full py-2 bg-red-900/50 border border-red-700
                           text-red-400 rounded-lg text-sm font-bold
                           hover:bg-red-800/50 transition disabled:opacity-50"
                            >
                                {exiting === trade.signalId
                                    ? "Exiting..."
                                    : "🚨 Emergency Exit (Market)"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
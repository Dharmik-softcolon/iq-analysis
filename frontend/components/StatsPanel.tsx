"use client";

import { TradeStats } from "@/lib/types";

interface Props {
    stats: TradeStats;
}

export default function StatsPanel({ stats }: Props) {
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-white font-bold text-lg mb-4">
                Performance Statistics
            </h2>

            {/* Top metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-3 bg-gray-800 rounded-lg">
                    <div className="text-gray-400 text-xs mb-1">WIN RATE</div>
                    <div
                        className={`text-2xl font-black ${
                            Number(stats.winRate) >= 70
                                ? "text-green-400"
                                : Number(stats.winRate) >= 50
                                    ? "text-yellow-400"
                                    : "text-red-400"
                        }`}
                    >
                        {stats.winRate}%
                    </div>
                    <div className="text-gray-500 text-xs">
                        {stats.wins}W / {stats.losses}L
                    </div>
                </div>

                <div className="p-3 bg-gray-800 rounded-lg">
                    <div className="text-gray-400 text-xs mb-1">TOTAL P&L</div>
                    <div
                        className={`text-2xl font-black ${
                            Number(stats.totalPnL) >= 0
                                ? "text-green-400"
                                : "text-red-400"
                        }`}
                    >
                        {Number(stats.totalPnL) >= 0 ? "+" : ""}₹
                        {Number(stats.totalPnL).toLocaleString("en-IN")}
                    </div>
                    <div className="text-gray-500 text-xs">
                        {stats.totalTrades} trades
                    </div>
                </div>

                <div className="p-3 bg-gray-800 rounded-lg">
                    <div className="text-gray-400 text-xs mb-1">R:R RATIO</div>
                    <div
                        className={`text-2xl font-black ${
                            Number(stats.rrRatio) >= 2
                                ? "text-green-400"
                                : "text-yellow-400"
                        }`}
                    >
                        {stats.rrRatio}:1
                    </div>
                    <div className="text-gray-500 text-xs">Win/Loss avg</div>
                </div>

                <div className="p-3 bg-gray-800 rounded-lg">
                    <div className="text-gray-400 text-xs mb-1">AVG WIN</div>
                    <div className="text-2xl font-black text-green-400">
                        +₹{Number(stats.avgWin).toLocaleString("en-IN")}
                    </div>
                    <div className="text-gray-500 text-xs">
                        Avg Loss: -₹{Math.abs(Number(stats.avgLoss)).toLocaleString("en-IN")}
                    </div>
                </div>
            </div>

            {/* IAE Breakdown Table */}
            <div>
                <div className="text-gray-400 text-sm font-medium mb-3">
                    Performance by IAE Score
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                        <tr className="text-gray-500 border-b border-gray-700">
                            <th className="text-left py-2 pr-4">IAE Score</th>
                            <th className="text-left py-2 pr-4">Trades</th>
                            <th className="text-left py-2 pr-4">Wins</th>
                            <th className="text-left py-2 pr-4">Win Rate</th>
                            <th className="text-right py-2">Avg P&L</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                        {Object.entries(stats.iaeBreakdown || {}).map(
                            ([score, data]) => (
                                <tr key={score} className="hover:bg-gray-800/50">
                                    <td className="py-2 pr-4">
                      <span
                          className={`font-bold ${
                              Number(score) >= 7
                                  ? "text-green-400"
                                  : Number(score) >= 5
                                      ? "text-yellow-400"
                                      : "text-orange-400"
                          }`}
                      >
                        IAE {score}
                      </span>
                                    </td>
                                    <td className="py-2 pr-4 text-white">{data.trades}</td>
                                    <td className="py-2 pr-4 text-white">{data.wins}</td>
                                    <td className="py-2 pr-4">
                      <span
                          className={
                              Number(data.winRate) >= 70
                                  ? "text-green-400"
                                  : "text-yellow-400"
                          }
                      >
                        {data.winRate}%
                      </span>
                                    </td>
                                    <td
                                        className={`py-2 text-right font-bold ${
                                            Number(data.avgPnL) >= 0
                                                ? "text-green-400"
                                                : "text-red-400"
                                        }`}
                                    >
                                        {Number(data.avgPnL) >= 0 ? "+" : ""}₹
                                        {Number(data.avgPnL).toLocaleString("en-IN")}
                                    </td>
                                </tr>
                            )
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
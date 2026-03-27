"use client";

import { Trade } from "@/lib/types";

interface Props {
    trades: Trade[];
}

const statusBadge = (status: string) => {
    const map: Record<string, string> = {
        CLOSED: "bg-green-900 text-green-400",
        SL_HIT: "bg-red-900 text-red-400",
        ACTIVE: "bg-blue-900 text-blue-400",
        PARTIAL: "bg-yellow-900 text-yellow-400",
    };
    return map[status] || "bg-gray-800 text-gray-400";
};

export default function TradeHistory({ trades }: Props) {
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-white font-bold text-lg mb-4">
                Trade History
            </h2>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                    <tr className="text-gray-500 border-b border-gray-700">
                        <th className="text-left py-2 pr-4">Date</th>
                        <th className="text-left py-2 pr-4">Direction</th>
                        <th className="text-left py-2 pr-4">Strike</th>
                        <th className="text-left py-2 pr-4">IAE</th>
                        <th className="text-left py-2 pr-4">Entry ₹</th>
                        <th className="text-left py-2 pr-4">Lots</th>
                        <th className="text-left py-2 pr-4">Status</th>
                        <th className="text-right py-2">P&L ₹</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                    {trades.map((trade) => (
                        <tr key={trade._id} className="hover:bg-gray-800/50">
                            <td className="py-3 pr-4 text-gray-400">
                                {new Date(trade.createdAt).toLocaleDateString("en-IN")}
                            </td>
                            <td className="py-3 pr-4">
                  <span
                      className={
                          trade.direction === "BULL"
                              ? "text-green-400"
                              : "text-red-400"
                      }
                  >
                    {trade.direction === "BULL" ? "▲" : "▼"}{" "}
                      {trade.direction}
                  </span>
                            </td>
                            <td className="py-3 pr-4 text-white font-medium">
                                {trade.strike} {trade.optionType}
                            </td>
                            <td className="py-3 pr-4">
                  <span
                      className={`font-bold ${
                          trade.iaeScore >= 6
                              ? "text-green-400"
                              : trade.iaeScore >= 4
                                  ? "text-yellow-400"
                                  : "text-red-400"
                      }`}
                  >
                    {trade.iaeScore}
                  </span>
                            </td>
                            <td className="py-3 pr-4 text-white">
                                {trade.entryPremium}
                            </td>
                            <td className="py-3 pr-4 text-white">
                                {trade.totalLots}
                            </td>
                            <td className="py-3 pr-4">
                  <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${statusBadge(
                          trade.status
                      )}`}
                  >
                    {trade.status}
                  </span>
                            </td>
                            <td
                                className={`py-3 text-right font-bold ${
                                    (trade.totalPnL ?? 0) >= 0
                                        ? "text-green-400"
                                        : "text-red-400"
                                }`}
                            >
                                {(trade.totalPnL ?? 0) >= 0 ? "+" : ""}
                                {(trade.totalPnL ?? 0).toLocaleString("en-IN")}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>

                {trades.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        No trade history yet
                    </div>
                )}
            </div>
        </div>
    );
}
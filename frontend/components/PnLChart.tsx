"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import { Trade } from "@/lib/types";

interface Props {
    trades: Trade[];
}

export default function PnLChart({ trades }: Props) {
    // Build cumulative P&L data
    let cumulative = 0;
    const data = trades
        .filter((t) => t.status === "CLOSED" || t.status === "SL_HIT")
        .sort(
            (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        .map((trade, index) => {
            cumulative += trade.totalPnL || 0;
            return {
                trade: index + 1,
                pnl: trade.totalPnL || 0,
                cumulative,
                date: new Date(trade.createdAt).toLocaleDateString("en-IN"),
                label: `${trade.direction} ${trade.strike}${trade.optionType}`,
            };
        });

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            return (
                <div className="bg-gray-800 border border-gray-600 rounded-lg p-3">
                    <div className="text-gray-400 text-xs">{d.date}</div>
                    <div className="text-white text-sm">{d.label}</div>
                    <div
                        className={`font-bold ${
                            d.pnl >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        Trade: {d.pnl >= 0 ? "+" : ""}₹
                        {d.pnl.toLocaleString("en-IN")}
                    </div>
                    <div className="text-blue-400 text-sm">
                        Cumulative: ₹{d.cumulative.toLocaleString("en-IN")}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-white font-bold text-lg mb-4">
                Cumulative P&L Curve
            </h2>

            {data.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    No closed trades yet
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                            dataKey="trade"
                            stroke="#6B7280"
                            label={{
                                value: "Trade #",
                                position: "insideBottom",
                                offset: -5,
                                fill: "#6B7280",
                            }}
                        />
                        <YAxis
                            stroke="#6B7280"
                            tickFormatter={(v) =>
                                `₹${(v / 1000).toFixed(0)}k`
                            }
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="4 4" />
                        <Line
                            type="monotone"
                            dataKey="cumulative"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            dot={(props: any) => {
                                const { cx, cy, payload } = props;
                                return (
                                    <circle
                                        key={`dot-${payload.trade}`}
                                        cx={cx}
                                        cy={cy}
                                        r={4}
                                        fill={payload.pnl >= 0 ? "#22C55E" : "#EF4444"}
                                        stroke="none"
                                    />
                                );
                            }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
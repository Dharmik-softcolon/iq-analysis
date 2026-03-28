"use client";

import { TradeStats } from "@/lib/types";

interface Props {
    stats: TradeStats;
}

export default function StatsPanel({ stats }: Props) {
    const winRate = Number(stats.winRate);
    const totalPnL = Number(stats.totalPnL);
    const rrRatio = Number(stats.rrRatio);
    const avgWin = Number(stats.avgWin);
    const avgLoss = Number(stats.avgLoss);

    const topMetrics = [
        {
            label: "Win Rate",
            value: `${winRate}%`,
            sub: `${stats.wins}W / ${stats.losses}L`,
            color: winRate >= 70 ? "var(--green)" : winRate >= 50 ? "var(--yellow)" : "var(--red)",
        },
        {
            label: "Total P&L",
            value: `${totalPnL >= 0 ? "+" : ""}₹${totalPnL.toLocaleString("en-IN")}`,
            sub: `${stats.totalTrades} closed trades`,
            color: totalPnL >= 0 ? "var(--green)" : "var(--red)",
        },
        {
            label: "Risk:Reward",
            value: `${rrRatio}:1`,
            sub: "Win/Loss avg ratio",
            color: rrRatio >= 2 ? "var(--green)" : "var(--yellow)",
        },
        {
            label: "Avg Win",
            value: `+₹${avgWin.toLocaleString("en-IN")}`,
            sub: `Avg Loss: -₹${Math.abs(avgLoss).toLocaleString("en-IN")}`,
            color: "var(--green)",
        },
    ];

    return (
        <div className="space-y-5">
            {/* Top KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {topMetrics.map(({ label, value, sub, color }) => (
                    <div key={label} className="card p-4">
                        <div className="label mb-2">{label}</div>
                        <div
                            className="num font-black leading-none mb-1.5"
                            style={{ fontSize: 28, color, letterSpacing: "-0.04em" }}
                        >
                            {value}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{sub}</div>
                    </div>
                ))}
            </div>

            {/* IAE breakdown table */}
            <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                    <span className="section-title">Performance by IAE Score</span>
                    <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
                </div>

                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>IAE Score</th>
                                <th>Trades</th>
                                <th>Wins</th>
                                <th>Win Rate</th>
                                <th style={{ textAlign: "right" }}>Avg P&L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(stats.iaeBreakdown || {}).map(([score, data]) => {
                                const avgPnL = Number(data.avgPnL);
                                const wr = Number(data.winRate);
                                return (
                                    <tr key={score}>
                                        <td>
                                            <span
                                                className="badge"
                                                style={{
                                                    background: Number(score) >= 7 ? "var(--green-dim)" : Number(score) >= 5 ? "var(--yellow-dim)" : "var(--bg-elevated)",
                                                    borderColor: Number(score) >= 7 ? "var(--green-border)" : Number(score) >= 5 ? "var(--yellow-border)" : "var(--border-base)",
                                                    color: Number(score) >= 7 ? "var(--green)" : Number(score) >= 5 ? "var(--yellow)" : "var(--text-secondary)",
                                                }}
                                            >
                                                IAE {score}
                                            </span>
                                        </td>
                                        <td><span className="num text-[12px]">{data.trades}</span></td>
                                        <td><span className="num text-[12px]">{data.wins}</span></td>
                                        <td>
                                            <span className="num text-[12px] font-semibold" style={{ color: wr >= 70 ? "var(--green)" : "var(--yellow)" }}>
                                                {data.winRate}%
                                            </span>
                                        </td>
                                        <td style={{ textAlign: "right" }}>
                                            <span className="num text-[12px] font-bold" style={{ color: avgPnL >= 0 ? "var(--green)" : "var(--red)" }}>
                                                {avgPnL >= 0 ? "+" : ""}₹{avgPnL.toLocaleString("en-IN")}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
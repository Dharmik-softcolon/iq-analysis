"use client";

import { Trade } from "@/lib/types";

interface Props {
    trades: Trade[];
}

const statusMap: Record<string, { label: string; color: string; bg: string; border: string }> = {
    CLOSED:  { label: "CLOSED",  color: "var(--green)",  bg: "var(--green-dim)",  border: "var(--green-border)" },
    SL_HIT:  { label: "SL HIT",  color: "var(--red)",    bg: "var(--red-dim)",    border: "var(--red-border)" },
    ACTIVE:  { label: "ACTIVE",  color: "var(--blue)",   bg: "var(--blue-dim)",   border: "var(--blue-border)" },
    PARTIAL: { label: "PARTIAL", color: "var(--yellow)", bg: "var(--yellow-dim)", border: "var(--yellow-border)" },
};

export default function TradeHistory({ trades }: Props) {
    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
                <span className="section-title">Trade Log</span>
                {trades.length > 0 && (
                    <span
                        className="px-2 py-0.5 text-[9px] font-bold num"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-base)", color: "var(--text-secondary)", borderRadius: "2px" }}
                    >
                        {trades.length}
                    </span>
                )}
                <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            </div>

            {trades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="text-3xl opacity-20">⌀</div>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>No trade history</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Completed trades will appear here</div>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Direction</th>
                                <th>Strike / Type</th>
                                <th>IAE</th>
                                <th>Entry ₹</th>
                                <th>Lots</th>
                                <th>Status</th>
                                <th style={{ textAlign: "right" }}>P&L ₹</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trades.map((trade) => {
                                const pnlPos = (trade.totalPnL ?? 0) >= 0;
                                const isBull = trade.direction === "BULL";
                                const st = statusMap[trade.status] ?? { label: trade.status, color: "var(--text-secondary)", bg: "var(--bg-elevated)", border: "var(--border-base)" };

                                return (
                                    <tr key={trade._id}>
                                        <td>
                                            <span className="num text-[11px]" style={{ color: "var(--text-secondary)" }}>
                                                {new Date(trade.createdAt).toLocaleDateString("en-IN")}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="text-[11px] font-bold num" style={{ color: isBull ? "var(--green)" : "var(--red)" }}>
                                                {isBull ? "▲" : "▼"} {trade.direction}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="num text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                                                {trade.strike} {trade.optionType}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className="num text-[11px] font-bold"
                                                style={{
                                                    color: trade.iaeScore >= 6 ? "var(--green)" : trade.iaeScore >= 4 ? "var(--yellow)" : "var(--red)"
                                                }}
                                            >
                                                {trade.iaeScore}/8
                                            </span>
                                        </td>
                                        <td>
                                            <span className="num text-[12px]" style={{ color: "var(--text-primary)" }}>
                                                ₹{trade.entryPremium}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="num text-[12px]" style={{ color: "var(--text-primary)" }}>
                                                {trade.totalLots}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className="badge"
                                                style={{ background: st.bg, borderColor: st.border, color: st.color }}
                                            >
                                                {st.label}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: "right" }}>
                                            <span
                                                className="num text-[12px] font-bold"
                                                style={{ color: pnlPos ? "var(--green)" : "var(--red)" }}
                                            >
                                                {pnlPos ? "+" : ""}₹{(trade.totalPnL ?? 0).toLocaleString("en-IN")}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
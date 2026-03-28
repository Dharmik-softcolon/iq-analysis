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
        try { await tradeAPI.manualExit(signalId, "Manual exit from UI"); onUpdate(); }
        catch { alert("Exit failed. Please check manually on Zerodha."); }
        finally { setExiting(null); }
    };

    if (trades.length === 0) {
        return (
            <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                    <span className="section-title">Active Positions</span>
                    <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
                </div>
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="text-3xl opacity-20">◎</div>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>No active positions</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>System monitoring markets in real-time</div>
                </div>
            </div>
        );
    }

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
                <span className="section-title">Active Positions</span>
                <span
                    className="px-2 py-0.5 text-[9px] font-bold num"
                    style={{ background: "var(--blue-dim)", border: "1px solid var(--blue-border)", color: "var(--blue)", borderRadius: "2px" }}
                >
                    {trades.length}
                </span>
                <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            </div>

            <div className="space-y-3">
                {trades.map((trade) => {
                    const pnlPos = (trade.totalPnL ?? 0) >= 0;
                    const isBull = trade.direction === "BULL";

                    return (
                        <div
                            key={trade._id}
                            style={{
                                background: isBull ? "rgba(34,208,122,0.04)" : "rgba(240,75,75,0.04)",
                                border: `1px solid ${isBull ? "var(--green-border)" : "var(--red-border)"}`,
                                borderLeft: `3px solid ${isBull ? "var(--green)" : "var(--red)"}`,
                                borderRadius: "2px",
                                padding: "14px 16px",
                            }}
                        >
                            {/* Row 1: Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2.5">
                                    <span
                                        className="badge"
                                        style={{
                                            background: isBull ? "var(--green-dim)" : "var(--red-dim)",
                                            borderColor: isBull ? "var(--green-border)" : "var(--red-border)",
                                            color: isBull ? "var(--green)" : "var(--red)",
                                        }}
                                    >
                                        {isBull ? "▲" : "▼"} {trade.direction}
                                    </span>
                                    <span className="text-[13px] font-bold text-white num">
                                        {trade.strike} {trade.optionType}
                                    </span>
                                    <span className="text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                                        IAE {trade.iaeScore}
                                    </span>
                                </div>
                                <div
                                    className="num text-[14px] font-bold"
                                    style={{ color: pnlPos ? "var(--green)" : "var(--red)" }}
                                >
                                    {pnlPos ? "+" : ""}₹{(trade.totalPnL ?? 0).toLocaleString("en-IN")}
                                </div>
                            </div>

                            {/* Row 2: Key metrics */}
                            <div className="grid grid-cols-3 gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                {[
                                    { label: "Entry Premium", value: `₹${trade.entryPremium}` },
                                    { label: "Total Lots",    value: String(trade.totalLots) },
                                    { label: "Capital Deployed", value: `₹${trade.capitalDeployed?.toLocaleString("en-IN")}` },
                                ].map(({ label, value }) => (
                                    <div key={label}>
                                        <div className="label mb-0.5">{label}</div>
                                        <div className="num text-[12px] font-semibold text-white">{value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Row 3: Tranches */}
                            <div className="space-y-1.5 mb-3">
                                {[
                                    { label: `T1 · ${trade.t1Lots} lots`, target: `₹${trade.t1Target} (+40%)`, exited: trade.t1Exited, pnl: trade.t1PnL },
                                    { label: `T2 · ${trade.t2Lots} lots`, target: `₹${trade.t2Target} (+80%)`, exited: trade.t2Exited, pnl: trade.t2PnL },
                                    { label: `T3 · ${trade.t3Lots} lots`, target: "20% Trail",                 exited: trade.t3Exited, pnl: trade.t3PnL, running: true },
                                ].map(({ label, target, exited, pnl, running }) => (
                                    <div key={label} className="flex items-center justify-between text-[11px]">
                                        <span style={{ color: "var(--text-secondary)" }}>
                                            {label} <span style={{ color: "var(--text-muted)" }}>→ {target}</span>
                                        </span>
                                        <span className="num font-semibold" style={{
                                            color: exited ? "var(--green)" : running ? "var(--blue)" : "var(--text-muted)"
                                        }}>
                                            {exited ? `+₹${pnl?.toFixed(0)}` : running ? "Running" : "Pending"}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Row 4: SL levels */}
                            <div className="flex gap-4 mb-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                                <span>Premium SL: <span className="num text-white">₹{trade.slPremium}</span></span>
                                <span>Index SL: <span className="num text-white">{trade.adverseIndexSL}</span></span>
                            </div>

                            {/* Emergency exit */}
                            <button
                                onClick={() => handleManualExit(trade.signalId)}
                                disabled={exiting === trade.signalId}
                                className="btn btn-danger w-full text-[10px]"
                            >
                                {exiting === trade.signalId ? "Exiting···" : "⚡ Emergency Exit at Market"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
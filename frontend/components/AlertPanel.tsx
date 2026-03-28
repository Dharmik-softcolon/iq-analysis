"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

interface Alert {
    id: string;
    type: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
    message: string;
    timestamp: string;
}

const alertConfig = {
    INFO:     { color: "var(--blue)",   bg: "var(--blue-dim)",   border: "var(--blue-border)",   icon: "ℹ", label: "INFO" },
    SUCCESS:  { color: "var(--green)",  bg: "var(--green-dim)",  border: "var(--green-border)",  icon: "✓", label: "OK" },
    WARNING:  { color: "var(--yellow)", bg: "var(--yellow-dim)", border: "var(--yellow-border)", icon: "!", label: "WARN" },
    CRITICAL: { color: "var(--red)",    bg: "var(--red-dim)",    border: "var(--red-border)",    icon: "✕", label: "CRIT" },
};

export default function AlertPanel() {
    const [alerts, setAlerts] = useState<Alert[]>([]);

    useEffect(() => {
        const socket = getSocket();

        const addAlert = (type: Alert["type"], message: string) => {
            const alert: Alert = {
                id: Date.now().toString(),
                type,
                message,
                timestamp: new Date().toLocaleTimeString("en-IN"),
            };
            setAlerts((prev) => [alert, ...prev].slice(0, 50));
            if (type === "INFO") {
                setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== alert.id)), 10000);
            }
        };

        socket.on("trade:entry", (data: any) => addAlert("SUCCESS", `ENTRY: ${data.message}`));
        socket.on("trade:exit", (data: any) => addAlert(data.exitType === "SL" ? "WARNING" : "SUCCESS", `${data.exitType}: P&L ₹${data.pnl?.toFixed(0)}`));
        socket.on("system:critical", (data: any) => addAlert("CRITICAL", data.message));
        socket.on("system:emergencyClose", (data: any) => addAlert("CRITICAL", `Emergency Close: ${data.reason} — ${data.tradesAffected} positions`));
        socket.on("system:sessionReset", (data: any) => addAlert("INFO", `New session: ${data.date}`));
        socket.on("system:autoTrading", (data: any) => addAlert(data.enabled ? "SUCCESS" : "WARNING", `Auto trading ${data.enabled ? "ENABLED" : "DISABLED"}`));

        return () => {
            ["trade:entry", "trade:exit", "system:critical", "system:emergencyClose", "system:sessionReset", "system:autoTrading"]
                .forEach((e) => socket.off(e));
        };
    }, []);

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
                <span className="section-title">Live Alerts</span>
                {alerts.length > 0 && (
                    <span
                        className="px-2 py-0.5 text-[9px] font-bold num"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-base)", color: "var(--text-secondary)", borderRadius: "2px" }}
                    >
                        {alerts.length}
                    </span>
                )}
                <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
                {alerts.length > 0 && (
                    <button
                        onClick={() => setAlerts([])}
                        className="text-[10px] font-semibold uppercase tracking-wide transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                        Clear all
                    </button>
                )}
            </div>

            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                {alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="text-3xl opacity-20">◌</div>
                        <div className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>No alerts</div>
                        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>System monitoring — events will appear here</div>
                    </div>
                ) : (
                    alerts.map((alert) => {
                        const cfg = alertConfig[alert.type];
                        return (
                            <div
                                key={alert.id}
                                className="flex items-start gap-3 px-3 py-2.5"
                                style={{
                                    background: cfg.bg,
                                    border: `1px solid ${cfg.border}`,
                                    borderLeft: `3px solid ${cfg.color}`,
                                    borderRadius: "2px",
                                }}
                            >
                                <span
                                    className="badge shrink-0 mt-0.5"
                                    style={{ background: "transparent", borderColor: cfg.color, color: cfg.color, padding: "1px 5px", fontSize: "9px" }}
                                >
                                    {cfg.label}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-medium break-words" style={{ color: "var(--text-primary)" }}>
                                        {alert.message}
                                    </div>
                                    <div className="num text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                        {alert.timestamp}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
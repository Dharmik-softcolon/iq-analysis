"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

interface Alert {
    id: string;
    type: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
    message: string;
    timestamp: string;
}

export default function AlertPanel() {
    const [alerts, setAlerts] = useState<Alert[]>([]);

    useEffect(() => {
        const socket = getSocket();

        const addAlert = (
            type: Alert["type"],
            message: string
        ) => {
            const alert: Alert = {
                id: Date.now().toString(),
                type,
                message,
                timestamp: new Date().toLocaleTimeString("en-IN"),
            };

            setAlerts((prev) => [alert, ...prev].slice(0, 50));

            // Auto remove INFO alerts after 10 seconds
            if (type === "INFO") {
                setTimeout(() => {
                    setAlerts((prev) =>
                        prev.filter((a) => a.id !== alert.id)
                    );
                }, 10000);
            }
        };

        // Listen to socket events
        socket.on("trade:entry", (data: any) => {
            addAlert("SUCCESS", `🟢 ENTRY: ${data.message}`);
        });

        socket.on("trade:exit", (data: any) => {
            const type = data.exitType === "SL" ? "WARNING" : "SUCCESS";
            addAlert(
                type,
                `${data.exitType === "SL" ? "🔴 SL" : "✅ EXIT"}: ` +
                `${data.exitType} | P&L: ₹${data.pnl?.toFixed(0)}`
            );
        });

        socket.on("system:critical", (data: any) => {
            addAlert("CRITICAL", `🚨 ${data.message}`);
        });

        socket.on("system:emergencyClose", (data: any) => {
            addAlert(
                "CRITICAL",
                `⛔ EMERGENCY CLOSE: ${data.reason} | ` +
                `${data.tradesAffected} positions closed`
            );
        });

        socket.on("system:sessionReset", (data: any) => {
            addAlert("INFO", `🔄 New session: ${data.date}`);
        });

        socket.on("system:autoTrading", (data: any) => {
            addAlert(
                data.enabled ? "SUCCESS" : "WARNING",
                `Auto trading ${data.enabled ? "ENABLED" : "DISABLED"}`
            );
        });

        return () => {
            socket.off("trade:entry");
            socket.off("trade:exit");
            socket.off("system:critical");
            socket.off("system:emergencyClose");
            socket.off("system:sessionReset");
            socket.off("system:autoTrading");
        };
    }, []);

    const alertStyles = {
        INFO: "border-blue-700 bg-blue-900/20 text-blue-300",
        SUCCESS: "border-green-700 bg-green-900/20 text-green-300",
        WARNING: "border-yellow-700 bg-yellow-900/20 text-yellow-300",
        CRITICAL: "border-red-700 bg-red-900/30 text-red-300",
    };

    const alertIcons = {
        INFO: "ℹ️",
        SUCCESS: "✅",
        WARNING: "⚠️",
        CRITICAL: "🚨",
    };

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold">Live Alerts</h3>
                {alerts.length > 0 && (
                    <button
                        onClick={() => setAlerts([])}
                        className="text-gray-500 text-xs hover:text-gray-300"
                    >
                        Clear all
                    </button>
                )}
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
                {alerts.length === 0 ? (
                    <div className="text-center py-4 text-gray-600 text-sm">
                        No alerts yet — system monitoring...
                    </div>
                ) : (
                    alerts.map((alert) => (
                        <div
                            key={alert.id}
                            className={`flex items-start gap-2 p-2 rounded-lg border 
                          text-sm ${alertStyles[alert.type]}`}
                        >
              <span className="mt-0.5 shrink-0">
                {alertIcons[alert.type]}
              </span>
                            <div className="flex-1 min-w-0">
                                <div className="break-words">{alert.message}</div>
                                <div className="text-xs opacity-60 mt-0.5">
                                    {alert.timestamp}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
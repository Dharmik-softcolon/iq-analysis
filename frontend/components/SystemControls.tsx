"use client";

import { useState } from "react";
import { systemAPI } from "@/lib/api";

interface Props {
    isAutoTrading: boolean;
    capital: number;
    onUpdate: () => void;
}

export default function SystemControls({ isAutoTrading, capital, onUpdate }: Props) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newCapital, setNewCapital] = useState(capital.toString());
    const [isChoppy, setIsChoppy] = useState(false);
    const [isTrend, setIsTrend] = useState(false);

    const toggleAutoTrading = async () => {
        if (!isAutoTrading && !confirm("Enable auto trading? System will place real orders using Zerodha.")) return;
        setLoading(true);
        try { await systemAPI.toggleAutoTrading(); onUpdate(); }
        catch { alert("Failed to toggle auto trading"); }
        finally { setLoading(false); }
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            await systemAPI.updateSettings({ capital: Number(newCapital), isChoppyMonth: isChoppy, isTrendMonth: isTrend });
            onUpdate();
        } catch { alert("Failed to save settings"); }
        finally { setSaving(false); }
    };

    const monthType = isChoppy ? "choppy" : isTrend ? "trend" : "normal";

    return (
        <div className="card p-5 flex flex-col gap-4">
            {/* Title */}
            <div className="flex items-center gap-2">
                <span className="section-title">System Controls</span>
                <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            </div>

            {/* Auto Trading */}
            <div
                className="flex items-center justify-between p-4"
                style={{
                    background: isAutoTrading ? "rgba(240,75,75,0.06)" : "var(--bg-elevated)",
                    border: `1px solid ${isAutoTrading ? "var(--red-border)" : "var(--border-base)"}`,
                    borderRadius: "2px",
                }}
            >
                <div>
                    <div className="text-[12px] font-bold text-white mb-0.5">Auto Trading</div>
                    <div className="flex items-center gap-1.5">
                        <span
                            className="pulse-dot"
                            style={{
                                background: isAutoTrading ? "var(--green)" : "var(--red)",
                                boxShadow: isAutoTrading ? "0 0 6px rgba(34,208,122,0.6)" : "none",
                            }}
                        />
                        <span className="text-[10px] font-semibold tracking-wide" style={{ color: isAutoTrading ? "var(--green)" : "var(--red)" }}>
                            {isAutoTrading ? "LIVE — Real orders placed via Zerodha" : "DISABLED — Paper mode active"}
                        </span>
                    </div>
                </div>
                <button
                    onClick={toggleAutoTrading}
                    disabled={loading}
                    className={`btn ${isAutoTrading ? "btn-danger" : "btn-success"}`}
                    style={{ minWidth: 80 }}
                >
                    {loading ? "···" : isAutoTrading ? "Disable" : "Enable"}
                </button>
            </div>

            {/* Capital */}
            <div>
                <label className="label block mb-2">Trading Capital (₹)</label>
                <input
                    type="number"
                    value={newCapital}
                    onChange={(e) => setNewCapital(e.target.value)}
                    className="input"
                    placeholder="Auto-synced from Zerodha"
                    min={0}
                />
                <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Must be ≤ your Zerodha available margin. Change in Settings → General.
                </p>
            </div>

            {/* Month type */}
            <div>
                <label className="label block mb-2">Month Classification</label>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { id: "normal", label: "Normal",   action: () => { setIsChoppy(false); setIsTrend(false); }, activeColor: "var(--blue)", activeBg: "var(--blue-dim)", activeBorder: "var(--blue-border)" },
                        { id: "choppy", label: "Choppy",   action: () => { setIsChoppy(true); setIsTrend(false); },  activeColor: "#F97316", activeBg: "#1A0D00", activeBorder: "#6B3010" },
                        { id: "trend",  label: "Trending", action: () => { setIsTrend(true); setIsChoppy(false); },  activeColor: "var(--green)", activeBg: "var(--green-dim)", activeBorder: "var(--green-border)" },
                    ].map(({ id, label, action, activeColor, activeBg, activeBorder }) => {
                        const active = monthType === id;
                        return (
                            <button
                                key={id}
                                onClick={action}
                                className="btn text-[10px] py-2"
                                style={{
                                    background: active ? activeBg : "var(--bg-elevated)",
                                    borderColor: active ? activeBorder : "var(--border-base)",
                                    color: active ? activeColor : "var(--text-secondary)",
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Save */}
            <button onClick={saveSettings} disabled={saving} className="btn btn-primary w-full">
                {saving ? "Saving···" : "Save Settings"}
            </button>

            {/* Live trading warning */}
            {isAutoTrading && (
                <div
                    className="p-3"
                    style={{
                        background: "var(--red-dim)",
                        border: "1px solid var(--red-border)",
                        borderRadius: "2px",
                    }}
                >
                    <div className="text-[11px] font-bold tracking-wide mb-1" style={{ color: "var(--red)" }}>
                        ⚠ LIVE TRADING ACTIVE
                    </div>
                    <div className="text-[10px] leading-relaxed" style={{ color: "#F87171" }}>
                        Real capital is deployed. Monitor positions constantly. Emergency exit available on the Positions tab.
                    </div>
                </div>
            )}
        </div>
    );
}
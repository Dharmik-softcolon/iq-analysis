"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { systemAPI } from "@/lib/api";

export default function SettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [capital, setCapital] = useState("");
    const [availableMargin, setAvailableMargin] = useState<number | null>(null);
    const [marginLoading, setMarginLoading] = useState(false);
    const [marginError, setMarginError] = useState("");
    const [capitalError, setCapitalError] = useState("");
    const [isChoppy, setIsChoppy] = useState(false);
    const [isTrend, setIsTrend] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [activeTab, setActiveTab] = useState<"general" | "zerodha" | "telegram">("general");

    // ── Load user from localStorage ──────────────────────────────────────────
    useEffect(() => {
        const token = localStorage.getItem("whalehq_token");
        if (!token) { router.push("/"); return; }
        const userData = localStorage.getItem("whalehq_user");
        if (userData) {
            const parsed = JSON.parse(userData);
            setUser(parsed);
            setCapital(parsed.capital?.toString() || "");
        }
    }, []);

    // ── Fetch real Zerodha available margin on mount ─────────────────────────
    const fetchMargin = useCallback(async () => {
        setMarginLoading(true);
        setMarginError("");
        try {
            const res = await systemAPI.capitalSync();
            const { availableMargin: margin, currentCapital, synced } = res.data;
            setAvailableMargin(margin);
            // Auto-fill capital from real margin if it was reset/synced, or if field is empty
            if (synced || !capital) {
                setCapital(Math.floor(currentCapital).toString());
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || "Could not fetch Zerodha margin";
            setMarginError(msg);
        } finally {
            setMarginLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchMargin(); }, [fetchMargin]);

    // ── Capital input — validate in real time ────────────────────────────────
    const handleCapitalChange = (val: string) => {
        setCapital(val);
        setCapitalError("");
        const num = Number(val);
        if (availableMargin !== null && num > availableMargin) {
            setCapitalError(
                `Cannot exceed Zerodha available margin of ₹${availableMargin.toLocaleString("en-IN")}`
            );
        }
    };

    // ── Save settings ────────────────────────────────────────────────────────
    const saveGeneral = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveError("");
        const num = Number(capital);
        if (availableMargin !== null && num > availableMargin) {
            setCapitalError(`Cannot exceed Zerodha available margin of ₹${availableMargin.toLocaleString("en-IN")}`);
            return;
        }
        setSaving(true);
        try {
            await systemAPI.updateSettings({ capital: num, isChoppyMonth: isChoppy, isTrendMonth: isTrend });
            const updatedUser = { ...user, capital: num };
            localStorage.setItem("whalehq_user", JSON.stringify(updatedUser));
            setUser(updatedUser);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) {
            setSaveError(err?.response?.data?.message || "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    // ── Derived values ───────────────────────────────────────────────────────
    const capitalNum    = Number(capital) || 0;
    const isOverMargin  = availableMargin !== null && capitalNum > availableMargin;
    const marginPct     = (availableMargin && availableMargin > 0)
        ? Math.min(100, (capitalNum / availableMargin) * 100) : 0;
    const fmt = (n: number) => "₹" + Math.floor(n).toLocaleString("en-IN");

    return (
        <div className="min-h-screen bg-gray-950">

            {/* ── Header ── */}
            <header className="bg-gray-900 border-b border-gray-700 px-4 py-3">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <a href="/dashboard" className="text-gray-400 hover:text-white">← Dashboard</a>
                    <h1 className="text-white font-bold">Settings</h1>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6">

                {/* ── Tab nav ── */}
                <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-700 rounded-lg p-1 w-fit">
                    {(["general", "zerodha", "telegram"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition ${
                                activeTab === tab ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* ══════════════════════════════════════════════════════════
                    GENERAL TAB
                ══════════════════════════════════════════════════════════ */}
                {activeTab === "general" && (
                    <div className="space-y-6">
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-white font-bold text-lg mb-5">General Settings</h2>

                            {saved && (
                                <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-400 text-sm">
                                    ✅ Settings saved successfully
                                </div>
                            )}
                            {saveError && (
                                <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                                    ❌ {saveError}
                                </div>
                            )}

                            <form onSubmit={saveGeneral} className="space-y-6">

                                {/* ── Trading Capital ── */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-gray-400 text-sm font-medium">
                                            Trading Capital (₹)
                                        </label>

                                        {/* Live margin badge */}
                                        {marginLoading ? (
                                            <span className="text-xs text-gray-500 animate-pulse">Fetching Zerodha balance…</span>
                                        ) : marginError ? (
                                            <button type="button" onClick={fetchMargin}
                                                className="text-xs text-yellow-400 hover:text-yellow-300 underline">
                                                ⚠ Retry margin fetch
                                            </button>
                                        ) : availableMargin !== null ? (
                                            <span className="flex items-center gap-1.5 bg-green-900/30 border border-green-700/50 rounded-full px-3 py-0.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                                <span className="text-green-300 text-xs font-medium">
                                                    Zerodha Available: {fmt(availableMargin)}
                                                </span>
                                            </span>
                                        ) : null}
                                    </div>

                                    {/* Input + Use Max */}
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                            <input
                                                type="number"
                                                value={capital}
                                                onChange={(e) => handleCapitalChange(e.target.value)}
                                                min={0}
                                                max={availableMargin ?? undefined}
                                                placeholder="Enter trading capital"
                                                className={`w-full bg-gray-800 border rounded-lg pl-8 pr-4 py-3 text-white focus:outline-none transition ${
                                                    isOverMargin
                                                        ? "border-red-500 focus:border-red-400"
                                                        : "border-gray-600 focus:border-blue-500"
                                                }`}
                                            />
                                        </div>
                                        {availableMargin !== null && (
                                            <button
                                                type="button"
                                                onClick={() => handleCapitalChange(Math.floor(availableMargin).toString())}
                                                title="Set to full available Zerodha margin"
                                                className="px-4 py-3 bg-green-700 hover:bg-green-600 text-white text-sm font-bold rounded-lg transition whitespace-nowrap"
                                            >
                                                Use Max
                                            </button>
                                        )}
                                    </div>

                                    {/* Inline validation error */}
                                    {capitalError && (
                                        <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                                            <span>⛔</span> {capitalError}
                                        </p>
                                    )}

                                    {/* Allocation progress bar */}
                                    {availableMargin !== null && capitalNum > 0 && !isOverMargin && (
                                        <div className="mt-3">
                                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                <span>Capital allocation</span>
                                                <span>{marginPct.toFixed(1)}% of available margin</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${marginPct > 90 ? "bg-orange-500" : "bg-blue-500"}`}
                                                    style={{ width: `${marginPct}%` }}
                                                />
                                            </div>
                                            {marginPct > 90 && (
                                                <p className="text-orange-400 text-xs mt-1">
                                                    ⚠ Using {marginPct.toFixed(1)}% of your margin — consider keeping a buffer
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <p className="text-gray-500 text-xs mt-2">
                                        Must be ≤ your real Zerodha available trading margin. Defaults to actual balance automatically.
                                    </p>
                                </div>

                                {/* ── Month Classification ── */}
                                <div>
                                    <label className="text-gray-400 text-sm font-medium block mb-2">Month Classification</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { id: "normal",  label: "Normal",   desc: "Standard rules",           color: "blue"   },
                                            { id: "choppy",  label: "Choppy",   desc: "IAE 5+ min, 25% size cut", color: "orange" },
                                            { id: "trend",   label: "Trending", desc: "IAE 4 allowed, 15% trail", color: "green"  },
                                        ].map((type) => {
                                            const active =
                                                (type.id === "normal"  && !isChoppy && !isTrend) ||
                                                (type.id === "choppy"  && isChoppy) ||
                                                (type.id === "trend"   && isTrend);
                                            return (
                                                <button
                                                    key={type.id}
                                                    type="button"
                                                    onClick={() => { setIsChoppy(type.id === "choppy"); setIsTrend(type.id === "trend"); }}
                                                    className={`p-3 rounded-lg border text-left transition ${
                                                        active
                                                            ? `bg-${type.color}-900/30 border-${type.color}-600`
                                                            : "bg-gray-800 border-gray-600 hover:border-gray-500"
                                                    }`}
                                                >
                                                    <div className="text-white text-sm font-medium">{type.label}</div>
                                                    <div className="text-gray-400 text-xs mt-1">{type.desc}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={saving || !!capitalError || isOverMargin}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? "Saving…" : "Save Settings"}
                                </button>
                            </form>
                        </div>

                        {/* ── System Info ── */}
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-white font-bold text-lg mb-4">System Information</h2>
                            <div className="space-y-3 text-sm">
                                {[
                                    { label: "Version",           value: "WhaleHQ v6.0" },
                                    { label: "Strategy",          value: "NIFTY Weekly Options" },
                                    { label: "Lot Size",          value: "65 (NIFTY)" },
                                    { label: "Max Risk/Trade",    value: "2.5% of capital" },
                                    { label: "Daily Loss Limit",  value: "6% of capital" },
                                    { label: "SL Type",           value: "32% premium + 0.5% index" },
                                    { label: "Exit Strategy",     value: "40/30/30 with 20% trail" },
                                    ...(availableMargin !== null ? [{ label: "Available Margin", value: fmt(availableMargin) }] : []),
                                    ...(user?.capital           ? [{ label: "Active Capital",    value: fmt(user.capital)    }] : []),
                                ].map((item) => (
                                    <div key={item.label} className="flex justify-between py-2 border-b border-gray-800">
                                        <span className="text-gray-400">{item.label}</span>
                                        <span className="text-white font-medium">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════
                    ZERODHA TAB
                ══════════════════════════════════════════════════════════ */}
                {activeTab === "zerodha" && (
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                        <h2 className="text-white font-bold text-lg mb-4">Zerodha API Settings</h2>

                        <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg mb-6">
                            <div className="text-blue-300 text-sm font-bold mb-2">📋 Setup Instructions</div>
                            <ol className="text-blue-200 text-sm space-y-1 list-decimal list-inside">
                                <li>Go to <a href="https://developers.kite.trade" target="_blank" className="underline" rel="noreferrer">developers.kite.trade</a></li>
                                <li>Create a new app (Postback URL can be localhost)</li>
                                <li>Copy your API Key and API Secret</li>
                                <li>Complete the OAuth login below every morning</li>
                            </ol>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                <span className="text-gray-400 text-sm">API Status</span>
                                <span className={`text-sm font-bold ${user?.hasZerodha ? "text-green-400" : "text-red-400"}`}>
                                    {user?.hasZerodha ? "✅ Connected" : "❌ Not connected"}
                                </span>
                            </div>

                            <a href="/settings/zerodha"
                                className="block w-full py-3 bg-orange-700 hover:bg-orange-600 text-white rounded-lg font-bold text-center transition">
                                🔑 Update Zerodha Credentials
                            </a>

                            <div className="p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                                <div className="text-yellow-300 text-xs">
                                    ⚠️ Zerodha access tokens expire daily at midnight. Re-authenticate every morning before 09:15 IST.
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════
                    TELEGRAM TAB
                ══════════════════════════════════════════════════════════ */}
                {activeTab === "telegram" && (
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                        <h2 className="text-white font-bold text-lg mb-4">Telegram Alerts</h2>

                        <div className="space-y-4">
                            <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                                <div className="text-blue-300 text-sm font-bold mb-3">📱 Setup Telegram Bot</div>
                                <div className="space-y-3 text-sm text-blue-200">
                                    {[
                                        { n: 1, text: <>Open Telegram → search <code className="bg-blue-800 px-1 rounded">@BotFather</code> → send <code className="bg-blue-800 px-1 rounded">/newbot</code></> },
                                        { n: 2, text: "Copy the BOT TOKEN it gives you" },
                                        { n: 3, text: <>Search <code className="bg-blue-800 px-1 rounded">@userinfobot</code> → get your CHAT ID</> },
                                        { n: 4, text: <>Add both to <code className="bg-blue-800 px-1 rounded">python-engine/.env</code></> },
                                    ].map(({ n, text }) => (
                                        <div key={n} className="flex gap-3">
                                            <span className="bg-blue-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">{n}</span>
                                            <span>{text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 bg-gray-800 rounded-lg">
                                <div className="text-gray-400 text-xs mb-2 font-mono">python-engine/.env</div>
                                <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap">{`TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
TELEGRAM_CHAT_ID=987654321`}</pre>
                            </div>

                            <div className="p-4 bg-gray-800 rounded-lg">
                                <div className="text-white text-sm font-medium mb-2">Test Your Setup</div>
                                <div className="text-gray-400 text-xs mb-3">Run this in your terminal after setting .env:</div>
                                <pre className="text-yellow-400 text-xs font-mono bg-gray-900 p-2 rounded">{`cd python-engine\npython engines/telegram_setup_guide.py`}</pre>
                            </div>

                            <div>
                                <div className="text-gray-400 text-sm font-medium mb-2">You will receive alerts for:</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { emoji: "🚀", label: "System startup"  },
                                        { emoji: "📊", label: "IB IAE score"    },
                                        { emoji: "🟢", label: "Trade entry"     },
                                        { emoji: "✅", label: "T1/T2 exits"     },
                                        { emoji: "🏁", label: "T3 trail exit"   },
                                        { emoji: "🔴", label: "SL hits"         },
                                        { emoji: "📋", label: "Daily summary"   },
                                        { emoji: "🚨", label: "Critical alerts" },
                                    ].map((item) => (
                                        <div key={item.label} className="flex items-center gap-2 p-2 bg-gray-800 rounded text-sm">
                                            <span>{item.emoji}</span>
                                            <span className="text-gray-300">{item.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { systemAPI, authAPI } from "@/lib/api";

export default function SettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [capital, setCapital] = useState("");
    const [isChoppy, setIsChoppy] = useState(false);
    const [isTrend, setIsTrend] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<
        "general" | "zerodha" | "telegram"
    >("general");

    useEffect(() => {
        const token = localStorage.getItem("whalehq_token");
        if (!token) {
            router.push("/");
            return;
        }
        const userData = localStorage.getItem("whalehq_user");
        if (userData) {
            const parsed = JSON.parse(userData);
            setUser(parsed);
            setCapital(parsed.capital?.toString() || "500000");
        }
    }, []);

    const saveGeneral = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            await systemAPI.updateSettings({
                capital: Number(capital),
                isChoppyMonth: isChoppy,
                isTrendMonth: isTrend,
            });

            // Update local user
            const updatedUser = {
                ...user,
                capital: Number(capital),
            };
            localStorage.setItem(
                "whalehq_user",
                JSON.stringify(updatedUser)
            );
            setUser(updatedUser);

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            alert("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Header */}
            <header className="bg-gray-900 border-b border-gray-700 px-4 py-3">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <a
                        href="/dashboard"
                        className="text-gray-400 hover:text-white"
                    >
                        ← Dashboard
                    </a>
                    <h1 className="text-white font-bold">Settings</h1>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6">
                {/* Tab nav */}
                <div className="flex gap-1 mb-6 bg-gray-900 border
                        border-gray-700 rounded-lg p-1 w-fit">
                    {(["general", "zerodha", "telegram"] as const).map(
                        (tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-md text-sm font-medium 
                            capitalize transition ${
                                    activeTab === tab
                                        ? "bg-blue-600 text-white"
                                        : "text-gray-400 hover:text-white"
                                }`}
                            >
                                {tab}
                            </button>
                        )
                    )}
                </div>

                {/* General Settings */}
                {activeTab === "general" && (
                    <div className="space-y-6">
                        <div className="bg-gray-900 border border-gray-700
                            rounded-xl p-6">
                            <h2 className="text-white font-bold text-lg mb-4">
                                General Settings
                            </h2>

                            {saved && (
                                <div className="mb-4 p-3 bg-green-900/30
                                border border-green-700 rounded-lg
                                text-green-400 text-sm">
                                    ✅ Settings saved successfully
                                </div>
                            )}

                            <form onSubmit={saveGeneral} className="space-y-4">
                                {/* Capital */}
                                <div>
                                    <label className="text-gray-400 text-sm block mb-2">
                                        Trading Capital (₹)
                                    </label>
                                    <input
                                        type="number"
                                        value={capital}
                                        onChange={(e) => setCapital(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-600
                               rounded-lg px-4 py-3 text-white
                               focus:outline-none focus:border-blue-500"
                                    />
                                    <p className="text-gray-500 text-xs mt-1">
                                        Update after each month to reflect actual balance
                                    </p>
                                </div>

                                {/* Month type */}
                                <div>
                                    <label className="text-gray-400 text-sm block mb-2">
                                        Month Classification
                                    </label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            {
                                                id: "normal",
                                                label: "Normal",
                                                desc: "Standard rules",
                                                color: "blue",
                                            },
                                            {
                                                id: "choppy",
                                                label: "Choppy",
                                                desc: "IAE 5+ min, 25% size cut",
                                                color: "orange",
                                            },
                                            {
                                                id: "trend",
                                                label: "Trending",
                                                desc: "IAE 4 allowed, 15% trail",
                                                color: "green",
                                            },
                                        ].map((type) => (
                                            <button
                                                key={type.id}
                                                type="button"
                                                onClick={() => {
                                                    setIsChoppy(type.id === "choppy");
                                                    setIsTrend(type.id === "trend");
                                                }}
                                                className={`p-3 rounded-lg border text-left 
                                    transition ${
                                                    (type.id === "normal" &&
                                                        !isChoppy &&
                                                        !isTrend) ||
                                                    (type.id === "choppy" && isChoppy) ||
                                                    (type.id === "trend" && isTrend)
                                                        ? `bg-${type.color}-900/30 
                                           border-${type.color}-600`
                                                        : "bg-gray-800 border-gray-600"
                                                }`}
                                            >
                                                <div className="text-white text-sm font-medium">
                                                    {type.label}
                                                </div>
                                                <div className="text-gray-400 text-xs mt-1">
                                                    {type.desc}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500
                             text-white rounded-lg font-bold transition
                             disabled:opacity-50"
                                >
                                    {saving ? "Saving..." : "Save Settings"}
                                </button>
                            </form>
                        </div>

                        {/* System Info */}
                        <div className="bg-gray-900 border border-gray-700
                            rounded-xl p-6">
                            <h2 className="text-white font-bold text-lg mb-4">
                                System Information
                            </h2>
                            <div className="space-y-3 text-sm">
                                {[
                                    { label: "Version", value: "WhaleHQ v6.0" },
                                    { label: "Strategy", value: "NIFTY Weekly Options" },
                                    { label: "Lot Size", value: "75 (NIFTY)" },
                                    { label: "Max Risk/Trade", value: "2.5% of capital" },
                                    { label: "Daily Loss Limit", value: "6% of capital" },
                                    { label: "SL Type", value: "32% premium + 0.5% index" },
                                    { label: "Exit Strategy", value: "40/30/30 with 20% trail" },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        className="flex justify-between py-2 border-b
                               border-gray-800"
                                    >
                                        <span className="text-gray-400">{item.label}</span>
                                        <span className="text-white font-medium">
                      {item.value}
                    </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Zerodha Settings */}
                {activeTab === "zerodha" && (
                    <div className="bg-gray-900 border border-gray-700
                          rounded-xl p-6">
                        <h2 className="text-white font-bold text-lg mb-4">
                            Zerodha API Settings
                        </h2>

                        <div className="p-4 bg-blue-900/20 border border-blue-700
                            rounded-lg mb-6">
                            <div className="text-blue-300 text-sm font-bold mb-2">
                                📋 Setup Instructions
                            </div>
                            <ol className="text-blue-200 text-sm space-y-1 list-decimal
                             list-inside">
                                <li>
                                    Go to{" "}
                                    <a
                                        href="https://developers.kite.trade"
                                        target="_blank"
                                        className="underline"
                                        rel="noreferrer"
                                    >
                                        developers.kite.trade
                                    </a>
                                </li>
                                <li>Create a new app (Postback URL can be localhost)</li>
                                <li>Copy your API Key and API Secret</li>
                                <li>
                                    Complete the OAuth login below every morning
                                </li>
                            </ol>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3
                              bg-gray-800 rounded-lg">
                <span className="text-gray-400 text-sm">
                  API Status
                </span>
                                <span
                                    className={`text-sm font-bold ${
                                        user?.hasZerodha
                                            ? "text-green-400"
                                            : "text-red-400"
                                    }`}
                                >
                  {user?.hasZerodha ? "✅ Connected" : "❌ Not connected"}
                </span>
                            </div>

                            <a
                                href="/settings/zerodha"
                                className="block w-full py-3 bg-orange-700
                           hover:bg-orange-600 text-white rounded-lg
                           font-bold text-center transition"
                            >
                                🔑 Update Zerodha Credentials
                            </a>

                            <div className="p-3 bg-yellow-900/20 border
                              border-yellow-700 rounded-lg">
                                <div className="text-yellow-300 text-xs">
                                    ⚠️ Zerodha access tokens expire daily at midnight.
                                    You must re-authenticate every morning before market
                                    opens (before 09:15 IST).
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Telegram Settings */}
                {activeTab === "telegram" && (
                    <div className="bg-gray-900 border border-gray-700
                          rounded-xl p-6">
                        <h2 className="text-white font-bold text-lg mb-4">
                            Telegram Alerts
                        </h2>

                        <div className="space-y-4">
                            <div className="p-4 bg-blue-900/20 border border-blue-700
                              rounded-lg">
                                <div className="text-blue-300 text-sm font-bold mb-3">
                                    📱 Setup Telegram Bot
                                </div>
                                <div className="space-y-3 text-sm text-blue-200">
                                    <div className="flex gap-3">
                    <span className="bg-blue-700 text-white rounded-full
                                     w-6 h-6 flex items-center justify-center
                                     text-xs shrink-0">
                      1
                    </span>
                                        <span>
                      Open Telegram → Search{" "}
                                            <code className="bg-blue-800 px-1 rounded">
                        @BotFather
                      </code>{" "}
                                            → Send{" "}
                                            <code className="bg-blue-800 px-1 rounded">
                        /newbot
                      </code>
                    </span>
                                    </div>
                                    <div className="flex gap-3">
                    <span className="bg-blue-700 text-white rounded-full
                                     w-6 h-6 flex items-center justify-center
                                     text-xs shrink-0">
                      2
                    </span>
                                        <span>Copy the BOT TOKEN it gives you</span>
                                    </div>
                                    <div className="flex gap-3">
                    <span className="bg-blue-700 text-white rounded-full
                                     w-6 h-6 flex items-center justify-center
                                     text-xs shrink-0">
                      3
                    </span>
                                        <span>
                      Search{" "}
                                            <code className="bg-blue-800 px-1 rounded">
                        @userinfobot
                      </code>{" "}
                                            → get your CHAT ID
                    </span>
                                    </div>
                                    <div className="flex gap-3">
                    <span className="bg-blue-700 text-white rounded-full
                                     w-6 h-6 flex items-center justify-center
                                     text-xs shrink-0">
                      4
                    </span>
                                        <span>
                      Add both to{" "}
                                            <code className="bg-blue-800 px-1 rounded">
                        python-engine/.env
                      </code>
                    </span>
                                    </div>
                                </div>
                            </div>

                            {/* .env snippet */}
                            <div className="p-4 bg-gray-800 rounded-lg">
                                <div className="text-gray-400 text-xs mb-2 font-mono">
                                    python-engine/.env
                                </div>
                                <pre className="text-green-400 text-xs font-mono
                                whitespace-pre-wrap">
{`TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
TELEGRAM_CHAT_ID=987654321`}
                </pre>
                            </div>

                            {/* Test button */}
                            <div className="p-4 bg-gray-800 rounded-lg">
                                <div className="text-white text-sm font-medium mb-2">
                                    Test Your Setup
                                </div>
                                <div className="text-gray-400 text-xs mb-3">
                                    Run this in your terminal after setting .env:
                                </div>
                                <pre className="text-yellow-400 text-xs font-mono
                                bg-gray-900 p-2 rounded">
{`cd python-engine
python engines/telegram_setup_guide.py`}
                </pre>
                            </div>

                            {/* Alert types */}
                            <div>
                                <div className="text-gray-400 text-sm font-medium mb-2">
                                    You will receive alerts for:
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { emoji: "🚀", label: "System startup" },
                                        { emoji: "📊", label: "IB IAE score" },
                                        { emoji: "🟢", label: "Trade entry" },
                                        { emoji: "✅", label: "T1/T2 exits" },
                                        { emoji: "🏁", label: "T3 trail exit" },
                                        { emoji: "🔴", label: "SL hits" },
                                        { emoji: "📋", label: "Daily summary" },
                                        { emoji: "🚨", label: "Critical alerts" },
                                    ].map((item) => (
                                        <div
                                            key={item.label}
                                            className="flex items-center gap-2 p-2
                                 bg-gray-800 rounded text-sm"
                                        >
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
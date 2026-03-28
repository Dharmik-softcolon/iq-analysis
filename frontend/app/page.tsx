"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authAPI } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await authAPI.login(email, password);
            const { token, user } = res.data;

            localStorage.setItem("whalehq_token", token);
            localStorage.setItem("whalehq_user", JSON.stringify(user));

            // Smart Redirect: If Kite token expired, force to SSO page. Else go to Dashboard.
            if (user.hasZerodha && !user.isZerodhaConnected) {
                router.push("/settings/zerodha");
            } else {
                router.push("/dashboard");
            }
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Login failed. Check credentials."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="text-5xl mb-3">🐋</div>
                    <h1 className="text-3xl font-black text-white">WhaleHQ</h1>
                    <p className="text-gray-400 mt-1">v6.0 — Institutional Trading System</p>
                    <p className="text-gray-500 text-sm mt-1">
                        NIFTY Weekly Options Engine
                    </p>
                </div>

                {/* Form */}
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-8">
                    <h2 className="text-white font-bold text-xl mb-6">Sign In</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/30 border border-red-700
                            rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="text-gray-400 text-sm block mb-2">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full bg-gray-800 border border-gray-600
                           rounded-lg px-4 py-3 text-white
                           focus:outline-none focus:border-blue-500"
                                placeholder="your@email.com"
                            />
                        </div>

                        <div>
                            <label className="text-gray-400 text-sm block mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full bg-gray-800 border border-gray-600
                           rounded-lg px-4 py-3 text-white
                           focus:outline-none focus:border-blue-500"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500
                         text-white rounded-lg font-bold transition
                         disabled:opacity-50"
                        >
                            {loading ? "Signing in..." : "Sign In →"}
                        </button>
                    </form>

                    <div className="mt-4 text-center">
            <span className="text-gray-500 text-sm">
              No account?{" "}
            </span>
                        <a
                            href="/register"
                            className="text-blue-400 text-sm hover:underline"
                        >
                            Register
                        </a>
                    </div>
                </div>

                {/* Disclaimer */}
                <p className="text-gray-600 text-xs text-center mt-6">
                    For authorized users only. Trading involves risk.
                    Past performance does not guarantee future results.
                </p>
            </div>
        </div>
    );
}
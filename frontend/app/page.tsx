"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authAPI } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        // Auto-redirect if already logged in
        const userStr = localStorage.getItem("whalehq_user");
        if (userStr) {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get("request_token");
            
            // If they got bounced here from Zerodha (misconfigured redirect URL), forward them correctly
            if (token) {
                router.push(`/settings/zerodha?request_token=${token}`);
            } else {
                router.push("/dashboard");
            }
        }
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await authAPI.login(email, password);
            const { token, user } = res.data;
            localStorage.setItem("whalehq_token", token);
            localStorage.setItem("whalehq_user", JSON.stringify(user));
            const urlParams = new URLSearchParams(window.location.search);
            const reqToken = urlParams.get("request_token");
            const tokenParam = reqToken ? `?request_token=${reqToken}` : "";

            if (user.hasZerodha && !user.isZerodhaConnected) {
                router.push(`/settings/zerodha${tokenParam}`);
            } else {
                if (reqToken) {
                    router.push(`/settings/zerodha${tokenParam}`);
                } else {
                    router.push("/dashboard");
                }
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Login failed. Check credentials.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center p-4"
            style={{ background: "var(--bg-base)" }}
        >
            {/* subtle grid background */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: `
                        linear-gradient(var(--border-subtle) 1px, transparent 1px),
                        linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)
                    `,
                    backgroundSize: "48px 48px",
                    opacity: 0.4,
                }}
            />

            <div className="relative w-full max-w-sm">

                {/* Brand */}
                <div className="text-center mb-8">
                    <div
                        className="inline-flex items-center justify-center w-12 h-12 mb-4 text-2xl"
                        style={{
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-base)",
                            borderRadius: "2px",
                        }}
                    >
                        🐋
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-white">WhaleHQ</h1>
                    <p className="text-[12px] font-medium mt-1" style={{ color: "var(--text-secondary)" }}>
                        v6.0 — Institutional Trading System
                    </p>
                    <p className="text-[11px] mt-0.5 uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>
                        NIFTY Weekly Options Engine
                    </p>
                </div>

                {/* Card */}
                <div
                    style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-base)",
                        borderRadius: "3px",
                        padding: "32px",
                    }}
                >
                    <div className="section-title mb-5">Sign In</div>

                    {error && (
                        <div
                            className="mb-4 px-3 py-2.5 text-[11px] font-medium"
                            style={{
                                background: "var(--red-dim)",
                                border: "1px solid var(--red-border)",
                                color: "var(--red)",
                                borderRadius: "2px",
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="label block mb-2">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="input"
                                placeholder="your@email.com"
                            />
                        </div>

                        <div>
                            <label className="label block mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="input"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary w-full mt-2"
                            style={{ padding: "11px 16px", fontSize: "12px" }}
                        >
                            {loading ? "Authenticating···" : "Sign In →"}
                        </button>
                    </form>

                    <div className="mt-5 pt-4 text-center" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            No account?{" "}
                            <a href="/register" className="font-semibold transition-colors" style={{ color: "var(--blue)" }}>
                                Register
                            </a>
                        </span>
                    </div>
                </div>

                {/* Disclaimer */}
                <p className="text-[10px] text-center mt-5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    For authorized users only. Trading involves risk.<br />
                    Past performance does not guarantee future results.
                </p>
            </div>
        </div>
    );
}
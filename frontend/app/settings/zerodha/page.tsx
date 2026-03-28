"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { authAPI } from "@/lib/api";

export default function ZerodhaSetupPage() {
    const searchParams = useSearchParams();
    const urlRequestToken = searchParams.get("request_token");

    const [step, setStep] = useState<"credentials" | "login" | "done">("credentials");
    const [apiKey, setApiKey] = useState("");
    const [apiSecret, setApiSecret] = useState("");
    const [requestToken, setRequestToken] = useState("");
    const [loginUrl, setLoginUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [userId, setUserId] = useState("");

    useEffect(() => {
        // Fetch user context
        const userStr = localStorage.getItem("whalehq_user");
        if (userStr) {
            const user = JSON.parse(userStr);
            setUserId(user.id || "");
            
            // If they already have an API key saved, fetch user details to get the key and rebuild login URL
            if (user.hasZerodha) {
                authAPI.getMe().then((res) => {
                    const fullUser = res.data?.user;
                    if (fullUser?.zerodhaApiKey) {
                        setLoginUrl(`https://kite.trade/connect/login?v=3&api_key=${fullUser.zerodhaApiKey}`);
                        setStep("login");
                    }
                }).catch(console.error);
            }
        }
    }, []);

    // Effect to automatically process the request_token from URL redirect
    useEffect(() => {
        if (urlRequestToken && userId && step !== "done") {
            const autoSubmitToken = async () => {
                setLoading(true);
                setError("");
                setRequestToken(urlRequestToken);
                try {
                    await authAPI.zerodhaCallback(userId, urlRequestToken);
                    setStep("done");
                } catch (err: any) {
                    setError(err.response?.data?.message || "Auto-authentication failed");
                    setStep("login");
                } finally {
                    setLoading(false);
                }
            };
            autoSubmitToken();
        }
    }, [urlRequestToken, userId]);

    const handleDynamicLoginUrl = async () => {
        // Fallback or explicit request for login URL when skipping step 1
        setLoading(true);
        // Note: In a real system, the backend should provide an endpoint to just get the authUrl
        // Since we don't have that endpoint standalone without credentials, for safety 
        // we'll advise the user they need Kite credentials unless they just use the known format:
        // https://kite.trade/connect/login?v=3&api_key=XXX
        // However, since we can't reliably get the API key client-side, we might need them to 
        // re-save it if it's their very first time. BUT, if they are stuck at step 2, 
        // we can just reveal the credentials form if they need a new login URL.
        setStep("credentials");
        setLoading(false);
    };

    const saveCredentials = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await authAPI.saveZerodhaCredentials(
                userId,
                apiKey,
                apiSecret
            );
            setLoginUrl(res.data.loginUrl);
            setStep("login");
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to save credentials");
        } finally {
            setLoading(false);
        }
    };

    const submitRequestToken = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            await authAPI.zerodhaCallback(userId, requestToken);
            setStep("done");
        } catch (err: any) {
            setError(err.response?.data?.message || "Authentication failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center
                    justify-center p-4">
            <div className="w-full max-w-lg">
                <div className="text-center mb-8">
                    <div className="text-5xl mb-3">🔑</div>
                    <h1 className="text-2xl font-black text-white">
                        Zerodha Setup
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Connect your Zerodha API for live trading
                    </p>
                </div>

                {/* Steps indicator */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {["credentials", "login", "done"].map((s, i) => (
                        <div key={s} className="flex items-center gap-2">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center 
                             justify-center text-sm font-bold ${
                                    step === s
                                        ? "bg-blue-600 text-white"
                                        : i <
                                        ["credentials", "login", "done"].indexOf(
                                            step
                                        )
                                            ? "bg-green-600 text-white"
                                            : "bg-gray-700 text-gray-400"
                                }`}
                            >
                                {i + 1}
                            </div>
                            {i < 2 && (
                                <div className="w-8 h-0.5 bg-gray-700" />
                            )}
                        </div>
                    ))}
                </div>

                <div className="bg-gray-900 border border-gray-700 rounded-xl p-8">

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/30 border border-red-700
                            rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Step 1: API Credentials */}
                    {step === "credentials" && (
                        <form onSubmit={saveCredentials} className="space-y-4">
                            <h3 className="text-white font-bold mb-4">
                                Step 1: Enter API Credentials
                            </h3>
                            <div className="p-3 bg-blue-900/30 border border-blue-700
                              rounded-lg text-blue-300 text-sm mb-4">
                                Get your API Key and Secret from{" "}
                                <a
                                    href="https://developers.kite.trade"
                                    target="_blank"
                                    className="underline"
                                    rel="noreferrer"
                                >
                                    developers.kite.trade
                                </a>
                            </div>

                            <div>
                                <label className="text-gray-400 text-sm block mb-2">
                                    API Key
                                </label>
                                <input
                                    type="text"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    required
                                    className="w-full bg-gray-800 border border-gray-600
                             rounded-lg px-4 py-3 text-white
                             focus:outline-none focus:border-blue-500"
                                    placeholder="your_api_key"
                                />
                            </div>

                            <div>
                                <label className="text-gray-400 text-sm block mb-2">
                                    API Secret
                                </label>
                                <input
                                    type="password"
                                    value={apiSecret}
                                    onChange={(e) => setApiSecret(e.target.value)}
                                    required
                                    className="w-full bg-gray-800 border border-gray-600
                             rounded-lg px-4 py-3 text-white
                             focus:outline-none focus:border-blue-500"
                                    placeholder="your_api_secret"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500
                           text-white rounded-lg font-bold transition
                           disabled:opacity-50"
                            >
                                {loading ? "Saving..." : "Save & Get Login URL →"}
                            </button>
                        </form>
                    )}

                    {/* Step 2: Login and get request token */}
                    {step === "login" && (
                        <div className="space-y-4">
                            <h3 className="text-white font-bold mb-4">
                                Step 2: Authenticate with Zerodha
                            </h3>

                            {loginUrl ? (
                                <a
                                    href={loginUrl}
                                    className="block w-full py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold text-center transition"
                                >
                                    🔗 Open Zerodha Login →
                                </a>
                            ) : (
                                <button
                                    onClick={() => setStep("credentials")}
                                    className="block w-full py-3 bg-orange-800 text-white rounded-lg font-bold text-center transition"
                                >
                                    Login URL expired. Re-enter credentials to generate a new one.
                                </button>
                            )}

                            <div className="p-3 bg-gray-800 rounded-lg text-sm text-gray-400">
                                After logging in, Zerodha will redirect back here.
                                The system will detect the code in the URL and connect <strong>automatically</strong>.
                                No need to copy-paste.
                            </div>

                            <form onSubmit={submitRequestToken} className="space-y-4">
                                <div>
                                    <label className="text-gray-400 text-sm block mb-2">
                                        Request Token (from redirect URL)
                                    </label>
                                    <input
                                        type="text"
                                        value={requestToken}
                                        onChange={(e) => setRequestToken(e.target.value)}
                                        required
                                        className="w-full bg-gray-800 border border-gray-600
                               rounded-lg px-4 py-3 text-white
                               focus:outline-none focus:border-blue-500"
                                        placeholder="paste_request_token_here"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3 bg-green-600 hover:bg-green-500
                             text-white rounded-lg font-bold transition
                             disabled:opacity-50"
                                >
                                    {loading ? "Authenticating..." : "Complete Setup →"}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Step 3: Done */}
                    {step === "done" && (
                        <div className="text-center py-4">
                            <div className="text-5xl mb-4">✅</div>
                            <h3 className="text-white font-bold text-xl mb-2">
                                Zerodha Connected!
                            </h3>
                            <p className="text-gray-400 text-sm mb-6">
                                Your Zerodha account is now linked. The system can place
                                live orders. Enable auto trading from the dashboard.
                            </p>
                            <a
                                href="/dashboard"
                                className="block w-full py-3 bg-blue-600
                           hover:bg-blue-500 text-white rounded-lg
                           font-bold text-center"
                            >
                                Go to Dashboard →
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
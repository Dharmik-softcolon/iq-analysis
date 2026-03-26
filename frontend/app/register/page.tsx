"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authAPI } from "@/lib/api";

export default function RegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (form.password !== form.confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            const res = await authAPI.register(
                form.name,
                form.email,
                form.password
            );
            const { token, user } = res.data;

            localStorage.setItem("whalehq_token", token);
            localStorage.setItem("whalehq_user", JSON.stringify(user));

            router.push("/settings/zerodha");
        } catch (err: any) {
            setError(err.response?.data?.message || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="text-5xl mb-3">🐋</div>
                    <h1 className="text-3xl font-black text-white">WhaleHQ</h1>
                    <p className="text-gray-400 mt-1">Create your account</p>
                </div>

                <div className="bg-gray-900 border border-gray-700 rounded-xl p-8">
                    <h2 className="text-white font-bold text-xl mb-6">Register</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/30 border border-red-700
                            rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleRegister} className="space-y-4">
                        {[
                            { key: "name", label: "Full Name", type: "text" },
                            { key: "email", label: "Email", type: "email" },
                            { key: "password", label: "Password", type: "password" },
                            {
                                key: "confirmPassword",
                                label: "Confirm Password",
                                type: "password",
                            },
                        ].map((field) => (
                            <div key={field.key}>
                                <label className="text-gray-400 text-sm block mb-2">
                                    {field.label}
                                </label>
                                <input
                                    type={field.type}
                                    value={form[field.key as keyof typeof form]}
                                    onChange={(e) =>
                                        setForm({ ...form, [field.key]: e.target.value })
                                    }
                                    required
                                    className="w-full bg-gray-800 border border-gray-600
                             rounded-lg px-4 py-3 text-white
                             focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        ))}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500
                         text-white rounded-lg font-bold transition
                         disabled:opacity-50"
                        >
                            {loading ? "Creating account..." : "Create Account →"}
                        </button>
                    </form>

                    <div className="mt-4 text-center">
                        <a href="/" className="text-blue-400 text-sm hover:underline">
                            Already have an account? Sign in
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
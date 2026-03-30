import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const api = axios.create({
    baseURL: `${API_URL}/api`,
    headers: { "Content-Type": "application/json" },
});

// Attach token automatically
api.interceptors.request.use((config) => {
    if (typeof window !== "undefined") {
        const token = localStorage.getItem("whalehq_token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

// Auth APIs
export const authAPI = {
    login: (email: string, password: string) =>
        api.post("/auth/login", { email, password }),

    register: (name: string, email: string, password: string) =>
        api.post("/auth/register", { name, email, password }),

    getMe: () => api.get("/auth/me"),

    saveZerodhaCredentials: (
        userId: string,
        apiKey: string,
        apiSecret: string
    ) =>
        api.post("/auth/zerodha/credentials", {
            userId, apiKey, apiSecret,
        }),

    zerodhaCallback: (userId: string, requestToken: string) =>
        api.post("/auth/zerodha/callback", { userId, requestToken }),
};

// System APIs
export const systemAPI = {
    getState: () => api.get("/system/state"),
    getIndices: () => api.get("/system/indices"),
    getMargins: () => api.get("/system/margins"),
    toggleAutoTrading: () => api.post("/system/toggle-auto"),
    updateSettings: (settings: Record<string, unknown>) =>
        api.put("/system/settings", settings),
    // Returns real Zerodha available margin and auto-syncs capital if needed
    capitalSync: () => api.get("/system/capital-sync"),
    // Historical Data Endpoints
    getAvailableDates: () => api.get("/system/sessions/dates"),
    getHistoricalBuildup: (date: string) => api.get(`/system/sessions/${date}/buildup`),
};

// Trade APIs
export const tradeAPI = {
    getActive: () => api.get("/orders/active"),
    getHistory: (params?: Record<string, unknown>) =>
        api.get("/trades/history", { params }),
    getStats: () => api.get("/trades/stats"),
    getToday: () => api.get("/trades/today"),
    manualExit: (signalId: string, reason: string) =>
        api.post("/orders/manual-exit", { signalId, reason }),
};

export default api;
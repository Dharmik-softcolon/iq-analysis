"use client";

import { useEffect, useState } from "react";
import { systemAPI } from "@/lib/api";
import { BuildupTick } from "@/lib/types";
import BuildupChart from "@/components/BuildupChart";

interface Props {
    liveData: BuildupTick[];
}

export default function HistoricalBuildupView({ liveData }: Props) {
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>("LIVE");
    const [historicalData, setHistoricalData] = useState<BuildupTick[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Fetch available dates on mount
        systemAPI.getAvailableDates().then((res) => {
            if (res.data?.dates) {
                setDates(res.data.dates);
            }
        }).catch(err => console.error("Failed to load historical dates", err));
    }, []);

    useEffect(() => {
        if (selectedDate === "LIVE") {
            setHistoricalData(null);
            return;
        }

        // Fetch historical data for selected date
        setLoading(true);
        systemAPI.getHistoricalBuildup(selectedDate).then((res) => {
            if (res.data?.success) {
                setHistoricalData(res.data.buildupHistory || []);
            }
        }).catch(err => {
            console.error("Failed to fetch historical buildup", err);
            setHistoricalData([]);
        }).finally(() => {
            setLoading(false);
        });

    }, [selectedDate]);

    const displayData = selectedDate === "LIVE" ? liveData || [] : historicalData || [];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-[13px] font-bold tracking-wider" style={{ color: "var(--text-primary)" }}>
                        OI Buildup Viewer
                    </h2>
                    <p className="text-[11px] mt-1 pr-10" style={{ color: "var(--text-muted)" }}>
                        Visualize 1-minute market momentum from live activity or past trading sessions.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <label className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>
                        Select Session
                    </label>
                    <select
                        className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[12px] px-3 py-1.5 rounded-sm outline-none text-[var(--text-primary)] cursor-pointer hover:border-[var(--border-hover)] transition-colors"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        disabled={loading}
                    >
                        <option value="LIVE">Live Session (Today)</option>
                        {dates.map(date => (
                            <option key={date} value={date}>{date}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="relative">
                {loading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--bg-base)] bg-opacity-70 backdrop-blur-sm">
                        <span className="pulse-dot bg-blue-500 mb-2" />
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Fetching Database...</span>
                    </div>
                )}
                
                {/* 
                  Passing the custom title or allowing BuildupChart to handle its own header. 
                  BuildupChart actually renders the card container itself. 
                */}
                <BuildupChart data={displayData} />
            </div>
        </div>
    );
}

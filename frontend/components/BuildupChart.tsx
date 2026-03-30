"use client";

import { useMemo } from "react";
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import { BuildupTick } from "@/lib/types";

interface Props {
    data: BuildupTick[];
}

export default function BuildupChart({ data = [] }: Props) {
    // Process data: Make bearish values negative to stack downwards and calculate running totals
    const chartData = useMemo(() => {
        let runningBull = 0;
        let runningBear = 0;

        return data.map((tick) => {
            runningBull += tick.totalBullish;
            runningBear += tick.totalBearish;

            return {
                time: tick.time,
                LB: tick.lb,           // Positive (Bullish)
                SC: tick.sc,           // Positive (Bullish)
                SB: -Math.abs(tick.sb), // Negative (Bearish)
                LU: -Math.abs(tick.lu), // Negative (Bearish)
                totalBullish: tick.totalBullish,
                totalBearish: tick.totalBearish,
                runningBull: Number(runningBull.toFixed(2)),
                runningBear: Number(runningBear.toFixed(2)),
                ivp: tick.ivp
            };
        });
    }, [data]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const raw = payload[0].payload;
            return (
                <div
                    style={{
                        background: "var(--bg-overlay)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "4px",
                        padding: "10px 14px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                        minWidth: "150px"
                    }}
                >
                    <div className="text-[12px] font-bold mb-2 flex justify-between" style={{ color: "var(--text-primary)" }}>
                        <span>Time: {label}</span>
                        <span style={{ color: "var(--text-muted)" }}>IVP: {raw.ivp}%</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                            <div className="font-semibold mb-1 border-b pb-1" style={{ color: "var(--green)", borderColor: "var(--border-subtle)" }}>Bullish (Cr)</div>
                            <div className="flex justify-between gap-3 text-[10px]">
                                <span style={{ color: "var(--text-secondary)" }}>Long Buildup</span>
                                <span className="font-bold text-[11px]" style={{ color: "var(--green)" }}>{raw.LB.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-3 text-[10px] mt-0.5">
                                <span style={{ color: "var(--text-secondary)" }}>Short Cover</span>
                                <span className="font-bold text-[11px]" style={{ color: "var(--blue)" }}>{raw.SC.toFixed(2)}</span>
                            </div>
                        </div>
                        <div>
                            <div className="font-semibold mb-1 border-b pb-1 text-right" style={{ color: "var(--red)", borderColor: "var(--border-subtle)" }}>Bearish (Cr)</div>
                            <div className="flex justify-between gap-3 text-[10px]">
                                <span style={{ color: "var(--text-secondary)" }}>Short Buildup</span>
                                <span className="font-bold text-[11px]" style={{ color: "var(--red)" }}>{Math.abs(raw.SB).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-3 text-[10px] mt-0.5">
                                <span style={{ color: "var(--text-secondary)" }}>Long Unwind</span>
                                <span className="font-bold text-[11px]" style={{ color: "var(--yellow)" }}>{Math.abs(raw.LU).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-3 pt-2 flex flex-col gap-1 text-[11px] font-bold" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <div className="flex justify-between items-center text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
                            <span>Running Total</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span style={{ color: "var(--green)" }}>Total Bull:</span>
                            <span style={{ color: "var(--green)" }}>{raw.runningBull.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span style={{ color: "var(--red)" }}>Total Bear:</span>
                            <span style={{ color: "var(--red)" }}>{raw.runningBear.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="card p-5 mt-5">
            <div className="flex items-center gap-2 mb-5">
                <span className="section-title">Intraday Buildup History</span>
                <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
                {chartData.length > 0 && (
                    <div className="flex gap-3 text-[10px] uppercase font-bold tracking-wider pt-1">
                        <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                            <span className="w-2 h-2 rounded-sm" style={{ background: "var(--green)" }} /> LB
                        </span>
                        <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                            <span className="w-2 h-2 rounded-sm" style={{ background: "var(--blue)" }} /> SC
                        </span>
                        <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                            <span className="w-2 h-2 rounded-sm" style={{ background: "var(--red)" }} /> SB
                        </span>
                        <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                            <span className="w-2 h-2 rounded-sm" style={{ background: "var(--yellow)" }} /> LU
                        </span>
                    </div>
                )}
            </div>

            {chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="text-3xl opacity-20">📊</div>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>No Buildup History Found</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Chart will populate once market data starts flowing.</div>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                        <CartesianGrid
                            strokeDasharray="4 4"
                            stroke="var(--border-subtle)"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="time"
                            stroke="var(--text-muted)"
                            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--text-muted)" }}
                            axisLine={{ stroke: "var(--border-base)" }}
                            tickLine={false}
                            minTickGap={30}
                        />
                        <YAxis
                            yAxisId="left"
                            stroke="var(--text-muted)"
                            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--text-muted)" }}
                            axisLine={{ stroke: "var(--border-base)" }}
                            tickLine={false}
                            width={40}
                            tickFormatter={(v) => Math.abs(v).toString()}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke="var(--text-muted)"
                            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--text-muted)" }}
                            axisLine={{ stroke: "var(--border-base)" }}
                            tickLine={false}
                            width={40}
                        />

                        <Tooltip 
                            content={<CustomTooltip />} 
                            cursor={{ fill: "var(--bg-elevated)", opacity: 0.4 }} 
                        />
                        
                        {/* Bi-Directional Zero Line */}
                        <ReferenceLine y={0} yAxisId="left" stroke="var(--text-primary)" strokeOpacity={0.5} strokeWidth={1} />
                        
                        {/* Bullish Stack (Upwards) - Reduced Opacity */}
                        <Bar yAxisId="left" dataKey="LB" stackId="bull" fill="var(--green)" fillOpacity={0.5} stroke="var(--green)" strokeWidth={1} strokeOpacity={0.2} />
                        <Bar yAxisId="left" dataKey="SC" stackId="bull" fill="var(--blue)" fillOpacity={0.5} stroke="var(--blue)" strokeWidth={1} strokeOpacity={0.2} />
                        
                        {/* Bearish Stack (Downwards) - Reduced Opacity */}
                        <Bar yAxisId="left" dataKey="SB" stackId="bear" fill="var(--red)" fillOpacity={0.5} stroke="var(--red)" strokeWidth={1} strokeOpacity={0.2} />
                        <Bar yAxisId="left" dataKey="LU" stackId="bear" fill="var(--yellow)" fillOpacity={0.5} stroke="var(--yellow)" strokeWidth={1} strokeOpacity={0.2} />
                        
                        {/* Running Total Lines */}
                        <Line yAxisId="right" type="monotone" dataKey="runningBull" stroke="var(--green)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--green)" }} />
                        <Line yAxisId="right" type="monotone" dataKey="runningBear" stroke="var(--red)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--red)" }} />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}

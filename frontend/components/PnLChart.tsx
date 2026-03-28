"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Area,
    AreaChart,
} from "recharts";
import { Trade } from "@/lib/types";

interface Props {
    trades: Trade[];
}

export default function PnLChart({ trades }: Props) {
    let cumulative = 0;
    const data = trades
        .filter((t) => t.status === "CLOSED" || t.status === "SL_HIT")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((trade, index) => {
            cumulative += trade.totalPnL || 0;
            return {
                trade: index + 1,
                pnl: trade.totalPnL || 0,
                cumulative,
                date: new Date(trade.createdAt).toLocaleDateString("en-IN"),
                label: `${trade.direction} ${trade.strike}${trade.optionType}`,
            };
        });

    const maxPnL = Math.max(...data.map((d) => d.cumulative), 0);
    const minPnL = Math.min(...data.map((d) => d.cumulative), 0);
    const isPositive = data.length > 0 && data[data.length - 1]?.cumulative >= 0;

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            const pnlPos = d.cumulative >= 0;
            return (
                <div
                    style={{
                        background: "var(--bg-overlay)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "2px",
                        padding: "10px 14px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                >
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
                        Trade #{d.trade} · {d.date}
                    </div>
                    <div className="text-[11px] mb-1.5" style={{ color: "var(--text-primary)" }}>{d.label}</div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-6">
                            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>Trade P&L</span>
                            <span className="num text-[12px] font-bold" style={{ color: d.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                                {d.pnl >= 0 ? "+" : ""}₹{d.pnl.toLocaleString("en-IN")}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>Cumulative</span>
                            <span className="num text-[12px] font-bold" style={{ color: pnlPos ? "var(--blue)" : "var(--red)" }}>
                                ₹{d.cumulative.toLocaleString("en-IN")}
                            </span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-5">
                <span className="section-title">Cumulative P&L Curve</span>
                <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
                {data.length > 0 && (
                    <span
                        className="num text-[12px] font-bold"
                        style={{ color: isPositive ? "var(--green)" : "var(--red)" }}
                    >
                        {isPositive ? "+" : ""}₹{data[data.length - 1]?.cumulative.toLocaleString("en-IN")}
                    </span>
                )}
            </div>

            {data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="text-3xl opacity-20">◌</div>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>No closed trades</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Curve will render once trades are closed</div>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                        <defs>
                            <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={isPositive ? "#22D07A" : "#F04B4B"} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={isPositive ? "#22D07A" : "#F04B4B"} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="0"
                            stroke="var(--border-subtle)"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="trade"
                            stroke="var(--text-muted)"
                            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--text-muted)" }}
                            axisLine={{ stroke: "var(--border-base)" }}
                            tickLine={false}
                            label={{ value: "Trade #", position: "insideBottom", offset: -12, fill: "var(--text-muted)", fontSize: 10 }}
                        />
                        <YAxis
                            stroke="var(--text-muted)"
                            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--text-muted)" }}
                            axisLine={{ stroke: "var(--border-base)" }}
                            tickLine={false}
                            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                            width={52}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                        <ReferenceLine y={0} stroke="var(--red)" strokeDasharray="4 4" strokeOpacity={0.4} />
                        <Area
                            type="monotone"
                            dataKey="cumulative"
                            stroke={isPositive ? "var(--green)" : "var(--red)"}
                            strokeWidth={2}
                            fill="url(#pnlGrad)"
                            dot={(props: any) => {
                                const { cx, cy, payload } = props;
                                return (
                                    <circle
                                        key={`dot-${payload.trade}`}
                                        cx={cx}
                                        cy={cy}
                                        r={3}
                                        fill={payload.pnl >= 0 ? "var(--green)" : "var(--red)"}
                                        stroke="var(--bg-surface)"
                                        strokeWidth={1.5}
                                    />
                                );
                            }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
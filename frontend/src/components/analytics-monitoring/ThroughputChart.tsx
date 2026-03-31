import React from 'react';
import {
    AreaChart,
    Area,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

type ThroughputChartProps = {
    data: Array<{ time: string; assignments: number; exposures: number; conversions: number }>;
    tooltipStyles: React.CSSProperties;
};

export const ThroughputChart: React.FC<ThroughputChartProps> = ({ data, tooltipStyles }) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Experiment Throughput</h3>
                <span className="badge-gray">Assignments vs exposures</span>
            </div>
            <div className="mt-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
                        <XAxis
                            dataKey="time"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <Tooltip contentStyle={tooltipStyles} />
                        <Legend wrapperStyle={{ color: 'var(--chart-legend-text)', fontSize: 12 }} />
                        <Area
                            type="monotone"
                            dataKey="assignments"
                            stroke="#22c55e"
                            fill="#22c55e"
                            fillOpacity={0.06}
                            strokeWidth={1.5}
                            dot={false}
                        />
                        <Area
                            type="monotone"
                            dataKey="exposures"
                            stroke="#38bdf8"
                            fill="#38bdf8"
                            fillOpacity={0.06}
                            strokeWidth={1.5}
                            dot={false}
                        />
                        <Line type="monotone" dataKey="conversions" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

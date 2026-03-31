import React from 'react';
import {
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

type PrimaryMetricsChartProps = {
    data: Array<{ day: string; conversion: number; revenue: number; retention: number }>;
    tooltipStyles: React.CSSProperties;
};

export const PrimaryMetricsChart: React.FC<PrimaryMetricsChartProps> = ({ data, tooltipStyles }) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Primary Metrics Trend</h3>
                <span className="badge-gray">7-day performance</span>
            </div>
            <div className="mt-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
                        <XAxis
                            dataKey="day"
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
                        <Line type="monotone" dataKey="conversion" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="retention" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

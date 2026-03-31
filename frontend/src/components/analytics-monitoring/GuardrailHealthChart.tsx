import React from 'react';
import {
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts';

type GuardrailHealthChartProps = {
    data: Array<{ day: string; latency: number; errorRate: number; crashRate: number }>;
    tooltipStyles: React.CSSProperties;
};

export const GuardrailHealthChart: React.FC<GuardrailHealthChartProps> = ({ data, tooltipStyles }) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Guardrail Health</h3>
                <span className="badge-warning">2 breaches</span>
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
                        <ReferenceLine y={250} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
                        <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="errorRate" stroke="#f87171" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="crashRate" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

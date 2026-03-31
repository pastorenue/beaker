import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts';

type EffectSizeDatum = {
    name: string;
    effectSize: number;
    ciLower: number;
    ciUpper: number;
};

type EffectSizeChartProps = {
    data: EffectSizeDatum[];
    tooltipStyles: React.CSSProperties;
};

export const EffectSizeChart: React.FC<EffectSizeChartProps> = ({ data, tooltipStyles }) => {
    return (
        <div className="card">
            <h3 className="mb-4">Effect Size with Confidence Intervals</h3>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
                    <XAxis
                        dataKey="name"
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
                    <Legend wrapperStyle={{ color: '#e2e8f0', fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="rgba(71,85,105,0.5)" strokeDasharray="3 3" />
                    <Line
                        type="monotone"
                        dataKey="ciLower"
                        stroke="#475569"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                        name="Lower CI"
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="effectSize"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        name="Effect Size"
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="ciUpper"
                        stroke="#475569"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                        name="Upper CI"
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

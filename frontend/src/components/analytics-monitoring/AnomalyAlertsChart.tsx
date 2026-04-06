import React from 'react';
import {
    BarChart,
    Bar,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

type AnomalyAlertsChartProps = {
    data: Array<{ day: string; critical: number; warning: number; info: number }>;
    tooltipStyles: React.CSSProperties;
};

export const AnomalyAlertsChart: React.FC<AnomalyAlertsChartProps> = ({ data, tooltipStyles }) => {
    const total = data.reduce((sum, d) => sum + d.critical + d.warning + d.info, 0);
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Anomaly Alerts</h3>
                <span className={total > 0 ? 'badge-warning' : 'badge-gray'}>
                    {total} {total === 1 ? 'alert' : 'alerts'} · 7 days
                </span>
            </div>
            <div className="mt-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
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
                        <Bar dataKey="critical" stackId="a" fill="#f87171" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="warning" stackId="a" fill="#fbbf24" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="info" stackId="a" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

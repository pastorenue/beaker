import React from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type ExposureFunnelCardProps = {
    data: Array<{ step: string; users: number }>;
    tooltipStyles: React.CSSProperties;
};

export const ExposureFunnelCard: React.FC<ExposureFunnelCardProps> = ({ data, tooltipStyles }) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Exposure Funnel</h3>
                <span className="badge-gray">Last 24h</span>
            </div>
            <div className="mt-4 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                        <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.07)" />
                        <XAxis
                            type="number"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <YAxis
                            dataKey="step"
                            type="category"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            width={110}
                        />
                        <Tooltip contentStyle={tooltipStyles} />
                        <Bar dataKey="users" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

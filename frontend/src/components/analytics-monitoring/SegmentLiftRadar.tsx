import React from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer } from 'recharts';

type SegmentLiftRadarProps = {
    data: Array<{ segment: string; lift: number }>;
    tooltipStyles: React.CSSProperties;
};

export const SegmentLiftRadar: React.FC<SegmentLiftRadarProps> = ({ data, tooltipStyles }) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Segment Lift Radar</h3>
                <span className="badge-gray">Relative uplift %</span>
            </div>
            <div className="mt-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={data}>
                        <PolarGrid stroke="rgba(148,163,184,0.1)" />
                        <PolarAngleAxis dataKey="segment" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <PolarRadiusAxis tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} />
                        <Radar dataKey="lift" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.1} strokeWidth={1.5} />
                        <Tooltip contentStyle={tooltipStyles} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type CoverageSlice = { name: string; value: number; color: string };

type MetricCoverageTotals = {
    total_metrics?: number;
    guardrails?: number;
    diagnostics?: number;
    holdout_metrics?: number;
};

type MetricCoverageCardProps = {
    slices: CoverageSlice[];
    totals?: MetricCoverageTotals;
    tooltipStyles: React.CSSProperties;
};

export const MetricCoverageCard: React.FC<MetricCoverageCardProps> = ({
    slices,
    totals,
    tooltipStyles,
}) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Metric Coverage</h3>
                <span className="badge-gray">Tracked metrics</span>
            </div>
            <div className="mt-4 h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={slices}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={58}
                            outerRadius={86}
                            paddingAngle={3}
                            strokeWidth={0}
                        >
                            {slices.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyles} />
                        <Legend
                            wrapperStyle={{ color: 'var(--chart-legend-text)', fontSize: 12 }}
                            iconSize={8}
                            iconType="circle"
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="insights-tile flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
                    <span className="text-slate-400">Total metrics</span>
                    <span className="font-semibold text-slate-100">{totals?.total_metrics ?? 0}</span>
                </div>
                <div className="insights-tile flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
                    <span className="text-slate-400">Guardrails</span>
                    <span className="font-semibold text-slate-100">{totals?.guardrails ?? 0}</span>
                </div>
                <div className="insights-tile flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
                    <span className="text-slate-400">Diagnostics</span>
                    <span className="font-semibold text-slate-100">{totals?.diagnostics ?? 0}</span>
                </div>
                <div className="insights-tile flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
                    <span className="text-slate-400">Holdout metrics</span>
                    <span className="font-semibold text-slate-100">{totals?.holdout_metrics ?? 0}</span>
                </div>
            </div>
        </div>
    );
};

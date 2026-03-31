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

type SrmSummary = {
    p_value?: number;
    allocation_drift: number;
};

type SrmCardProps = {
    variants: Array<{ variant: string; expected: number; observed: number }>;
    summary?: SrmSummary;
    tooltipStyles: React.CSSProperties;
};

export const SrmCard: React.FC<SrmCardProps> = ({ variants, summary, tooltipStyles }) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Sample Ratio Mismatch (SRM)</h3>
                <span className="badge-danger">1 active alert</span>
            </div>
            <div className="mt-4 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={variants} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
                        <XAxis
                            dataKey="variant"
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
                        <Bar dataKey="expected" fill="#38bdf8" name="Expected %" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="observed" fill="#f59e0b" name="Observed %" radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="insights-tile rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
                    <p className="text-slate-400">p-value</p>
                    <p className="text-lg font-semibold text-rose-300">{summary?.p_value?.toFixed(3) ?? '—'}</p>
                </div>
                <div className="insights-tile rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
                    <p className="text-slate-400">Allocation drift</p>
                    <p className="text-lg font-semibold text-amber-200">
                        {summary ? `${summary.allocation_drift.toFixed(2)}%` : '—'}
                    </p>
                </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-sm text-slate-300">
                <span className="text-xs text-slate-400">AI Note</span>
                <p className="mt-2">
                    {summary?.p_value !== undefined && summary.p_value < 0.05
                        ? 'SRM is significant. Validate assignment hashing, gate rules, and traffic splits before scaling.'
                        : 'SRM within tolerance. Continue monitoring allocation drift as traffic ramps.'}
                </p>
            </div>
        </div>
    );
};

import React from 'react';

type MetricsSummaryRow = {
    id: string;
    label: string;
    groupName: string;
    experimentName: string;
    baseline: { rate: number; assign: number; conv: number };
    variation: { rate: number; assign: number; conv: number };
    lift: number;
    chanceToWin: number;
    pValue: number;
};

type MetricsTableProps = {
    rows: MetricsSummaryRow[];
    hasMultipleExperiments?: boolean;
};

const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;
const formatCount = (conv: number, assign: number) => `${conv.toLocaleString()} / ${assign.toLocaleString() || '0'}`;

const Violin: React.FC<{ id: string; percent: number }> = ({ id, percent }) => {
    const clamped = Math.max(0, Math.min(100, percent));
    const padding = 12;
    const width = 200 - padding * 2;
    const markerX = padding + (clamped / 100) * width;
    return (
        <svg width={200} height={64} viewBox="0 0 200 64" className="text-slate-300">
            <defs>
                <linearGradient id={`violin-${id}`} x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#cbd5e1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0.9" />
                </linearGradient>
            </defs>
            <path
                d="M12 32 C 44 4 156 4 188 32 C 156 60 44 60 12 32 Z"
                fill={`url(#violin-${id})`}
                stroke="rgba(148, 163, 184, 0.6)"
                strokeWidth="1.2"
                opacity="0.95"
            />
            <line x1={markerX} x2={markerX} y1={8} y2={56} stroke="#e2e8f0" strokeWidth="2" />
            <circle cx={markerX} cy={32} r={5} fill="#e2e8f0" />
            <g fontSize="10" fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                <text x="6" y="60">0</text>
                <text x="48" y="60">25</text>
                <text x="96" y="60">50</text>
                <text x="144" y="60">75</text>
                <text x="180" y="60">100</text>
            </g>
        </svg>
    );
};

export const MetricsTable: React.FC<MetricsTableProps> = ({ rows, hasMultipleExperiments }) => {
    if (!rows.length) {
        return (
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-4 text-sm text-slate-400">
                Add a metric and connect it to Run to view lift by variant.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-800/70 bg-slate-950/60">
            <table className="min-w-full text-sm text-slate-200">
                <thead className="bg-slate-900/60 text-xs text-slate-500">
                    <tr>
                        <th className="px-4 py-3 text-left">Metric</th>
                        <th className="px-4 py-3 text-left">Group</th>
                        {hasMultipleExperiments && <th className="px-4 py-3 text-left">Experiment</th>}
                        <th className="px-4 py-3 text-left">Baseline</th>
                        <th className="px-4 py-3 text-left">Variation</th>
                        <th className="px-4 py-3 text-left">Chance to Win</th>
                        <th className="px-4 py-3 text-left">p-value</th>
                        <th className="px-4 py-3 text-left">% Change</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const positive = row.lift >= 0;
                        const markerPos = 50 + Math.max(-50, Math.min(50, row.lift * 100)); // clamp -50%..+50%
                        return (
                            <tr key={row.id} className="border-t border-slate-800/70">
                                <td className="px-4 py-3 font-semibold text-slate-100">{row.label}</td>
                                <td className="px-4 py-3 text-slate-300">{row.groupName}</td>
                                {hasMultipleExperiments && <td className="px-4 py-3 text-slate-400">{row.experimentName}</td>}
                                <td className="px-4 py-3">
                                    <div className="text-slate-100">{formatRate(row.baseline.rate)}</div>
                                    <div className="text-xs text-slate-500">{formatCount(row.baseline.conv, row.baseline.assign)}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="text-slate-100">{formatRate(row.variation.rate)}</div>
                                    <div className="text-xs text-slate-500">{formatCount(row.variation.conv, row.variation.assign)}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="relative h-2 w-24 overflow-hidden rounded-full bg-slate-800/80">
                                            <div
                                                className="absolute inset-y-0 bg-emerald-500/70"
                                                style={{ width: `${(row.chanceToWin * 100).toFixed(0)}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-slate-200">{formatPct(row.chanceToWin)}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-slate-200">p = {row.pValue.toFixed(4)}</span>
                                        <Violin id={row.id} percent={row.pValue * 100} />
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className={positive ? 'text-emerald-300' : 'text-rose-300'}>
                                            {positive ? '↑' : '↓'} {formatPct(row.lift)}
                                        </span>
                                        <div className="relative h-3 w-28 overflow-hidden rounded-full">
                                            <div className="absolute inset-0 bg-gradient-to-r from-rose-400/30 via-slate-700/20 to-emerald-400/30"></div>
                                            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-600"></div>
                                            <div
                                                className={`absolute top-0.5 h-2 w-3 rounded-full ${positive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                                style={{ left: `${markerPos}%`, transform: 'translateX(-50%)' }}
                                            ></div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

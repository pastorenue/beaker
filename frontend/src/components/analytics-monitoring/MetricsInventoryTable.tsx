import React from 'react';

type MetricRow = {
    name: string;
    guardrail?: string;
    category: string;
    freshness_seconds: number;
    owner: string;
    status: string;
};

type MetricsInventoryTableProps = {
    metrics: MetricRow[];
    formatSeconds: (value: number) => string;
    statusBadge: (status: string) => string;
};

export const MetricsInventoryTable: React.FC<MetricsInventoryTableProps> = ({
    metrics,
    formatSeconds,
    statusBadge,
}) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Metrics Inventory</h3>
                <span className="badge-gray">Tracking + guardrails</span>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/70">
                <div className="grid grid-cols-[1.4fr_0.8fr_0.6fr_0.6fr_0.7fr] gap-3 bg-slate-950/60 px-4 py-3 text-xs font-semibold text-slate-400">
                    <span>Metric</span>
                    <span>Category</span>
                    <span>Freshness</span>
                    <span>Owner</span>
                    <span>Status</span>
                </div>
                <div className="divide-y divide-slate-800/70">
                    {metrics.map((metric) => (
                        <div
                            key={metric.name}
                            className="grid grid-cols-[1.4fr_0.8fr_0.6fr_0.6fr_0.7fr] gap-3 px-4 py-3 text-sm text-slate-200"
                        >
                            <div>
                                <div className="font-semibold text-slate-100">{metric.name}</div>
                                <div className="text-xs text-slate-500">Guardrail: {metric.guardrail ?? '—'}</div>
                            </div>
                            <span className="text-slate-300">{metric.category}</span>
                            <span className="text-slate-300">{formatSeconds(metric.freshness_seconds)}</span>
                            <span className="text-slate-300">{metric.owner}</span>
                            <span className={statusBadge(metric.status)}>{metric.status}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

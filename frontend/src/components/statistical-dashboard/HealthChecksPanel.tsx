import React from 'react';
import type { ExperimentAnalysis } from '../../types';

type HealthChecksPanelProps = {
    checks: ExperimentAnalysis['health_checks'];
    formatNumber: (value: number | null | undefined, decimals?: number, suffix?: string) => string;
};

export const HealthChecksPanel: React.FC<HealthChecksPanelProps> = ({ checks, formatNumber }) => {
    if (!checks || checks.length === 0) return null;

    return (
        <div className="card">
            <h3 className="mb-4">Health Checks</h3>
            <div className="space-y-3">
                {checks.map((check, idx) => (
                    <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl bg-slate-950/50 px-4 py-3"
                    >
                        <div>
                            <p className="text-sm font-semibold text-slate-100">{check.metric_name}</p>
                            <p className="text-xs text-slate-500">
                                {check.direction} {check.min ?? '—'} {check.max !== undefined ? `→ ${check.max}` : ''}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-300">
                                {check.current_value !== undefined && check.current_value !== null
                                    ? formatNumber(check.current_value, 3)
                                    : '—'}
                            </p>
                            <span className={`badge ${check.is_passing ? 'badge-success' : 'badge-danger'}`}>
                                {check.is_passing ? 'Pass' : 'Fail'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

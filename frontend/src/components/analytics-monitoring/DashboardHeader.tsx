import React from 'react';

type DashboardHeaderProps = {
    environment?: string;
    lastUpdated?: string;
    dataFreshnessSeconds?: number;
    streamingStatus: string;
    formatSeconds: (value: number) => string;
};

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    environment,
    lastUpdated,
    dataFreshnessSeconds,
    streamingStatus,
    formatSeconds,
}) => {
    return (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h2 className="text-3xl font-medium text-slate-100">Insights</h2>
                <p className="mt-1 text-slate-400">
                    Live experiment observability, guardrails, and metric health across your platform.
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <span className="badge-info">Environment: {environment ?? '—'}</span>
                <span className="badge-gray">
                    Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}
                </span>
                <span className="badge-gray">
                    Freshness: {dataFreshnessSeconds !== undefined ? formatSeconds(dataFreshnessSeconds) : '—'}
                </span>
                <span className="badge-success">Streaming: {streamingStatus}</span>
            </div>
        </div>
    );
};

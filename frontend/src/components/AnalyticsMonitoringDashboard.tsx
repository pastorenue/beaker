import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../services/api';
import { LoadingSpinner } from './Common';
import { useAccount } from '../contexts/AccountContext';
import { AlertFeedPanel } from './analytics-monitoring/AlertFeedPanel';
import { AnomalyAlertsChart } from './analytics-monitoring/AnomalyAlertsChart';
import { DashboardHeader } from './analytics-monitoring/DashboardHeader';
import { ExposureFunnelCard } from './analytics-monitoring/ExposureFunnelCard';
import { GuardrailHealthChart } from './analytics-monitoring/GuardrailHealthChart';
import { MetricCoverageCard } from './analytics-monitoring/MetricCoverageCard';
import { MetricsInventoryTable } from './analytics-monitoring/MetricsInventoryTable';
import { OverviewStats } from './analytics-monitoring/OverviewStats';
import { PrimaryMetricsChart } from './analytics-monitoring/PrimaryMetricsChart';
import { SegmentLiftRadar } from './analytics-monitoring/SegmentLiftRadar';
import { SrmCard } from './analytics-monitoring/SrmCard';
import { ThroughputChart } from './analytics-monitoring/ThroughputChart';

const tooltipStyles = {
    backgroundColor: 'var(--chart-tooltip-bg)',
    border: '1px solid var(--chart-tooltip-border)',
    borderRadius: '12px',
    color: 'var(--chart-tooltip-text)',
};

const coverageColors: Record<string, string> = {
    Primary: '#38bdf8',
    Guardrail: '#f59e0b',
    Diagnostic: '#94a3b8',
    'Feature Impact': '#22c55e',
};

const statusBadge = (status: string) => {
    switch (status) {
        case 'Healthy':
            return 'badge-success';
        case 'Degraded':
            return 'badge-warning';
        case 'Delayed':
            return 'badge-danger';
        default:
            return 'badge-gray';
    }
};

const severityBadge = (severity: string) => {
    switch (severity) {
        case 'critical':
            return 'badge-danger';
        case 'warning':
            return 'badge-warning';
        default:
            return 'badge-info';
    }
};

export const AnalyticsMonitoringDashboard: React.FC = () => {
    const { activeAccountId } = useAccount();
    const { data, isLoading } = useQuery({
        queryKey: ['analytics-overview', activeAccountId],
        queryFn: async () => {
            const response = await analyticsApi.getOverview();
            return response.data;
        },
        enabled: !!activeAccountId,
        refetchInterval: 5000,
    });

    const formatCompact = (value: number) =>
        new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    const formatPercent = React.useCallback((value: number, decimals = 2) => `${value.toFixed(decimals)}%`, []);
    const formatPp = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}pp`;
    const formatSeconds = (value: number) => {
        if (value < 60) return `${value}s`;
        if (value < 3600) return `${Math.round(value / 60)}m`;
        return `${Math.round(value / 3600)}h`;
    };

    const summary = data?.summary;
    const coverageSlices =
        data?.metric_coverage?.map((slice) => ({
            ...slice,
            color: coverageColors[slice.name] ?? '#64748b',
        })) ?? [
            { name: 'Primary', value: 0, color: coverageColors.Primary },
            { name: 'Guardrail', value: 0, color: coverageColors.Guardrail },
            { name: 'Diagnostic', value: 0, color: coverageColors.Diagnostic },
            { name: 'Feature Impact', value: 0, color: coverageColors['Feature Impact'] },
        ];

    const guardrailData = (data?.guardrail_health ?? []).map((point) => ({
        day: point.day,
        latency: point.latency,
        errorRate: point.error_rate,
        crashRate: point.crash_rate,
    }));

    const alertTriage = React.useMemo(() => {
        const alerts = data?.alert_feed ?? [];
        const counts = alerts.reduce(
            (acc, alert) => {
                acc[alert.severity] = (acc[alert.severity] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        const recommendations: string[] = [];
        if ((counts.critical ?? 0) > 0) {
            recommendations.push('Pause or throttle exposure for impacted experiments until guardrails stabilize.');
        }
        if (data?.srm?.summary?.p_value !== undefined && data.srm.summary.p_value < 0.05) {
            recommendations.push('Investigate SRM: verify assignment logic and allocation integrity.');
        }
        if (data?.system_health?.sdk_error_rate !== undefined && data.system_health.sdk_error_rate > 0.02) {
            recommendations.push(`SDK error rate elevated (${formatPercent(data.system_health.sdk_error_rate, 2)}). Check client SDK versions.`);
        }

        if (recommendations.length === 0) {
            recommendations.push('No critical risks detected. Continue monitoring live metrics.');
        }

        return { counts, recommendations };
    }, [data, formatPercent]);

    if (isLoading && !data) {
        return <LoadingSpinner fullHeight />;
    }

    const trendFor = (value?: number) => {
        if (value === undefined || Number.isNaN(value)) return 'neutral' as const;
        if (value > 0) return 'up' as const;
        if (value < 0) return 'down' as const;
        return 'neutral' as const;
    };

    const overviewStats: Array<{
        title: string;
        value: string | number;
        subtitle?: string;
        trend?: 'up' | 'down' | 'neutral';
        icon?: React.ReactNode;
    }> = [
            {
                title: 'Active Experiments',
                value: summary ? formatCompact(summary.active_experiments) : '—',
                subtitle: summary ? `${summary.active_experiments_delta >= 0 ? '+' : ''}${summary.active_experiments_delta} launched today` : '—',
                trend: trendFor(summary?.active_experiments_delta),
                icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 18V6m5 12V9m5 9V7m5 11V11" />
                    </svg>
                ),
            },
            {
                title: 'Daily Exposures',
                value: summary ? formatCompact(summary.daily_exposures) : '—',
                subtitle: summary ? `${summary.exposures_delta_percent >= 0 ? '+' : ''}${summary.exposures_delta_percent.toFixed(1)}% vs prior` : '—',
                trend: trendFor(summary?.exposures_delta_percent),
                icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h5l4 6 6-14 3 4" />
                    </svg>
                ),
            },
            {
                title: 'Primary Conversion',
                value: summary ? formatPercent(summary.primary_conversion_rate * 100, 2) : '—',
                subtitle: summary ? `${formatPp(summary.primary_conversion_delta_pp)} lift` : '—',
                trend: trendFor(summary?.primary_conversion_delta_pp),
                icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                    </svg>
                ),
            },
            {
                title: 'Guardrail Breaches',
                value: summary ? summary.guardrail_breaches.toString() : '—',
                subtitle: summary ? summary.guardrail_breaches_detail : '—',
                trend: summary ? (summary.guardrail_breaches === 0 ? 'up' : 'down') : 'neutral',
                icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M4.93 4.93 19.07 19.07M7.05 16.95 16.95 7.05" />
                    </svg>
                ),
            },
        ];

    return (
        <div className="space-y-6 animate-fade-in">
            <DashboardHeader
                environment={summary?.environment}
                lastUpdated={summary?.last_updated}
                dataFreshnessSeconds={summary?.data_freshness_seconds}
                streamingStatus={summary ? 'Healthy' : 'Loading'}
                formatSeconds={formatSeconds}
            />

            <OverviewStats stats={overviewStats} />

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <ThroughputChart data={data?.throughput ?? []} tooltipStyles={tooltipStyles} />

                <MetricCoverageCard
                    slices={coverageSlices}
                    totals={data?.metric_coverage_totals}
                    tooltipStyles={tooltipStyles}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <PrimaryMetricsChart data={data?.primary_metric_trend ?? []} tooltipStyles={tooltipStyles} />

                <GuardrailHealthChart data={guardrailData} tooltipStyles={tooltipStyles} breaches={data?.summary?.guardrail_breaches ?? 0} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <SrmCard variants={data?.srm?.variants ?? []} summary={data?.srm?.summary} tooltipStyles={tooltipStyles} />

                <ExposureFunnelCard data={data?.funnel ?? []} tooltipStyles={tooltipStyles} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <AnomalyAlertsChart data={data?.anomaly_alerts ?? []} tooltipStyles={tooltipStyles} />

                <SegmentLiftRadar data={data?.segment_lift ?? []} tooltipStyles={tooltipStyles} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
                <MetricsInventoryTable
                    metrics={data?.metric_inventory ?? []}
                    formatSeconds={formatSeconds}
                    statusBadge={statusBadge}
                />

                <AlertFeedPanel
                    alertTriage={alertTriage}
                    alertFeed={data?.alert_feed ?? []}
                    systemHealth={data?.system_health}
                    severityBadge={severityBadge}
                    formatSeconds={formatSeconds}
                    formatPercent={formatPercent}
                />
            </div>
        </div>
    );
};

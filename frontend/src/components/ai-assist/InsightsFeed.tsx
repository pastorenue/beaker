import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { aiInsightsApi } from '../../services/api';
import type { AiPollingInsight } from '../../types';

const SEVERITY_STYLES: Record<string, { badge: string; border: string }> = {
    critical: { badge: 'bg-red-900/60 text-red-300', border: 'border-l-4 border-red-600' },
    warning: { badge: 'bg-yellow-900/60 text-yellow-300', border: 'border-l-4 border-yellow-600' },
    info: { badge: 'bg-blue-900/60 text-blue-300', border: 'border-l-4 border-blue-600' },
};

const INSIGHT_ICON: Record<string, string> = {
    regression: '↘',
    winner: '★',
    srm: '⚠',
    guardrail: '⛔',
    progress: '→',
};

export function InsightCard({
    insight,
    onDismiss,
}: {
    insight: AiPollingInsight;
    onDismiss: (id: string) => void;
}) {
    const styles = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info;
    const icon = INSIGHT_ICON[insight.insight_type] ?? '•';

    return (
        <div className={`card py-3 px-4 ${styles.border}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg leading-none shrink-0">{icon}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${styles.badge}`}>
                        {insight.severity}
                    </span>
                    <p className="text-sm font-medium truncate">{insight.headline}</p>
                </div>
                <button
                    onClick={() => onDismiss(insight.id)}
                    className="text-xs text-slate-500 hover:text-slate-300 shrink-0"
                    title="Dismiss"
                >
                    ✕
                </button>
            </div>

            {insight.ai_narrative && (
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">{insight.ai_narrative}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {insight.effect_size != null && (
                    <span>Effect: {insight.effect_size.toFixed(4)}</span>
                )}
                {insight.p_value != null && (
                    <span>p={insight.p_value.toFixed(4)}</span>
                )}
                {insight.sample_size != null && (
                    <span>n={insight.sample_size.toLocaleString()}</span>
                )}
                {insight.auto_actioned && (
                    <span className="text-orange-400">Auto-stopped</span>
                )}
                <Link
                    to={`/experiments/${insight.experiment_id}`}
                    className="text-cyan-400 hover:text-slate-300 ml-auto"
                >
                    View experiment →
                </Link>
            </div>
        </div>
    );
}

export const InsightsFeed: React.FC = () => {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['ai-insights'],
        queryFn: async () => (await aiInsightsApi.list({ limit: 20 })).data,
        refetchInterval: 60_000,
    });

    const { data: summary } = useQuery({
        queryKey: ['ai-insights-summary'],
        queryFn: async () => (await aiInsightsApi.summary()).data,
        refetchInterval: 60_000,
    });

    const dismissMutation = useMutation({
        mutationFn: (id: string) => aiInsightsApi.dismiss(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
            queryClient.invalidateQueries({ queryKey: ['ai-insights-summary'] });
        },
    });

    const insights = data?.insights ?? [];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">AI Insights</h3>
                {summary && summary.total > 0 && (
                    <div className="flex gap-2 text-xs">
                        {summary.critical > 0 && (
                            <span className="px-2 py-0.5 rounded bg-red-900/60 text-red-300">
                                {summary.critical} critical
                            </span>
                        )}
                        {summary.warning > 0 && (
                            <span className="px-2 py-0.5 rounded bg-yellow-900/60 text-yellow-300">
                                {summary.warning} warning
                            </span>
                        )}
                        {summary.info > 0 && (
                            <span className="px-2 py-0.5 rounded bg-blue-900/60 text-blue-300">
                                {summary.info} info
                            </span>
                        )}
                    </div>
                )}
            </div>

            {isLoading && (
                <p className="text-xs text-slate-500">Loading insights…</p>
            )}

            {!isLoading && insights.length === 0 && (
                <p className="text-xs text-slate-500">
                    No active insights. The AI polling service checks running experiments every{' '}
                    <span className="text-slate-400">15 minutes</span>.
                </p>
            )}

            <div className="space-y-2">
                {insights.map((insight) => (
                    <InsightCard
                        key={insight.id}
                        insight={insight}
                        onDismiss={(id) => dismissMutation.mutate(id)}
                    />
                ))}
            </div>
        </div>
    );
};

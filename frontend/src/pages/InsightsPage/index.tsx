import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiInsightsApi, experimentApi } from '../../services/api';
import { InsightCard } from '../../components/ai-assist/InsightsFeed';
import { FacetSearchBar, type FacetDef, type ActiveFilter } from '../../components/FacetSearchBar';
import { LoadingSpinner } from '../../components/Common';
import { useAccount } from '../../contexts/AccountContext';
import type { InsightsSummaryResponse } from '../../types';

// ─── constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const FACETS: FacetDef[] = [
    { key: 'severity',   label: 'Severity',   placeholder: 'critical, warning, info' },
    { key: 'experiment', label: 'Experiment',  placeholder: 'experiment name'         },
];

// ─── SummaryBar ───────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: InsightsSummaryResponse | undefined }) {
    if (!summary || summary.total === 0) return null;
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">
                {summary.total} insight{summary.total !== 1 ? 's' : ''}
            </span>
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
        </div>
    );
}

// ─── main page ────────────────────────────────────────────────────────────────

export const InsightsPage: React.FC = () => {
    const { activeAccountId } = useAccount();
    const queryClient = useQueryClient();

    const [activeFilters, setActiveFilters] = React.useState<ActiveFilter[]>([]);
    const [page, setPage] = React.useState(0);

    React.useEffect(() => { setPage(0); }, [activeFilters]);

    const severityFilter  = activeFilters.find(f => f.facet === 'severity')?.value;
    const experimentName  = activeFilters.find(f => f.facet === 'experiment')?.value;

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments'],
        queryFn: () => experimentApi.list().then(r => r.data),
    });

    const experimentId = experiments.find(e => e.name === experimentName)?.id;

    const { data: summary } = useQuery({
        queryKey: ['ai-insights-summary'],
        queryFn: async () => (await aiInsightsApi.summary()).data,
        refetchInterval: 60_000,
    });

    const { data, isLoading } = useQuery({
        queryKey: ['ai-insights', activeAccountId, severityFilter, experimentId, page],
        queryFn: async () => (await aiInsightsApi.list({
            severity: severityFilter,
            experiment_id: experimentId,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
        })).data,
        refetchInterval: 60_000,
        enabled: !!activeAccountId,
    });

    const dismissMutation = useMutation({
        mutationFn: (id: string) => aiInsightsApi.dismiss(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
            queryClient.invalidateQueries({ queryKey: ['ai-insights-summary'] });
        },
    });

    const insights = data?.insights ?? [];
    const total    = data?.total ?? 0;
    const pageCount = Math.ceil(total / PAGE_SIZE);

    const valueSuggestions = React.useMemo(() => ({
        severity:   ['critical', 'warning', 'info'],
        experiment: experiments.map(e => e.name),
    }), [experiments]);

    const addFilter = React.useCallback((facet: string, value: string) => {
        setActiveFilters(prev => [...prev.filter(f => f.facet !== facet), { facet, value }]);
    }, []);

    const removeFilter = React.useCallback((facet: string) => {
        setActiveFilters(prev => prev.filter(f => f.facet !== facet));
    }, []);

    const clearAllFilters = React.useCallback(() => setActiveFilters([]), []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-medium text-slate-100">AI Insights</h2>
                <p className="mt-1 text-slate-400">
                    AI-generated insights from running experiments, updated every 15 minutes.
                </p>
            </div>

            <SummaryBar summary={summary} />

            {/* Filter bar */}
            <FacetSearchBar
                facets={FACETS}
                activeFilters={activeFilters}
                onAdd={addFilter}
                onRemove={removeFilter}
                onClearAll={clearAllFilters}
                suggestions={valueSuggestions}
                placeholder="Filter by severity or experiment…"
            />

            {/* Content */}
            {isLoading ? (
                <LoadingSpinner />
            ) : insights.length === 0 ? (
                <p className="text-sm text-slate-500">
                    No active insights. The AI polling service checks running experiments every{' '}
                    <span className="text-slate-400">15 minutes</span>.
                </p>
            ) : (
                <>
                    <div className="space-y-2">
                        {insights.map(insight => (
                            <InsightCard
                                key={insight.id}
                                insight={insight}
                                onDismiss={(id) => dismissMutation.mutate(id)}
                            />
                        ))}
                    </div>

                    {pageCount > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
                            <span className="text-xs text-slate-500">
                                Page {page + 1} of {pageCount} ({total.toLocaleString()} total)
                            </span>
                            <div className="flex gap-2">
                                <button
                                    disabled={page === 0}
                                    onClick={() => setPage(p => Math.max(0, p - 1))}
                                    className="btn-secondary text-xs disabled:opacity-40"
                                >
                                    Prev
                                </button>
                                <button
                                    disabled={page >= pageCount - 1}
                                    onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                                    className="btn-secondary text-xs disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default InsightsPage;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { SignificanceIndicator } from '../Common';
import { aiApi } from '../../services/api';
import type { ExperimentAnalysis } from '../../types';

type DisplayResult = {
    variant_a: string;
    variant_b: string;
    mean_a: number;
    mean_b: number;
    effect_size: number;
    p_value: number;
    bayes_probability?: number;
    e_value?: number;
    sequential_threshold?: number;
    confidence_interval_lower: number;
    confidence_interval_upper: number;
    test_type: string;
    sample_size_a?: number;
    sample_size_b?: number;
    n_matched_users_a?: number;
    n_matched_users_b?: number;
    variance_reduction?: number;
    metric_name?: string;
};

type StatisticalResultsCardProps = {
    results: DisplayResult[];
    analysis: ExperimentAnalysis;
    formatNumber: (value: number | null | undefined, decimals?: number, suffix?: string) => string;
    formatPercent: (value: number | null | undefined, decimals?: number) => string;
};

function buildInsightPrompt(analysis: ExperimentAnalysis): string {
    const { experiment, results, sample_sizes, health_checks } = analysis;

    const sampleProgress = sample_sizes.length
        ? sample_sizes.reduce((sum, s) => sum + Math.min(1, s.current_size / s.required_size), 0) /
          sample_sizes.length
        : 0;

    const resultLines = results
        .map((r) => {
            const sig =
                r.bayes_probability !== undefined
                    ? `posterior=${r.bayes_probability.toFixed(3)}`
                    : `p=${r.p_value.toFixed(4)}`;
            return `  - ${r.metric_name}: effect=${(r.effect_size * 100).toFixed(2)}%, ${sig}, significant=${r.is_significant}, n_control=${r.sample_size_a}, n_treatment=${r.sample_size_b}`;
        })
        .join('\n');

    const failingChecks = health_checks.filter((c) => !c.is_passing);

    return `Experiment: "${experiment.name}"
Status: ${experiment.status}
Analysis engine: ${experiment.analysis_engine}
Sample progress: ${(sampleProgress * 100).toFixed(0)}%

Results:
${resultLines || '  No data recorded yet'}

Health checks: ${health_checks.length} total, ${failingChecks.length} failing${
        failingChecks.length ? ' (' + failingChecks.map((c) => c.metric_name).join(', ') + ')' : ''
    }`;
}

export const StatisticalResultsCard: React.FC<StatisticalResultsCardProps> = ({
    results,
    analysis,
    formatNumber,
    formatPercent,
}) => {
    const [insightContent, setInsightContent] = useState('');
    const [isLoadingInsight, setIsLoadingInsight] = useState(false);
    const [insightError, setInsightError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchInsights = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoadingInsight(true);
        setInsightContent('');
        setInsightError(null);

        try {
            const response = await aiApi.chat({
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are an expert A/B testing analyst. Given experiment data, provide 2-4 concise, actionable insights. Be accurate about the experiment state — if it has not started, say so clearly and give pre-launch advice. If data is insufficient, say that. Use bullet points and short paragraphs. Keep the response under 150 words.',
                    },
                    {
                        role: 'user',
                        content: buildInsightPrompt(analysis),
                    },
                ],
                temperature: 0.3,
                max_tokens: 512,
            });

            if (!controller.signal.aborted) {
                setInsightContent(response.data.message.content);
            }
        } catch {
            if (!controller.signal.aborted) {
                setInsightError('Failed to generate insights — check AI service configuration.');
            }
        } finally {
            if (!controller.signal.aborted) {
                setIsLoadingInsight(false);
            }
        }
    }, [analysis]);

    const analysisKey = `${analysis.experiment.id}-${analysis.experiment.status}-${analysis.results.length}`;
    useEffect(() => {
        fetchInsights();
        return () => abortRef.current?.abort();
    }, [analysisKey]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="card mt-6">
            <h3 className="text-xl mb-4">Statistical Analysis</h3>
            <div className="space-y-6">
                {results.map((result, idx) => (
                    <div key={idx} className="border-b border-slate-800/70 pb-6 last:border-0">
                        <div className="mb-3 flex items-center justify-between">
                            <SignificanceIndicator
                                pValue={result.p_value}
                                bayesProbability={result.bayes_probability}
                                eValue={result.e_value}
                                sequentialThreshold={result.sequential_threshold}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg">
                            <div>
                                <p className="text-xs text-slate-500 mb-0.5">{result.variant_a} (Control)</p>
                                <p className="text-lg font-semibold text-slate-100">{formatNumber(result.mean_a, 3)}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {result.variance_reduction
                                        ? <span className="text-indigo-300">Using Adjusted Mean</span>
                                        : `n = ${(result.n_matched_users_a ?? result.sample_size_a)?.toLocaleString()}`}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-0.5">{result.variant_b} (Treatment)</p>
                                <p className="text-lg font-semibold text-slate-100">{formatNumber(result.mean_b, 3)}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {result.variance_reduction
                                        ? <span className="text-indigo-300">Using Adjusted Mean</span>
                                        : `n = ${(result.n_matched_users_b ?? result.sample_size_b)?.toLocaleString()}`}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                            <div>
                                <p className="text-xs text-slate-500">Effect Size</p>
                                <p className="text-xl font-semibold text-slate-100">
                                    {result.effect_size > 0 ? '+' : ''}
                                    {formatPercent(result.effect_size)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">
                                    {result.e_value !== undefined
                                        ? 'Anytime P-Value'
                                        : result.bayes_probability !== undefined
                                          ? 'Posterior P'
                                          : 'P-Value'}
                                </p>
                                <p className="text-xl font-semibold text-slate-100">
                                    {result.bayes_probability !== undefined
                                        ? formatNumber(result.bayes_probability, 3)
                                        : formatNumber(result.p_value, 4)}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-slate-500">
                                    {result.bayes_probability !== undefined
                                        ? '95% Credible Interval'
                                        : '95% Confidence Interval'}
                                </p>
                                <p className="text-xl font-semibold text-slate-100">
                                    [{formatPercent(result.confidence_interval_lower)},{' '}
                                    {formatPercent(result.confidence_interval_upper)}]
                                </p>
                            </div>
                        </div>

                        <div className="mt-3">
                            <p className="text-xs text-slate-500">Test: {result.test_type}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* AI Insights — inside the same card, below the statistical results */}
            <div className="mt-6 border-t border-slate-800/70 pt-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-4 h-4 text-cyan-400 shrink-0"
                        >
                            <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684Z" />
                        </svg>
                        <span className="text-sm font-medium text-slate-200">AI Insights</span>
                    </div>
                    <button
                        onClick={fetchInsights}
                        disabled={isLoadingInsight}
                        className="rounded-md p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-40"
                        title="Regenerate insights"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`w-4 h-4 ${isLoadingInsight ? 'animate-spin' : ''}`}
                        >
                            <path
                                fillRule="evenodd"
                                d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                </div>

                <div className="text-sm text-slate-300 min-h-[48px]">
                    {insightError ? (
                        <p className="text-red-400">{insightError}</p>
                    ) : isLoadingInsight ? (
                        <div className="flex items-center gap-2 text-slate-400">
                            <svg
                                className="animate-spin w-4 h-4 shrink-0"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <span>Analysing experiment data…</span>
                        </div>
                    ) : (
                        <ReactMarkdown
                            components={{
                                p: ({ children }: { children?: React.ReactNode }) => (
                                    <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
                                ),
                                ul: ({ children }: { children?: React.ReactNode }) => (
                                    <ul className="ml-4 mb-2 space-y-1 list-disc">{children}</ul>
                                ),
                                ol: ({ children }: { children?: React.ReactNode }) => (
                                    <ol className="ml-4 mb-2 space-y-1 list-decimal">{children}</ol>
                                ),
                                li: ({ children }: { children?: React.ReactNode }) => (
                                    <li className="leading-relaxed">{children}</li>
                                ),
                                strong: ({ children }: { children?: React.ReactNode }) => (
                                    <strong className="font-semibold text-slate-100">{children}</strong>
                                ),
                                code: ({ children }: { children?: React.ReactNode }) => (
                                    <code className="bg-slate-800 rounded px-1 text-cyan-300 text-xs font-mono">
                                        {children}
                                    </code>
                                ),
                            }}
                        >
                            {insightContent}
                        </ReactMarkdown>
                    )}
                </div>
            </div>
        </div>
    );
};

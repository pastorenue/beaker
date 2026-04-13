import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ExperimentAnalysis } from '../../types';

type InsightsCardProps = {
    analysis: ExperimentAnalysis;
};

function buildPrompt(analysis: ExperimentAnalysis): string {
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

export const InsightsCard: React.FC<InsightsCardProps> = ({ analysis }) => {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchInsights = async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoading(true);
        setContent('');
        setError(null);

        const token = window.localStorage.getItem('beaker-token');
        const accountId = window.localStorage.getItem('beaker-account-id');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (accountId) headers['x-beaker-account-id'] = accountId;

        try {
            const response = await fetch('/api/ai/chat/stream', {
                method: 'POST',
                headers,
                signal: controller.signal,
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are an expert A/B testing analyst. Given experiment data, provide 2-4 concise, actionable insights. Be accurate about the experiment state — if it has not started, say so clearly and give pre-launch advice. If data is insufficient, say that. Use bullet points and short paragraphs. Keep the response under 150 words.',
                        },
                        {
                            role: 'user',
                            content: buildPrompt(analysis),
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 512,
                }),
            });

            if (!response.ok || !response.body) {
                setError('AI service unavailable — check configuration.');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || '';
                for (const part of parts) {
                    const line = part.trim();
                    if (!line.startsWith('data:')) continue;
                    const payload = line.replace(/^data:\s*/, '');
                    if (payload === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(payload) as {
                            choices?: Array<{ delta?: { content?: string } }>;
                        };
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) setContent((prev) => prev + delta);
                    } catch {
                        // ignore parse errors
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                setError('Failed to generate insights.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-generate when analysis changes (e.g. new results come in while running)
    const analysisKey = `${analysis.experiment.id}-${analysis.experiment.status}-${analysis.results.length}`;
    useEffect(() => {
        fetchInsights();
        return () => abortRef.current?.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysisKey]);

    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>AI Insights</h3>
                <div className="flex items-center gap-2">
                    <span className="badge-gray">Auto-summary</span>
                    <button
                        onClick={fetchInsights}
                        disabled={isLoading}
                        className="rounded-md p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-40"
                        title="Regenerate insights"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                        >
                            <path
                                fillRule="evenodd"
                                d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="mt-3 text-sm text-slate-300 min-h-[60px]">
                {error ? (
                    <p className="text-red-400">{error}</p>
                ) : isLoading && !content ? (
                    <div className="flex items-center gap-2 text-slate-400">
                        <svg
                            className="animate-spin w-4 h-4"
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
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v8H4z"
                            />
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
                        {content}
                    </ReactMarkdown>
                )}
            </div>
        </div>
    );
};

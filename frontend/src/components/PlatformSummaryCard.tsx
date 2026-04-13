import React from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { experimentApi, featureGateApi, aiInsightsApi } from '../services/api';
import { ExperimentStatus } from '../types';
import { useAccount } from '../contexts/AccountContext';
import type { Experiment, FeatureGate, AiPollingInsight } from '../types';

function buildPrompt(
    experiments: Experiment[],
    gates: FeatureGate[],
    insights: AiPollingInsight[],
): string {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const running = experiments.filter((e) => e.status === ExperimentStatus.Running);
    const paused = experiments.filter((e) => e.status === ExperimentStatus.Paused);
    const stopped = experiments.filter((e) => e.status === ExperimentStatus.Stopped);
    const draft = experiments.filter((e) => e.status === ExperimentStatus.Draft);
    const recentExperiments = experiments.filter(
        (e) => new Date(e.created_at) >= sevenDaysAgo,
    );
    const recentGates = gates.filter((g) => new Date(g.created_at) >= sevenDaysAgo);

    const critical = insights.filter((i) => i.severity === 'critical');
    const warnings = insights.filter((i) => i.severity === 'warning');
    const infos = insights.filter((i) => i.severity === 'info');

    const topInsights = insights
        .slice(0, 6)
        .map((i) => `[${i.severity.toUpperCase()}] ${i.headline}`)
        .join('\n');

    const runningNames = running
        .slice(0, 8)
        .map((e) => `- ${e.name} (${e.experiment_type})`)
        .join('\n');

    return `You are a platform intelligence analyst for Beaker, an A/B testing and experimentation platform.

Analyze the following real-time platform state and generate a concise executive summary for the team.

## Platform Snapshot (as of ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})

**Experiments:**
- Total: ${experiments.length} (${running.length} running, ${paused.length} paused, ${stopped.length} stopped, ${draft.length} in draft)
- New this week: ${recentExperiments.length}

**Running experiments:**
${runningNames || '- None currently running'}

**Feature Gates:**
- Total: ${gates.length}
- Created this week: ${recentGates.length}

**AI Insights (active, not dismissed):**
- ${critical.length} critical, ${warnings.length} warnings, ${infos.length} informational

**Top alerts:**
${topInsights || '- No active alerts'}

---

Generate a structured platform summary with these sections:

### Experiment Health
Summarize the current experiment portfolio health. Highlight velocity, any concerning patterns, and what's actively running.

### Key Alerts & Action Items
List the most important items requiring attention based on the AI insights. If there are critical alerts, call them out clearly.

### Opportunities & Trends
Based on the platform state, identify trends and opportunities for the team this week.

Use **bold** for key numbers and metrics. Keep each section to 2-4 sentences or a short bullet list. Total response should be 200-350 words.`;
}

type SummaryState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'streaming'; text: string }
    | { status: 'done'; text: string; generatedAt: Date }
    | { status: 'error'; message: string };

export const PlatformSummaryCard: React.FC = () => {
    const { activeAccountId } = useAccount();
    const [summary, setSummary] = React.useState<SummaryState>({ status: 'idle' });

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments', activeAccountId],
        queryFn: async () => (await experimentApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: gates = [] } = useQuery({
        queryKey: ['featureGates', activeAccountId],
        queryFn: async () => (await featureGateApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: insightsData } = useQuery({
        queryKey: ['ai-insights'],
        queryFn: async () => (await aiInsightsApi.list({ limit: 20 })).data,
        refetchInterval: 60_000,
    });

    const insights: AiPollingInsight[] = insightsData?.insights ?? [];

    const isDataReady = experiments.length > 0 || gates.length > 0;

    const generate = React.useCallback(async () => {
        setSummary({ status: 'loading' });

        const token = window.localStorage.getItem('beaker-token');
        const accountId = window.localStorage.getItem('beaker-account-id');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (accountId) headers['X-Account-Id'] = accountId;

        const prompt = buildPrompt(experiments, gates, insights);

        try {
            const response = await fetch('/api/ai/chat/stream', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are a concise platform intelligence analyst. Respond in clear, structured markdown. Be direct and actionable. Never include preamble like "Here is your summary:".',
                        },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.35,
                    max_tokens: 800,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: response.statusText }));
                setSummary({ status: 'error', message: err?.error ?? 'AI service unavailable' });
                return;
            }

            if (!response.body) {
                setSummary({ status: 'error', message: 'Streaming not supported' });
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';

            setSummary({ status: 'streaming', text: '' });

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';

                for (const part of parts) {
                    const line = part.trim();
                    if (!line.startsWith('data:')) continue;
                    const payload = line.replace(/^data:\s*/, '');
                    if (payload === '[DONE]') {
                        setSummary({ status: 'done', text: accumulated, generatedAt: new Date() });
                        return;
                    }
                    try {
                        const parsed = JSON.parse(payload) as {
                            choices?: Array<{ delta?: { content?: string } }>;
                        };
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            accumulated += delta;
                            setSummary({ status: 'streaming', text: accumulated });
                        }
                    } catch {
                        // ignore SSE parse errors
                    }
                }
            }

            // Stream ended without [DONE]
            if (accumulated) {
                setSummary({ status: 'done', text: accumulated, generatedAt: new Date() });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to reach AI service';
            setSummary({ status: 'error', message: msg });
        }
    }, [experiments, gates, insights]);

    // Auto-generate once data is ready
    const hasGenerated = React.useRef(false);
    React.useEffect(() => {
        if (isDataReady && !hasGenerated.current) {
            hasGenerated.current = true;
            generate();
        }
    }, [isDataReady, generate]);

    const isGenerating = summary.status === 'loading' || summary.status === 'streaming';
    const text = summary.status === 'streaming' || summary.status === 'done' ? summary.text : '';

    return (
        <div className="card border border-slate-700/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/20">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-4 h-4 text-violet-400"
                        >
                            <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684Z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-2xl font-semibold text-slate-100">Platform Intelligence</h3>
                        <p className="text-sm text-slate-500">AI-generated summary of your account</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Insight severity badges */}
                    {insights.length > 0 && (
                        <div className="flex gap-1.5">
                            {insights.filter((i) => i.severity === 'critical').length > 0 && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/60 text-red-800">
                                    {insights.filter((i) => i.severity === 'critical').length} critical
                                </span>
                            )}
                            {insights.filter((i) => i.severity === 'warning').length > 0 && (
                                <span className="px-3 py-1 rounded text-sm font-medium bg-yellow-500/60 text-yellow-800">
                                    {insights.filter((i) => i.severity === 'warning').length} warnings
                                </span>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={generate}
                        disabled={isGenerating || !isDataReady}
                        className="flex items-center gap-1.5 rounded-md border border-purple-700 bg-purple-800 px-3 py-1 text-sm text-white transition hover:bg-purple-700/20 hover:text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`}
                        >
                            <path
                                fillRule="evenodd"
                                d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z"
                                clipRule="evenodd"
                            />
                        </svg>
                        {isGenerating ? 'Generating…' : 'Regenerate'}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="min-h-[120px]">
                {summary.status === 'idle' && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 pt-2">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="w-4 h-4 animate-spin"
                        >
                            <path
                                fillRule="evenodd"
                                d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z"
                                clipRule="evenodd"
                            />
                        </svg>
                        Waiting for data…
                    </div>
                )}

                {summary.status === 'loading' && (
                    <div className="space-y-2.5 pt-1">
                        {[80, 95, 70, 88, 60].map((w, i) => (
                            <div
                                key={i}
                                className="h-3 rounded-full bg-slate-800 animate-pulse"
                                style={{ width: `${w}%` }}
                            />
                        ))}
                    </div>
                )}

                {summary.status === 'error' && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/80 bg-red-300/20 px-4 py-3 text-sm text-red-800">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-4 h-4 mt-0.5 shrink-0"
                        >
                            <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                                clipRule="evenodd"
                            />
                        </svg>
                        {summary.message}
                    </div>
                )}

                {(summary.status === 'streaming' || summary.status === 'done') && text && (
                    <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown
                            components={{
                                h3: ({ children }) => (
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-4 mb-1.5 first:mt-0">
                                        {children}
                                    </h3>
                                ),
                                p: ({ children }) => (
                                    <p className="text-sm text-slate-300 leading-relaxed mb-2 last:mb-0">
                                        {children}
                                    </p>
                                ),
                                ul: ({ children }) => (
                                    <ul className="space-y-1 mb-2 list-none pl-0">{children}</ul>
                                ),
                                li: ({ children }) => (
                                    <li className="flex items-start gap-2 text-sm text-slate-300">
                                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
                                        <span>{children}</span>
                                    </li>
                                ),
                                strong: ({ children }) => (
                                    <strong className="font-semibold text-slate-100">{children}</strong>
                                ),
                            }}
                        >
                            {text}
                        </ReactMarkdown>
                        {summary.status === 'streaming' && (
                            <span className="inline-block h-3.5 w-0.5 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            {summary.status === 'done' && (
                <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-600 border-t border-slate-800 pt-3">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="w-3 h-3"
                    >
                        <path
                            fillRule="evenodd"
                            d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z"
                            clipRule="evenodd"
                        />
                    </svg>
                    Generated {summary.generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className="mx-1.5 text-slate-700">·</span>
                    Based on {experiments.length} experiments, {gates.length} gates, {insights.length} active insights
                </div>
            )}
        </div>
    );
};

import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { aiApi, aiStrategistApi, experimentApi, featureFlagApi, featureGateApi } from '../services/api';
import { AssistCards } from './ai-assist/AssistCards';
import { ChatPanel } from './ai-assist/ChatPanel';
import { InsightsFeed } from './ai-assist/InsightsFeed';
import { TotpPanel } from './ai-assist/TotpPanel';
import { useAccount } from '../contexts/AccountContext';

export const AiAssistHub: React.FC = () => {
    const { activeAccountId } = useAccount();
    type Usage = {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
    };

    const [input, setInput] = React.useState('');
    const [messages, setMessages] = React.useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
        {
            role: 'assistant',
            text: 'Ask me about experiments, feature flags, insights, or rollout plans.',
        },
    ]);
    const [selectedModel, setSelectedModel] = React.useState<string>('');
    const [lastUsage, setLastUsage] = React.useState<Usage | null>(null);
    const [isStreaming, setIsStreaming] = React.useState(false);
    const [totpSecret, setTotpSecret] = React.useState<string | null>(null);
    const [totpUrl, setTotpUrl] = React.useState<string | null>(null);
    const [totpCode, setTotpCode] = React.useState('');

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments', activeAccountId],
        queryFn: async () => (await experimentApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: flags = [] } = useQuery({
        queryKey: ['featureFlags', activeAccountId],
        queryFn: async () => (await featureFlagApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: gates = [] } = useQuery({
        queryKey: ['featureGates', activeAccountId],
        queryFn: async () => (await featureGateApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: modelList } = useQuery({
        queryKey: ['ai-models'],
        queryFn: async () => (await aiApi.models()).data,
    });

    React.useEffect(() => {
        if (!selectedModel && modelList?.models?.length) {
            setSelectedModel(modelList.models[0]);
        }
    }, [modelList, selectedModel]);

    const chatMutation = useMutation({
        mutationFn: async (payload: { prompt: string }) => {
            const experimentNames = experiments.slice(0, 5).map((exp) => exp.name).join(', ');
            const flagNames = flags.slice(0, 5).map((flag) => flag.name).join(', ');
            const context = [
                `Experiments: ${experiments.length} total.`,
                experimentNames ? `Recent experiments: ${experimentNames}.` : '',
                `Feature flags: ${flags.length} total.`,
                flagNames ? `Recent flags: ${flagNames}.` : '',
                `Feature gates: ${gates.length} total.`,
            ]
                .filter(Boolean)
                .join(' ');

            const response = await aiApi.chat({
                model: selectedModel || undefined,
                messages: [
                    {
                        role: 'system',
                        content:
                            `You are an experimentation copilot. Use the provided context when answering. Context: ${context}`,
                    },
                    ...messages.map((message) => ({
                        role: message.role,
                        content: message.text,
                    })),
                    {
                        role: 'user',
                        content: payload.prompt,
                    },
                ],
                temperature: 0.4,
                max_tokens: 512,
            });
            return response.data;
        },
        onSuccess: (data) => {
            setMessages((prev) => [...prev, { role: 'assistant', text: data.message.content }]);
            setLastUsage(data.usage ?? null);
        },
        onError: () => {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', text: 'Unable to reach AI service. Check LiteLLM configuration.' },
            ]);
        },
    });

    const streamChat = async (prompt: string) => {
        setIsStreaming(true);
        const experimentNames = experiments.slice(0, 5).map((exp) => exp.name).join(', ');
        const flagNames = flags.slice(0, 5).map((flag) => flag.name).join(', ');
        const context = [
            `Experiments: ${experiments.length} total.`,
            experimentNames ? `Recent experiments: ${experimentNames}.` : '',
            `Feature flags: ${flags.length} total.`,
            flagNames ? `Recent flags: ${flagNames}.` : '',
            `Feature gates: ${gates.length} total.`,
        ]
            .filter(Boolean)
            .join(' ');

        const response = await fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel || undefined,
                messages: [
                    {
                        role: 'system',
                        content:
                            `You are an experimentation copilot. Use the provided context when answering. Context: ${context}`,
                    },
                    ...messages.map((message) => ({
                        role: message.role,
                        content: message.text,
                    })),
                    { role: 'user', content: prompt },
                ],
                temperature: 0.4,
                max_tokens: 512,
            }),
        });

        if (!response.body) {
            throw new Error('Stream not available');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let usage: Usage | null = null;
        let doneReading = false;

        while (!doneReading) {
            const { value, done } = await reader.read();
            if (done) {
                doneReading = true;
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
                const line = part.trim();
                if (!line.startsWith('data:')) continue;
                const payload = line.replace(/^data:\s*/, '');
                if (payload === '[DONE]') {
                    setLastUsage(usage);
                    setIsStreaming(false);
                    return;
                }
                try {
                    const parsed = JSON.parse(payload) as {
                        choices?: Array<{ delta?: { content?: string } }>;
                        usage?: Usage;
                    };
                    if (parsed.choices?.[0]?.delta?.content) {
                        const delta = parsed.choices[0].delta.content;
                        setMessages((prev) => {
                            const next = [...prev];
                            const lastIndex = next.length - 1;
                            if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
                                next[lastIndex] = {
                                    ...next[lastIndex],
                                    text: next[lastIndex].text + delta,
                                };
                            }
                            return next;
                        });
                    }
                    if (parsed.usage) {
                        usage = parsed.usage;
                    }
                } catch {
                    // ignore parsing errors
                }
            }
        }
        setIsStreaming(false);
    };

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed) return;
        setMessages((prev) => [...prev, { role: 'user', text: trimmed }, { role: 'assistant', text: '' }]);
        setInput('');
        setLastUsage(null);
        try {
            await streamChat(trimmed);
        } catch {
            chatMutation.mutate({ prompt: trimmed });
            setIsStreaming(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1>AI Assist</h1>
                <p className="mt-1 text-slate-400">
                    Centralized access to AI copilots across experimentation, targeting, and rollout workflows.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <ChatPanel
                    messages={messages}
                    lastUsage={lastUsage}
                    selectedModel={selectedModel}
                    modelOptions={modelList?.models ?? ['gpt-4o-mini']}
                    input={input}
                    isBusy={isStreaming || chatMutation.isPending}
                    onModelChange={setSelectedModel}
                    onInputChange={setInput}
                    onSend={handleSend}
                    onPromptClick={(prompt) => {
                        setInput(prompt);
                        setTimeout(handleSend, 0);
                    }}
                />

                <div className="space-y-6">
                    <AssistCards
                        onSuggestExperiments={async () => {
                            const resp = await aiStrategistApi.suggestExperiments();
                            setMessages((prev) => [
                                ...prev,
                                {
                                    role: 'assistant',
                                    text: `Here are ${resp.data.length} experiment suggestions:\n\n${resp.data
                                        .map(
                                            (s, i) =>
                                                `${i + 1}. **${s.name}** (${s.experiment_type})\n   ${s.description}\n   Hypothesis: ${s.hypothesis_draft}`,
                                        )
                                        .join('\n\n')}`,
                                },
                            ]);
                        }}
                        onDraftHypothesis={async () => {
                            const resp = await aiStrategistApi.draftHypothesis({
                                experiment_description:
                                    'A general A/B test for improving user engagement',
                                metric_type: 'proportion',
                            });
                            setMessages((prev) => [
                                ...prev,
                                {
                                    role: 'assistant',
                                    text: `**Hypothesis Draft**\n\nNull: ${resp.data.null_hypothesis}\nAlternative: ${resp.data.alternative_hypothesis}\nEffect size: ${resp.data.expected_effect_size}\nRationale: ${resp.data.rationale}`,
                                },
                            ]);
                        }}
                        isBusy={isStreaming || chatMutation.isPending}
                    />
                    <InsightsFeed />
                    <TotpPanel
                        totpSecret={totpSecret}
                        totpUrl={totpUrl}
                        totpCode={totpCode}
                        onSecretChange={setTotpSecret}
                        onUrlChange={setTotpUrl}
                        onCodeChange={setTotpCode}
                    />
                </div>
            </div>
        </div>
    );
};

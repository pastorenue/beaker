import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { aiApi } from '../../services/api';
import { ChatPanel } from './ChatPanel';

type AiSupportDrawerProps = {
    isOpen: boolean;
    onClose: () => void;
    experimentContext?: string;
};

type Usage = {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
};

export const AiSupportDrawer: React.FC<AiSupportDrawerProps> = ({ isOpen, onClose, experimentContext }) => {
    const [input, setInput] = React.useState('');
    const [messages, setMessages] = React.useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
        {
            role: 'assistant',
            text: 'Ask me anything about this experiment — results, significance, next steps, or potential issues.',
        },
    ]);
    const [selectedModel, setSelectedModel] = React.useState<string>('');
    const [lastUsage, setLastUsage] = React.useState<Usage | null>(null);
    const [isStreaming, setIsStreaming] = React.useState(false);

    const { data: modelList } = useQuery({
        queryKey: ['ai-models'],
        queryFn: async () => (await aiApi.models()).data,
    });

    React.useEffect(() => {
        if (!selectedModel && modelList?.models?.length) {
            setSelectedModel(modelList.models[0]);
        }
    }, [modelList, selectedModel]);

    const systemPrompt = `You are an AI support assistant for an A/B testing platform. Format your responses clearly: use paragraphs with blank lines between them, bullet points for lists, and code blocks for any code or configuration. Keep responses concise but well-structured. Current experiment context: ${experimentContext ?? 'No experiment selected'}.`;

    const chatMutation = useMutation({
        mutationFn: async (payload: { prompt: string }) => {
            const response = await aiApi.chat({
                model: selectedModel || undefined,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages.map((message) => ({ role: message.role, content: message.text })),
                    { role: 'user', content: payload.prompt },
                ],
                temperature: 0.4,
                max_tokens: 2048,
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
                { role: 'assistant', text: 'Unable to reach AI service. Check AI_BASE_URL and AI_API_KEY configuration.' },
            ]);
        },
    });

    const streamChat = async (prompt: string) => {
        setIsStreaming(true);

        const token = window.localStorage.getItem('beaker-token');
        const accountId = window.localStorage.getItem('beaker-account-id');
        const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) authHeaders['Authorization'] = `Bearer ${token}`;
        if (accountId) authHeaders['X-Account-Id'] = accountId;

        const response = await fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                model: selectedModel || undefined,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages.map((message) => ({ role: message.role, content: message.text })),
                    { role: 'user', content: prompt },
                ],
                temperature: 0.4,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(err?.error ?? 'AI service error');
        }

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
                                next[lastIndex] = { ...next[lastIndex], text: next[lastIndex].text + delta };
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
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to reach AI service';
            setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant' && last.text === '') {
                    next[next.length - 1] = { role: 'assistant', text: `Error: ${msg}` };
                } else {
                    next.push({ role: 'assistant', text: `Error: ${msg}` });
                }
                return next;
            });
            setIsStreaming(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-40 bg-slate-950/30 transition-opacity duration-300 ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

            {/* Slide-in panel */}
            <div
                className={`fixed top-0 right-0 z-50 h-full w-1/3 min-w-[620px] flex flex-col bg-slate-900 border-l border-slate-700/60 shadow-2xl transition-transform duration-300 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 shrink-0">
                    <div className="flex items-center gap-2">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-5 h-5 text-cyan-400"
                        >
                            <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684Z" />
                        </svg>
                        <h3 className="text-xl font-semibold text-slate-100">AI Support</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        aria-label="Close AI Support"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                        </svg>
                    </button>
                </div>

                {/* Chat panel fills remaining height */}
                <div className="flex-1 overflow-hidden p-4">
                    <ChatPanel
                        messages={messages}
                        lastUsage={lastUsage}
                        selectedModel={selectedModel}
                        modelOptions={modelList?.models ?? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen-qwq-32b']}
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
                </div>
            </div>
        </>
    );
};

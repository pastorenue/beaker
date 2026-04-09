import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

type Usage = {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
};

type ChatPanelProps = {
    messages: ChatMessage[];
    lastUsage: Usage | null;
    selectedModel: string;
    modelOptions: string[];
    input: string;
    isBusy: boolean;
    onModelChange: (value: string) => void;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onPromptClick: (prompt: string) => void;
};

const QUICK_PROMPTS = ['Experiment status', 'Feature flag rollout', 'SRM alerts', 'Guardrail breaches'];

export const ChatPanel: React.FC<ChatPanelProps> = ({
    messages,
    lastUsage,
    selectedModel,
    modelOptions,
    input,
    isBusy,
    onModelChange,
    onInputChange,
    onSend,
    onPromptClick,
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea: grow with content, scroll only past ~5 rows
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';           // shrink first so scrollHeight reflects actual content
        const next = el.scrollHeight;
        if (next > 120) {
            el.style.height = '120px';
            el.style.overflowY = 'auto';
        } else {
            el.style.height = `${next}px`;
            el.style.overflowY = 'hidden';
        }
    }, [input]);

    return (
        <div className="card flex flex-col h-full">
            <div className="flex items-center justify-between shrink-0">
                <h3>AI Chat</h3>
                <span className="badge-gray">Global assist</span>
            </div>
            <div className="mt-4 flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-800/70 bg-slate-950/60 p-4">
                <div className="space-y-3 text-sm">
                    {messages.map((message, idx) => (
                        <div
                            key={idx}
                            className={`max-w-[85%] rounded-xl px-3 py-2 ${message.role === 'user'
                                    ? 'ml-auto bg-gray-500/10 text-cyan-800'
                                    : 'bg-slate-900/60 text-slate-200'
                                }`}
                        >
                            {message.role === 'assistant' ? (
                                <ReactMarkdown
                                    components={{
                                        p: ({ children }: { children?: React.ReactNode }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
                                        code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
                                            const isBlock = className?.includes('language-');
                                            return isBlock ? (
                                                <code className="block bg-slate-950 p-3 rounded-xl overflow-x-auto text-xs my-2 text-cyan-300">
                                                    {children}
                                                </code>
                                            ) : (
                                                <code className="bg-slate-800 rounded px-1 text-cyan-300 text-xs font-mono">
                                                    {children}
                                                </code>
                                            );
                                        },
                                        pre: ({ children }: { children?: React.ReactNode }) => <pre className="my-2">{children}</pre>,
                                        ul: ({ children }: { children?: React.ReactNode }) => <ul className="ml-4 mb-3 space-y-1 list-disc">{children}</ul>,
                                        ol: ({ children }: { children?: React.ReactNode }) => <ol className="ml-4 mb-3 space-y-1 list-decimal">{children}</ol>,
                                        li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
                                        strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-slate-100">{children}</strong>,
                                        h1: ({ children }: { children?: React.ReactNode }) => <h1 className="font-semibold mb-1 mt-3 text-base">{children}</h1>,
                                        h2: ({ children }: { children?: React.ReactNode }) => <h2 className="font-semibold mb-1 mt-3 text-sm">{children}</h2>,
                                        h3: ({ children }: { children?: React.ReactNode }) => <h3 className="font-semibold mb-1 mt-3 text-xs">{children}</h3>,
                                        blockquote: ({ children }: { children?: React.ReactNode }) => (
                                            <blockquote className="border-l-2 border-cyan-500 pl-3 text-slate-400 italic my-2">
                                                {children}
                                            </blockquote>
                                        ),
                                    }}
                                >
                                    {message.text}
                                </ReactMarkdown>
                            ) : (
                                <span className="whitespace-pre-wrap">{message.text}</span>
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </div>
            {lastUsage && (
                <div className="mt-2 shrink-0 text-xs text-slate-400">
                    Tokens: {lastUsage.total_tokens ?? '—'} · Prompt: {lastUsage.prompt_tokens ?? '—'} · Completion:{' '}
                    {lastUsage.completion_tokens ?? '—'}
                </div>
            )}
            <div className="mt-3 flex gap-2 shrink-0">
                <div className="flex-1 space-y-2">
                    <select className="input" value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>
                        {modelOptions.map((model) => (
                            <option key={model} value={model}>
                                {model}
                            </option>
                        ))}
                    </select>
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        className="input resize-none overflow-hidden"
                        style={{ minHeight: '2.5rem' }}
                        value={input}
                        onChange={(event) => onInputChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                onSend();
                            }
                        }}
                        placeholder="Ask about experiments, flags, insights… (Shift+Enter for new line)"
                    />
                </div>
                <button onClick={onSend} className="btn-primary h-auto self-stretch">
                    {isBusy ? 'Thinking...' : 'Send'}
                </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 shrink-0">
                {QUICK_PROMPTS.map((prompt) => (
                    <button key={prompt} type="button" className="badge-gray" onClick={() => onPromptClick(prompt)}>
                        {prompt}
                    </button>
                ))}
            </div>
        </div>
    );
};

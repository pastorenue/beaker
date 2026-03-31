import React from 'react';

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
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>AI Chat</h3>
                <span className="badge-gray">Global assist</span>
            </div>
            <div className="mt-4 h-[320px] overflow-y-auto rounded-xl border border-slate-800/70 bg-slate-950/60 p-4">
                <div className="space-y-3 text-sm">
                    {messages.map((message, idx) => (
                        <div
                            key={idx}
                            className={`max-w-[85%] rounded-xl px-3 py-2 ${message.role === 'user'
                                    ? 'ml-auto bg-gray-500/10 text-cyan-100'
                                    : 'bg-slate-900/60 text-slate-200'
                                }`}
                        >
                            {message.text}
                        </div>
                    ))}
                </div>
            </div>
            {lastUsage && (
                <div className="mt-2 text-xs text-slate-400">
                    Tokens: {lastUsage.total_tokens ?? '—'} · Prompt: {lastUsage.prompt_tokens ?? '—'} · Completion:{' '}
                    {lastUsage.completion_tokens ?? '—'}
                </div>
            )}
            <div className="mt-3 flex gap-2">
                <div className="flex-1 space-y-2">
                    <select className="input" value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>
                        {modelOptions.map((model) => (
                            <option key={model} value={model}>
                                {model}
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        className="input"
                        value={input}
                        onChange={(event) => onInputChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                onSend();
                            }
                        }}
                        placeholder="Ask about experiments, flags, insights..."
                    />
                </div>
                <button onClick={onSend} className="btn-primary h-[88px]">
                    {isBusy ? 'Thinking...' : 'Send'}
                </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                    <button key={prompt} type="button" className="badge-gray" onClick={() => onPromptClick(prompt)}>
                        {prompt}
                    </button>
                ))}
            </div>
        </div>
    );
};

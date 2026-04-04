import React from 'react';
import { AssistCards } from './ai-assist/AssistCards';
import { InsightsFeed } from './ai-assist/InsightsFeed';
import { AiSupportDrawer } from './ai-assist/AiSupportDrawer';

export const AiAssistHub: React.FC = () => {
    const [isAiDrawerOpen, setIsAiDrawerOpen] = React.useState(false);

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-3xl font-medium text-slate-900">AI Assist</h1>
                <p className="mt-1 text-slate-400">
                    Centralized access to AI copilots across experimentation, targeting, and rollout workflows.
                </p>
            </div>

            <AssistCards />
            <InsightsFeed />

            {/* Floating AI Assist button */}
            <button
                onClick={() => setIsAiDrawerOpen(true)}
                className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-gray-500 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-cyan-400 transition-colors"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                >
                    <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684Z" />
                </svg>
                AI Assist
            </button>

            <AiSupportDrawer
                isOpen={isAiDrawerOpen}
                onClose={() => setIsAiDrawerOpen(false)}
            />
        </div>
    );
};

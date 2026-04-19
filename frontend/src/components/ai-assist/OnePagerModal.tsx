import React from 'react';
import type { OnePagerDraft } from '../../types';

interface OnePagerModalProps {
    draft: OnePagerDraft;
    onClose: () => void;
}

export const OnePagerModal: React.FC<OnePagerModalProps> = ({ draft, onClose }) => {
    const [copied, setCopied] = React.useState(false);

    const formattedText = [
        `Experiment: ${draft.experiment_name}`,
        ``,
        `Objective\n${draft.objective}`,
        ``,
        `Hypothesis\n${draft.hypothesis}`,
        ``,
        `Success Metrics\n${draft.success_metrics.map(m => `- ${m}`).join('\n')}`,
        ``,
        `Guardrail Metrics\n${draft.guardrail_metrics.map(m => `- ${m}`).join('\n')}`,
        ``,
        `Estimated Duration: ${draft.estimated_duration_days} days`,
        `Sample Size Estimate: ~${draft.sample_size_estimate} users`,
        ``,
        `Risks\n${draft.risks.map(r => `- ${r}`).join('\n')}`,
    ].join('\n');

    const handleCopy = () => {
        navigator.clipboard.writeText(formattedText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            // silent
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-slate-100">{draft.experiment_name}</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 transition-colors"
                        >
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
                            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto max-h-[70vh] space-y-4 text-sm text-slate-300">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Objective</p>
                        <p>{draft.objective}</p>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Hypothesis</p>
                        <p>{draft.hypothesis}</p>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Success Metrics</p>
                        <ul className="list-disc list-inside space-y-1">
                            {draft.success_metrics.map((m, i) => (
                                <li key={i}>{m}</li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Guardrail Metrics</p>
                        <ul className="list-disc list-inside space-y-1">
                            {draft.guardrail_metrics.map((m, i) => (
                                <li key={i}>{m}</li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex gap-6">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Estimated Duration</p>
                            <p>{draft.estimated_duration_days} days</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Sample Size Estimate</p>
                            <p>~{draft.sample_size_estimate} users</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Risks</p>
                        <ul className="list-disc list-inside space-y-1 text-amber-400">
                            {draft.risks.map((r, i) => (
                                <li key={i}>{r}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

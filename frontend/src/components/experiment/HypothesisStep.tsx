import React from 'react';
import { MetricType as MT, type CreateExperimentRequest, type Hypothesis, type MetricType } from '../../types';

type HypothesisStepProps = {
    formData: CreateExperimentRequest;
    updateHypothesis: (field: keyof Hypothesis, value: unknown) => void;
    applyHypothesisTemplate: () => void;
    onAiDraft: () => Promise<void>;
};

export const HypothesisStep: React.FC<HypothesisStepProps> = ({
    formData,
    updateHypothesis,
    applyHypothesisTemplate,
    onAiDraft,
}) => {
    const [isDrafting, setIsDrafting] = React.useState(false);
    const [draftError, setDraftError] = React.useState<string | null>(null);

    const handleAiDraft = async () => {
        setIsDrafting(true);
        setDraftError(null);
        try {
            await onAiDraft();
        } catch {
            setDraftError('Failed to generate draft. Please try again.');
        } finally {
            setIsDrafting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="label">Null Hypothesis (H₀)</label>
                <textarea
                    className="input"
                    rows={2}
                    value={formData.hypothesis.null_hypothesis}
                    onChange={(e) => updateHypothesis('null_hypothesis', e.target.value)}
                    placeholder="e.g., The new button color has no effect on conversion rate"
                />
            </div>
            <div>
                <label className="label">Alternative Hypothesis (H₁)</label>
                <textarea
                    className="input"
                    rows={2}
                    value={formData.hypothesis.alternative_hypothesis}
                    onChange={(e) => updateHypothesis('alternative_hypothesis', e.target.value)}
                    placeholder="e.g., The new button color increases conversion rate"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="label">Metric Type</label>
                    <select
                        className="input"
                        value={formData.hypothesis.metric_type}
                        onChange={(e) => updateHypothesis('metric_type', e.target.value as MetricType)}
                    >
                        <option value={MT.Proportion}>Proportion (Conversion Rate)</option>
                        <option value={MT.Continuous}>Continuous (Average)</option>
                        <option value={MT.Count}>Count</option>
                    </select>
                </div>
                <div>
                    <label className="label">Expected Effect Size</label>
                    <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={formData.hypothesis.expected_effect_size}
                        onChange={(e) => updateHypothesis('expected_effect_size', parseFloat(e.target.value))}
                    />
                    <p className="mt-1 text-xs text-slate-500">Minimum detectable effect (e.g., 0.05 = 5%)</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="label">Significance Level (α)</label>
                    <input
                        type="number"
                        step="0.01"
                        max="1"
                        className="input"
                        value={formData.hypothesis.significance_level}
                        onChange={(e) => updateHypothesis('significance_level', parseFloat(e.target.value))}
                    />
                </div>
                <div>
                    <label className="label">Statistical Power (1-β)</label>
                    <input
                        type="number"
                        step="0.05"
                        max="1"
                        className="input"
                        value={formData.hypothesis.power}
                        onChange={(e) => updateHypothesis('power', parseFloat(e.target.value))}
                    />
                </div>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">AI Hypothesis Draft</p>
                    <span className="badge-gray">Auto-fill</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                    Generate a hypothesis template based on your primary metric and experiment type.
                </p>
                <div className="mt-3">
                    <button
                        onClick={handleAiDraft}
                        disabled={isDrafting}
                        className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDrafting ? 'Drafting…' : 'AI Draft'}
                    </button>
                    <button onClick={applyHypothesisTemplate} className="btn-secondary ml-2">
                        Template
                    </button>
                    {draftError && <p className="mt-2 text-xs text-red-400">{draftError}</p>}
                </div>
            </div>
        </div>
    );
};

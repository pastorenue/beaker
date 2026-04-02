import React from 'react';
import type { CreateExperimentRequest, FeatureFlag, FeatureGate } from '../../types';

type ReviewStepProps = {
    formData: CreateExperimentRequest;
    featureFlags: FeatureFlag[];
    featureGates: FeatureGate[];
};

export const ReviewStep: React.FC<ReviewStepProps> = ({
    formData,
    featureFlags,
    featureGates,
}) => {
    return (
        <div className="space-y-4">
            <div className="card bg-slate-950/60">
                <h3 className="mb-2">Experiment Summary</h3>
                <p className="font-semibold text-slate-100">{formData.name}</p>
                <p className="text-sm text-slate-400">{formData.description}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300">
                    <span>Type: {formData.experiment_type}</span>
                    <span>Sampling: {formData.sampling_method}</span>
                    <span>Engine: {formData.analysis_engine}</span>
                    <span>Primary Metric: {formData.primary_metric || '—'}</span>
                    <span>Existing Users Only: {formData.requires_existing_users ? 'Yes' : 'No'}</span>
                </div>
            </div>
            <div className="card bg-slate-950/60">
                <h3 className="mb-2">Hypothesis</h3>
                <p className="text-sm">
                    <strong>H₀:</strong> {formData.hypothesis.null_hypothesis}
                </p>
                <p className="text-sm">
                    <strong>H₁:</strong> {formData.hypothesis.alternative_hypothesis}
                </p>
            </div>
            <div className="card bg-slate-950/60">
                <h3 className="mb-2">Variants ({formData.variants.length})</h3>
                <ul className="space-y-1">
                    {formData.variants.map((v, idx) => (
                        <li key={idx} className="text-sm">
                            {v.name} - {v.allocation_percent}% {v.is_control && '(Control)'}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="card bg-slate-950/60">
                <h3 className="mb-2">Feature Gate Link</h3>
                <p className="text-sm text-slate-300">
                    Flag: {featureFlags.find((flag) => flag.id === formData.feature_flag_id)?.name || 'None'}
                </p>
                <p className="text-sm text-slate-300">
                    Gate: {featureGates.find((gate) => gate.id === formData.feature_gate_id)?.name || 'None'}
                </p>
            </div>
            <div className="card bg-slate-950/60">
                <h3 className="mb-2">Health Checks</h3>
                {(formData.health_checks || []).length === 0 ? (
                    <p className="text-sm text-slate-500">No health checks configured.</p>
                ) : (
                    <ul className="space-y-1 text-sm text-slate-300">
                        {(formData.health_checks || []).map((check, idx) => (
                            <li key={idx}>
                                {check.metric_name || 'Metric'} ({check.direction}) {check.min ?? '—'} - {check.max ?? '—'}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

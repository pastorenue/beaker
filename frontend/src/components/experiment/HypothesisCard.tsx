import React from 'react';
import type { Experiment } from '../../types';

type HypothesisCardProps = {
    experiment: Experiment;
};

export const HypothesisCard: React.FC<HypothesisCardProps> = ({ experiment }) => {
    if (!experiment.hypothesis) return null;

    return (
        <div className="rounded-xl bg-slate-950/40 p-3">
            <p className="mb-2 text-md font-semibold text-slate-500">Hypothesis</p>
            <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs font-bold text-slate-500">Null (H₀)</p>
                        <p className="text-sm text-slate-300">{experiment.hypothesis.null_hypothesis}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500">Alternative (H₁)</p>
                        <p className="text-sm text-slate-300">{experiment.hypothesis.alternative_hypothesis}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

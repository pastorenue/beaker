import React from 'react';
import type { Experiment, ExperimentAnalysis } from '../../types';

type TrafficDistributionProps = {
    experiment: Experiment;
    sampleSizes?: ExperimentAnalysis['sample_sizes'];
};

export const TrafficDistribution: React.FC<TrafficDistributionProps> = ({ experiment, sampleSizes }) => {
    return (
        <div className="mt-4 soft-divider pt-4">
            <div className="space-y-3">
                {experiment.variants.map((variant, idx) => {
                    const progress = sampleSizes?.find(s => s.variant === variant.name);
                    const pct = progress && progress.required_size > 0
                        ? Math.min((progress.current_size / progress.required_size) * 100, 100)
                        : 0;
                    const isComplete = progress ? progress.current_size >= progress.required_size : false;

                    return (
                        <div key={idx}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="font-medium text-slate-200 flex items-center gap-1.5">
                                    {variant.name}
                                    {variant.is_control && <span className="badge-info text-xs">Control</span>}
                                </span>
                                <span className="text-slate-400 text-xs tabular-nums">
                                    {progress
                                        ? `${progress.current_size.toLocaleString()} / ${progress.required_size.toLocaleString()}`
                                        : `${variant.allocation_percent}%`}
                                </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                                <div
                                    className={`h-full transition-all duration-500 ${
                                        isComplete
                                            ? 'bg-emerald-400'
                                            : variant.is_control
                                              ? 'bg-red-500'
                                              : 'bg-purple-500'
                                    }`}
                                    style={{ width: progress ? `${pct}%` : `${variant.allocation_percent}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

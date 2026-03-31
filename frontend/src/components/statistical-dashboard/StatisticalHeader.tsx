import React from 'react';
import type { ExperimentAnalysis } from '../../types';

type StatisticalHeaderProps = {
    experiment: ExperimentAnalysis['experiment'];
    isPolling?: boolean;
    useCuped: boolean;
    onToggleCuped?: (enabled: boolean) => void;
    onOpenConfig: () => void;
    cupedError?: string | null;
    hasCupedResults: boolean;
    eValue?: number | null;
    sequentialThreshold?: number | null;
    className?: string;
};

export const StatisticalHeader: React.FC<StatisticalHeaderProps> = ({
    experiment,
    isPolling,
    useCuped,
    onToggleCuped,
    onOpenConfig,
    cupedError,
    hasCupedResults,
    eValue,
    sequentialThreshold,
    className,
}) => {
    return (
        <div className={`card ${className ?? ''}`}>
            <div className="flex items-center justify-between mb-2">
                <h2 className="mb-0">{experiment.name}</h2>
                {isPolling && (
                    <div className="flex items-center space-x-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
                        </span>
                        <span className="text-xs font-semibold text-emerald-200">Live</span>
                    </div>
                )}
            </div>
            <p className="text-slate-400">{experiment.description}</p>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
                <span className="badge-info">Engine: {experiment.analysis_engine}</span>
                <span className="badge-gray">Sampling: {experiment.sampling_method}</span>
                <span className="badge-gray">Type: {experiment.experiment_type}</span>
                {experiment.analysis_engine === 'sequential' && eValue != null && (
                    <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            eValue >= (sequentialThreshold ?? 20)
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                : 'border-slate-600/40 bg-slate-800/50 text-slate-400'
                        }`}
                    >
                        E-Value: {eValue.toFixed(2)} / {(sequentialThreshold ?? 20).toFixed(0)} threshold
                    </span>
                )}

                <div className="ml-auto flex items-center gap-3">
                    {onToggleCuped && (
                        <label className="flex items-center cursor-pointer gap-2">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={useCuped}
                                    onChange={(e) => onToggleCuped(e.target.checked)}
                                />
                                <div
                                    className={`block w-10 h-6 rounded-full transition-colors ${
                                        useCuped ? 'bg-indigo-500' : 'bg-slate-700'
                                    }`}
                                ></div>
                                <div
                                    className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${
                                        useCuped ? 'translate-x-4' : ''
                                    }`}
                                ></div>
                            </div>
                            <span className={`text-sm font-medium ${useCuped ? 'text-indigo-300' : 'text-slate-400'}`}>
                                CUPED Variance Reduction
                            </span>
                        </label>
                    )}
                    <button onClick={onOpenConfig} className="btn-secondary text-xs py-1 px-2 h-auto">
                        Configure CUPED
                    </button>
                </div>
            </div>

            {useCuped && cupedError && (
                <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                    ⚠️ CUPED Analysis Failed: {cupedError}. Showing standard results.
                </div>
            )}

            {useCuped && !cupedError && hasCupedResults && (
                <div className="mt-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 flex items-center gap-2">
                    <span className="text-indigo-300">⚡ CUPED Active</span>
                    <span className="text-slate-300 text-sm">
                        Results are adjusted using pre-experiment data to reduce variance and increase sensitivity.
                    </span>
                </div>
            )}
        </div>
    );
};

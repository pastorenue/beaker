import React from 'react';
import type { Experiment } from '../../types';

type MetaGridProps = {
    experiment: Experiment;
    formatDate: (value?: string) => string;
};

export const MetaGrid: React.FC<MetaGridProps> = ({ experiment, formatDate }) => {
    const sig = experiment.hypothesis?.significance_level;
    const power = experiment.hypothesis?.power;
    const effect = experiment.hypothesis?.expected_effect_size;
    return (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 soft-divider pt-2">
            <div>
                <p className="text-xs font-bold text-slate-500">Created</p>
                <p className="text-slate-100 font-medium">{formatDate(experiment.created_at)}</p>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-500">Targeting</p>
                <p className="text-slate-100 font-medium">
                    {experiment.user_groups.length > 0 ? `${experiment.user_groups.length} Groups` : 'All Users'}
                </p>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-500">Type</p>
                <p className="text-slate-100 font-medium">{experiment.experiment_type}</p>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-500">Engine</p>
                <p className="text-slate-100 font-medium">{experiment.analysis_engine}</p>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-500">Significance α</p>
                <p className="text-slate-100 font-medium">
                    {sig !== undefined ? `${(sig * 100).toFixed(2)}%` : '—'}
                </p>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-500">Power (1-β)</p>
                <p className="text-slate-100 font-medium">
                    {power !== undefined ? `${(power * 100).toFixed(1)}%` : '—'}
                </p>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-500">Expected Effect</p>
                <p className="text-slate-100 font-medium">
                    {effect !== undefined ? `${(effect * 100).toFixed(2)}%` : '—'}
                </p>
            </div>
            {experiment.start_date && (
                <div>
                    <p className="text-xs font-bold text-slate-500">Started</p>
                    <p className="text-slate-100 font-medium">{formatDate(experiment.start_date)}</p>
                </div>
            )}
            {experiment.end_date && (
                <div>
                    <p className="text-xs font-bold text-slate-500">Ended</p>
                    <p className="text-slate-100 font-medium">{formatDate(experiment.end_date)}</p>
                </div>
            )}
        </div>
    );
};

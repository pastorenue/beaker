import React from 'react';
import type { Experiment } from '../../types';
import { ExperimentStatus } from '../../types';
import { ControlButtons } from './ControlButtons';
import { HypothesisCard } from './HypothesisCard';
import { MetaGrid } from './MetaGrid';
import { StatusBadge } from '../Common';
import { TrafficDistribution } from './TrafficDistribution';

interface ExperimentMonitorProps {
    experiment: Experiment;
    onStart: () => void;
    onPause: () => void;
    onStop: () => void;
    isLoading?: boolean;
    extraTopContent?: React.ReactNode;
}

export const ExperimentMonitor: React.FC<ExperimentMonitorProps> = ({
    experiment,
    onStart,
    onPause,
    onStop,
    isLoading,
    extraTopContent,
}) => {
    const getStatusColor = () => {
        switch (experiment.status) {
            case ExperimentStatus.Running:
                return 'border-emerald-400/40 bg-emerald-500/5';
            case ExperimentStatus.Paused:
                return 'border-amber-300/40 bg-amber-400/5';
            case ExperimentStatus.Stopped:
                return 'border-rose-400/40 bg-rose-500/5';
            default:
                return 'border-slate-700/70 bg-slate-900/40';
        }
    };

    const canStart = experiment.status === ExperimentStatus.Draft || experiment.status === ExperimentStatus.Paused;
    const canPause = experiment.status === ExperimentStatus.Running;
    const canStop = experiment.status !== ExperimentStatus.Stopped;

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString();
    };

    return (
        <div className={`experiment-monitor card border-2 ${getStatusColor()} animate-fade-in`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold leading-tight text-slate-50">{experiment.name}</h2>
                        <StatusBadge status={experiment.status} />
                        {experiment.feature_flag_id && (
                            <span className="badge-info">Feature Flag Linked</span>
                        )}
                        <span className="badge-muted">Primary: {experiment.primary_metric}</span>
                    </div>
                    {experiment.description && (
                        <p className="text-sm text-slate-400 max-w-3xl">{experiment.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <ControlButtons
                        canStart={canStart}
                        canPause={canPause}
                        canStop={canStop}
                        isLoading={isLoading}
                        onStart={onStart}
                        onPause={onPause}
                        onStop={onStop}
                    />
                </div>
            </div>

            {extraTopContent}

            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <HypothesisCard experiment={experiment} />
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500">Traffic</p>
                        <span className="text-xs text-slate-400">{experiment.variants.length} variants</span>
                    </div>
                    <TrafficDistribution experiment={experiment} />
                </div>
            </div>

            <MetaGrid experiment={experiment} formatDate={formatDate} />
        </div>
    );
};

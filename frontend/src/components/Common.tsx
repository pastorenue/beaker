import React from 'react';
import { ExperimentStatus } from '../types';

interface StatusBadgeProps {
    status: ExperimentStatus;
    format?: 'upper' | 'title';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, format = 'upper' }) => {
    const getStatusStyle = () => {
        switch (status) {
            case ExperimentStatus.Running:
                return 'text-emerald-300 status-running';
            case ExperimentStatus.Paused:
                return 'text-amber-300 status-paused';
            case ExperimentStatus.Stopped:
                return 'text-rose-300 status-stopped';
            default:
                return 'text-slate-400 status-draft';
        }
    };

    const label =
        format === 'title'
            ? status.charAt(0).toUpperCase() + status.slice(1)
            : status.toUpperCase();

    return (
        <span className={`font-semibold ${getStatusStyle()}`}>
            {label}
        </span>
    );
};

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, trend, icon }) => {
    const getTrendColor = () => {
        switch (trend) {
            case 'up':
                return 'text-emerald-300';
            case 'down':
                return 'text-rose-300';
            default:
                return 'text-slate-400';
        }
    };

    return (
        <div className="card animate-fade-in">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-100">{value}</p>
                    {subtitle && (
                        <p className={`mt-1 text-sm ${getTrendColor()}`}>{subtitle}</p>
                    )}
                </div>
                {icon && (
                    <div className="rounded-full bg-cyan-500/10 p-3 text-cyan-300">
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
};

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    fullHeight?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', fullHeight = false }) => {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
    };

    return (
        <div className={`flex w-full items-center justify-center ${fullHeight ? 'min-h-[60vh]' : 'py-6'}`}>
            <div
                className={`${sizeClasses[size]} animate-spin rounded-full border-[3px] border-slate-700/70 border-t-cyan-300/70`}
                style={{ animationDuration: '1.4s' }}
            />
        </div>
    );
};

interface ProgressBarProps {
    current: number;
    total: number;
    label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, label }) => {
    const percentage = Math.min((current / total) * 100, 100);
    const isComplete = current >= total;

    return (
        <div className="w-full">
            {label && (
                <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium text-slate-300">{label}</span>
                    <span className="text-slate-400">
                        {current.toLocaleString()} / {total.toLocaleString()}
                    </span>
                </div>
            )}
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800/80">
                <div
                    className={`h-full transition-all duration-500 ${isComplete ? 'bg-emerald-400' : 'bg-cyan-400'
                        }`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

interface SignificanceIndicatorProps {
    pValue: number;
    alpha?: number;
    bayesProbability?: number;
    eValue?: number;
    sequentialThreshold?: number;
}

export const SignificanceIndicator: React.FC<SignificanceIndicatorProps> = ({
    pValue,
    alpha = 0.05,
    bayesProbability,
    eValue,
    sequentialThreshold,
}) => {
    const isSequential = eValue !== undefined;
    const isBayes = !isSequential && bayesProbability !== undefined && bayesProbability !== null;
    const threshold = sequentialThreshold ?? (1.0 / alpha);
    const isSignificant = isSequential
        ? eValue >= threshold
        : isBayes
          ? (bayesProbability ?? 0) >= (1.0 - alpha)
          : pValue < alpha;

    const label = isSequential
        ? isSignificant
            ? 'Decision: Reject H₀'
            : 'Continue Testing'
        : isBayes
          ? isSignificant ? 'High Confidence' : 'Low Confidence'
          : isSignificant ? 'Significant' : 'Not Significant';

    const detail = isSequential
        ? `(M_t = ${eValue !== undefined && !isNaN(eValue) ? eValue.toFixed(2) : '—'})`
        : isBayes
          ? `(P = ${bayesProbability !== null && bayesProbability !== undefined && !isNaN(bayesProbability) ? bayesProbability.toFixed(3) : '—'})`
          : `(p = ${pValue !== null && pValue !== undefined && !isNaN(pValue) ? pValue.toFixed(4) : '—'})`;

    return (
        <div className="flex items-center gap-2">
            <div
                className={`h-3 w-3 rounded-full ${isSignificant ? 'bg-emerald-400' : 'bg-slate-500'}`}
            />
            <span className={`text-sm font-medium ${isSignificant ? 'text-emerald-300' : 'text-slate-400'}`}>
                {label}
            </span>
            <span className="text-sm text-slate-500">{detail}</span>
        </div>
    );
};

import React from 'react';
import { ExperimentStatus } from '../../types';

type StatusBannerProps = {
    status: ExperimentStatus;
};

export const StatusBanner: React.FC<StatusBannerProps> = ({ status }) => {
    if (status === ExperimentStatus.Draft) {
        return (
            <div className="mt-4 rounded-xl bg-gray-500/10 p-3 border border-cyan-500/20">
                <p className="text-sm text-slate-200">
                    ℹ️ This experiment is in draft mode. Click "Start Experiment" to begin collecting data.
                </p>
            </div>
        );
    }
    if (status === ExperimentStatus.Running) {
        return (
            <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 border border-emerald-500/20">
                <p className="text-sm text-emerald-200">
                    ✓ Experiment is running. Users are being assigned to variants and metrics are being collected.
                </p>
            </div>
        );
    }
    if (status === ExperimentStatus.Paused) {
        return (
            <div className="mt-4 rounded-xl bg-amber-400/10 p-3 border border-amber-400/20">
                <p className="text-sm text-amber-200">
                    ⏸ Experiment is paused. No new users are being assigned, but existing data is preserved.
                </p>
            </div>
        );
    }
    return null;
};

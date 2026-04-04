import React from 'react';

type FeatureFlagHeaderProps = {
    onCreate: () => void;
};

export const FeatureFlagHeader: React.FC<FeatureFlagHeaderProps> = ({ onCreate }) => {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h2 className="text-3xl font-medium text-slate-900">Feature Flags</h2>
                <p className="text-sm text-slate-400">Ship with gates, experiments, and rollout safety checks.</p>
            </div>
            <button onClick={onCreate} className="btn-primary">
                + New Flag
            </button>
        </div>
    );
};

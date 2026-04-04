import React from 'react';

export const SimulationHeader: React.FC = () => {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h2 className="text-3xl font-medium text-slate-900">Simulation Studio</h2>
                <p className="mt-1 text-slate-400">
                    Orchestrate experiments, audiences, and hypotheses in a connected action canvas.
                </p>
            </div>
        </div>
    );
};

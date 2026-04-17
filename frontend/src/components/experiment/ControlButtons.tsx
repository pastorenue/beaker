import React from 'react';

type ControlButtonsProps = {
    canStart: boolean;
    canPause: boolean;
    canStop: boolean;
    isLoading?: boolean;
    onStart: () => void;
    onPause: () => void;
    onStop: () => void;
};

export const ControlButtons: React.FC<ControlButtonsProps> = ({
    canStart,
    canPause,
    canStop,
    isLoading,
    onStart,
    onPause,
    onStop,
}) => {
    return (
        <div className="flex gap-3">
            {canStart && (
                <button onClick={onStart} className="btn-success" disabled={isLoading}>
                    {isLoading ? 'Processing...' : '▶ Start Experiment'}
                </button>
            )}
            {canPause && (
                <button onClick={onPause} className="btn-warning" disabled={isLoading}>
                    {isLoading ? 'Processing...' : '⏸ Pause'}
                </button>
            )}
            {canStop && (
                <button onClick={onStop} className="btn-danger" disabled={isLoading}>
                    {isLoading ? 'Processing...' : '⏹ Stop Experiment'}
                </button>
            )}
        </div>
    );
};

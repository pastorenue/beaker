interface EmptyStateProps {
    onNewClick: () => void;
}

export function EmptyState({ onNewClick }: EmptyStateProps) {
    return (
        <div className="card text-center">
            <h2 className="mb-2">Welcome to Beaker</h2>
            <p className="mb-4 text-slate-400">
                Create your first experiment to start testing hypotheses and analyzing results
            </p>
            <button onClick={onNewClick} className="btn-primary">
                Create First Experiment
            </button>
        </div>
    );
}

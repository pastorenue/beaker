interface ExperimentsHeaderProps {
    onNewClick: () => void;
}

export function ExperimentsHeader({ onNewClick }: ExperimentsHeaderProps) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-medium text-slate-100">Experiments</h1>
                <p className="mt-1 text-slate-400">Manage and analyze your A/B tests in real time.</p>
            </div>
            <div className="flex items-center gap-3">
                <button onClick={onNewClick} className="btn-primary">
                    + New
                </button>
            </div>
        </div>
    );
}

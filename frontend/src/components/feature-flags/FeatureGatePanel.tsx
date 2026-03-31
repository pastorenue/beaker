import React from 'react';
import { FeatureGateStatus, type CreateFeatureGateRequest, type FeatureFlag, type FeatureGate } from '../../types';

type RolloutAdvice = {
    headline: string;
    steps: string[];
    linkedExperiments: number;
    activeGates: number;
};

type FeatureGatePanelProps = {
    selectedFlag: FeatureFlag | null;
    selectedGates: FeatureGate[];
    rolloutAdvice: RolloutAdvice | null;
    showGateForm: boolean;
    gateForm: CreateFeatureGateRequest;
    setGateForm: (value: CreateFeatureGateRequest) => void;
    openGateDetailId: string | null;
    gateTooltipSide: 'left' | 'right';
    setGateTooltipSide: (value: 'left' | 'right') => void;
    setOpenGateDetailId: React.Dispatch<React.SetStateAction<string | null>>;
    onOpenGateForm: () => void;
    onCloseGateForm: () => void;
    onCreateGate: () => void;
    isCreatePending: boolean;
};

export const FeatureGatePanel: React.FC<FeatureGatePanelProps> = ({
    selectedFlag,
    selectedGates,
    rolloutAdvice,
    showGateForm,
    gateForm,
    setGateForm,
    openGateDetailId,
    gateTooltipSide,
    setGateTooltipSide,
    setOpenGateDetailId,
    onOpenGateForm,
    onCloseGateForm,
    onCreateGate,
    isCreatePending,
}) => {
    return (
        <div className="space-y-4">
            <div className="card">
                <div className="flex items-center justify-between">
                    <h3>Feature Gates</h3>
                    <button type="button" onClick={onOpenGateForm} className="btn-secondary">
                        + New Gate
                    </button>
                </div>
                {!selectedFlag && (
                    <p className="mt-3 text-sm text-slate-400">Select a feature flag to manage its gates.</p>
                )}
                {selectedFlag && (
                    <p className="mt-2 text-xs text-slate-500">{selectedFlag.name}</p>
                )}
            </div>

            {selectedFlag && rolloutAdvice && (
                <div className="card">
                    <div className="flex items-center justify-between">
                        <h3>AI Rollout Advisor</h3>
                        <span className="badge-gray">
                            {rolloutAdvice.activeGates} gates · {rolloutAdvice.linkedExperiments} experiments
                        </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{rolloutAdvice.headline}</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-300">
                        {rolloutAdvice.steps.map((step, idx) => (
                            <li key={idx}>• {step}</li>
                        ))}
                    </ul>
                </div>
            )}

            {showGateForm && selectedFlag && (
                <div className="card animate-slide-up bg-slate-950/60">
                    <h3 className="mb-4">Create Feature Gate</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="label">Gate Name</label>
                            <input
                                className="input"
                                value={gateForm.name}
                                onChange={(e) => setGateForm({ ...gateForm, name: e.target.value })}
                                placeholder="e.g., checkout_gate"
                            />
                        </div>
                        <div>
                            <label className="label">Status</label>
                            <select
                                className="input"
                                value={gateForm.status}
                                onChange={(e) => setGateForm({ ...gateForm, status: e.target.value as FeatureGateStatus })}
                            >
                                <option value={FeatureGateStatus.Active}>Active</option>
                                <option value={FeatureGateStatus.Inactive}>Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div className="mt-3">
                        <label className="label">Description</label>
                        <textarea
                            className="input"
                            rows={2}
                            value={gateForm.description}
                            onChange={(e) => setGateForm({ ...gateForm, description: e.target.value })}
                        />
                    </div>
                    <div className="mt-3">
                        <label className="label">Targeting Rule (JSON)</label>
                        <textarea
                            className="input font-mono text-sm"
                            rows={5}
                            value={gateForm.rule}
                            onChange={(e) => setGateForm({ ...gateForm, rule: e.target.value })}
                        />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={gateForm.pass_value}
                                onChange={(e) => setGateForm({ ...gateForm, pass_value: e.target.checked })}
                            />
                            Pass when rule matches
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={gateForm.default_value}
                                onChange={(e) => setGateForm({ ...gateForm, default_value: e.target.checked })}
                            />
                            Default pass when rule fails
                        </label>
                    </div>
                    <div className="mt-4 flex gap-2">
                        <button
                            onClick={onCreateGate}
                            className="btn-success"
                            disabled={isCreatePending}
                        >
                            Create Gate
                        </button>
                        <button onClick={onCloseGateForm} className="btn-secondary">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {selectedFlag && (
                <div className="space-y-3">
                    {selectedGates.length === 0 ? (
                        <div className="card text-center">
                            <p className="text-slate-400">No gates for this flag yet.</p>
                        </div>
                    ) : (
                        <div className="card feature-gate-table">
                            <div className="feature-gate-row border-b border-slate-800/70 px-4 py-2 text-sm font-bold text-slate-300">
                                <span>#</span>
                                <span>Name</span>
                                <span>Status</span>
                            </div>
                            <div className="divide-y divide-slate-800/70">
                                {selectedGates.map((gate, index) => (
                                    <div
                                        key={gate.id}
                                        className="table-row feature-gate-row px-4 py-2 text-sm leading-none text-slate-200"
                                        onClick={(event) => {
                                            const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                                            const shouldFlip = rect.left < 460;
                                            setGateTooltipSide(shouldFlip ? 'right' : 'left');
                                            setOpenGateDetailId((prev) => (prev === gate.id ? null : gate.id));
                                        }}
                                    >
                                        <span className="text-slate-400">{index + 1}</span>
                                        <span className="font-semibold text-slate-100">{gate.name}</span>
                                        <span
                                            className={`status-badge ${
                                                gate.status === FeatureGateStatus.Active ? 'status-badge--active' : 'status-badge--inactive'
                                            }`}
                                        >
                                            {gate.status.charAt(0).toUpperCase() + gate.status.slice(1)}
                                        </span>
                                        {openGateDetailId === gate.id && (
                                            <div
                                                className={`gate-tooltip ${gateTooltipSide === 'right' ? 'gate-tooltip--right' : ''}`}
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                <div className="gate-tooltip-header">
                                                    <span className="text-sm font-semibold text-slate-100">Feature Gate</span>
                                                    <button
                                                        type="button"
                                                        className="icon-action"
                                                        onClick={() => setOpenGateDetailId(null)}
                                                        aria-label="Close"
                                                    >
                                                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <div className="gate-tooltip-body">
                                                    <div>
                                                        <div className="label">Name</div>
                                                        <div className="text-slate-100">{gate.name}</div>
                                                    </div>
                                                    <div>
                                                        <div className="label">Status</div>
                                                        <div
                                                            className={`status-badge ${
                                                                gate.status === FeatureGateStatus.Active
                                                                    ? 'status-badge--active'
                                                                    : 'status-badge--inactive'
                                                            }`}
                                                        >
                                                            {gate.status.charAt(0).toUpperCase() + gate.status.slice(1)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="label">Description</div>
                                                        <div className="text-slate-100">{gate.description || '—'}</div>
                                                    </div>
                                                    <div>
                                                        <div className="label">Rule</div>
                                                        <pre className="input font-mono text-xs whitespace-pre-wrap">{gate.rule}</pre>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <div className="label">Pass value</div>
                                                            <div className="text-slate-100">{gate.pass_value ? 'True' : 'False'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="label">Default value</div>
                                                            <div className="text-slate-100">{gate.default_value ? 'True' : 'False'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

import React from 'react';
import { FeatureGateStatus, type CreateFeatureGateRequest, type FeatureFlag, type FeatureGate } from '../../types';

type RolloutAdvice = {
    headline: string;
    steps: string[];
    linkedExperiments: number;
    activeGates: number;
};

type FeatureGatePanelProps = {
    isOpen: boolean;
    onClose: () => void;
    selectedFlag: FeatureFlag | null;
    selectedGates: FeatureGate[];
    rolloutAdvice: RolloutAdvice | null;
    showGateForm: boolean;
    gateForm: CreateFeatureGateRequest;
    setGateForm: (value: CreateFeatureGateRequest) => void;
    openGateDetailId: string | null;
    setOpenGateDetailId: React.Dispatch<React.SetStateAction<string | null>>;
    onOpenGateForm: () => void;
    onCloseGateForm: () => void;
    onCreateGate: () => void;
    isCreatePending: boolean;
};

export const FeatureGatePanel: React.FC<FeatureGatePanelProps> = ({
    isOpen,
    onClose,
    selectedFlag,
    selectedGates,
    rolloutAdvice,
    showGateForm,
    gateForm,
    setGateForm,
    openGateDetailId,
    setOpenGateDetailId,
    onOpenGateForm,
    onCloseGateForm,
    onCreateGate,
    isCreatePending,
}) => {
    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-40 bg-slate-950/30 transition-opacity duration-300 ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className={`fixed top-0 right-0 z-50 h-full w-2/5 min-w-[440px] flex flex-col bg-slate-900 border-l border-slate-700/60 shadow-2xl transition-transform duration-300 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 shrink-0">
                    <div>
                        <p className="text-sm font-semibold text-slate-100">Feature Gates</p>
                        {selectedFlag && (
                            <p className="text-xs text-slate-400 mt-0.5 font-mono">{selectedFlag.name}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onOpenGateForm}
                            className="btn-secondary text-xs px-3 h-8"
                        >
                            + New Gate
                        </button>
                        <button
                            onClick={onClose}
                            className="btn-secondary h-8 w-8 p-0 flex items-center justify-center"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                    {!selectedFlag && (
                        <p className="text-sm text-slate-400">Select a feature flag to manage its gates.</p>
                    )}

                    {/* AI Rollout Advisor */}
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

                    {/* Gate create form */}
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

                    {/* Gates list */}
                    {selectedFlag && (
                        <div className="space-y-3">
                            {selectedGates.length === 0 ? (
                                <div className="card text-center">
                                    <p className="text-slate-400">No gates for this flag yet.</p>
                                </div>
                            ) : (
                                <div className="card overflow-hidden p-0">
                                    <div className="divide-y divide-slate-800/70">
                                        {selectedGates.map((gate, index) => {
                                            const isExpanded = openGateDetailId === gate.id;
                                            return (
                                                <div key={gate.id}>
                                                    {/* Row */}
                                                    <div
                                                        className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-800/30 transition-colors"
                                                        onClick={() => setOpenGateDetailId((prev) => (prev === gate.id ? null : gate.id))}
                                                    >
                                                        <span className="w-5 shrink-0 text-xs text-slate-500">{index + 1}</span>
                                                        <span className="flex-1 font-semibold text-slate-100 truncate">{gate.name}</span>
                                                        <span
                                                            className={`status-badge shrink-0 ${
                                                                gate.status === FeatureGateStatus.Active ? 'status-badge--active' : 'status-badge--inactive'
                                                            }`}
                                                        >
                                                            {gate.status.charAt(0).toUpperCase() + gate.status.slice(1)}
                                                        </span>
                                                        <svg
                                                            viewBox="0 0 24 24"
                                                            className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>

                                                    {/* Inline detail */}
                                                    {isExpanded && (
                                                        <div className="border-t border-slate-800/70 bg-slate-950/40 px-4 py-3 space-y-3">
                                                            <div>
                                                                <div className="label">Description</div>
                                                                <div className="text-slate-100 text-sm">{gate.description || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="label">Rule</div>
                                                                <pre className="input font-mono text-xs whitespace-pre-wrap mt-1">{gate.rule}</pre>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div>
                                                                    <div className="label">Pass value</div>
                                                                    <div className="text-slate-100 text-sm">{gate.pass_value ? 'True' : 'False'}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="label">Default value</div>
                                                                    <div className="text-slate-100 text-sm">{gate.default_value ? 'True' : 'False'}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

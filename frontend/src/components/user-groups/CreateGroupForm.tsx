import React, { useState } from 'react';
import type { DataSourceConfig, DataSourceType } from '../../types';
import { DataSourcePanel } from './DataSourcePanel';

type GroupFormData = {
    name: string;
    description: string;
    assignment_rule: string;
    data_source_type: DataSourceType;
    data_source_config: DataSourceConfig;
};

type CreateGroupFormProps = {
    formData: GroupFormData;
    rulePrompt: string;
    onRulePromptChange: (value: string) => void;
    onFormChange: (next: GroupFormData) => void;
    onCreate: () => void;
    onCancel: () => void;
    buildRuleFromText: (value: string) => string;
};

const STEPS = ['Basics', 'Assignment', 'Data Source', 'Review'];

const assignmentLabel = (rule: string): string => {
    if (rule === 'random') return 'Random Assignment';
    if (rule === 'hash') return 'Hash-Based (Consistent)';
    if (rule === 'manual') return 'Manual Assignment';
    if (rule.startsWith('{')) return 'Custom Rule (JSON)';
    return rule;
};

const dataSourceLabel = (type: DataSourceType): string => {
    switch (type) {
        case 'csv': return 'CSV Upload';
        case 'postgres_query': return 'PostgreSQL Query';
        case 'looker': return 'Looker';
        default: return 'None';
    }
};

export const CreateGroupForm: React.FC<CreateGroupFormProps> = ({
    formData,
    rulePrompt,
    onRulePromptChange,
    onFormChange,
    onCreate,
    onCancel,
    buildRuleFromText,
}) => {
    const [step, setStep] = useState(1);

    return (
        <div className="modal-overlay">
            <div className="modal-backdrop" onClick={onCancel} />
            <div className="modal-panel">
                <div className="modal-header">
                    <h3>New User Group</h3>
                    <button
                        type="button"
                        className="icon-action"
                        onClick={onCancel}
                        aria-label="Close"
                    >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            {/* Step indicator */}
            <div className="mb-6 flex justify-between">
                {STEPS.map((label, idx) => (
                    <div key={label} className="flex flex-1 items-start">
                        <div className="flex flex-col items-center">
                            <div
                                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                                    step > idx + 1
                                        ? 'bg-emerald-400 text-slate-900'
                                        : step === idx + 1
                                        ? 'bg-cyan-400 text-slate-900'
                                        : 'bg-slate-800 text-slate-400'
                                }`}
                            >
                                {step > idx + 1 ? '✓' : idx + 1}
                            </div>
                            <span className="mt-1 text-xs font-medium text-slate-300">{label}</span>
                        </div>
                        {idx < STEPS.length - 1 && (
                            <div
                                className={`mx-3 mt-4 h-1 flex-1 rounded-full ${
                                    step > idx + 1 ? 'bg-emerald-400/60' : 'bg-slate-700'
                                }`}
                            />
                        )}
                    </div>
                ))}
            </div>

            <h3 className="mb-4">
                {step === 1 && 'Basics'}
                {step === 2 && 'Assignment'}
                {step === 3 && 'Data Source'}
                {step === 4 && 'Review'}
            </h3>

            <div className="space-y-3">
                {/* Step 1: Basics */}
                {step === 1 && (
                    <>
                        <div>
                            <label className="label">Group Name</label>
                            <input
                                type="text"
                                className="input"
                                value={formData.name}
                                onChange={(e) => onFormChange({ ...formData, name: e.target.value })}
                                placeholder="e.g., Beta Users"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="label">Description</label>
                            <textarea
                                className="input"
                                rows={3}
                                value={formData.description}
                                onChange={(e) => onFormChange({ ...formData, description: e.target.value })}
                                placeholder="Describe this user group"
                            />
                        </div>
                    </>
                )}

                {/* Step 2: Assignment */}
                {step === 2 && (
                    <>
                        <div>
                            <label className="label">Assignment Mode</label>
                            <select
                                className="input"
                                value={formData.assignment_rule.startsWith('{') ? 'custom' : formData.assignment_rule}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'custom') {
                                        onFormChange({
                                            ...formData,
                                            assignment_rule: '{\n  "version": "1",\n  "conditions": []\n}',
                                        });
                                    } else {
                                        onFormChange({ ...formData, assignment_rule: val });
                                    }
                                }}
                            >
                                <option value="random">Random Assignment</option>
                                <option value="hash">Hash-Based (Consistent)</option>
                                <option value="manual">Manual Assignment</option>
                                <option value="custom">Custom Rule (JSON)</option>
                            </select>
                        </div>
                        <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-slate-400">AI Rule Copilot</p>
                                <span className="badge-gray">Draft JSON</span>
                            </div>
                            <p className="mt-2 text-sm text-slate-300">Describe your targeting rule in plain language.</p>
                            <div className="mt-3 flex flex-col gap-2">
                                <input
                                    type="text"
                                    className="input"
                                    value={rulePrompt}
                                    onChange={(e) => onRulePromptChange(e.target.value)}
                                    placeholder="e.g., Country is US and plan is enterprise"
                                />
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() =>
                                        onFormChange({ ...formData, assignment_rule: buildRuleFromText(rulePrompt) })
                                    }
                                >
                                    Generate JSON Rule
                                </button>
                            </div>
                        </div>
                        {(formData.assignment_rule.startsWith('{') || formData.assignment_rule === 'custom') && (
                            <div>
                                <label className="label">Rule Definition (JSON)</label>
                                <textarea
                                    className="input font-mono text-sm"
                                    rows={6}
                                    value={formData.assignment_rule}
                                    onChange={(e) => onFormChange({ ...formData, assignment_rule: e.target.value })}
                                    placeholder='{ "attribute": "email", "regex": ".*@google.com" }'
                                />
                            </div>
                        )}
                    </>
                )}

                {/* Step 3: Data Source */}
                {step === 3 && (
                    <DataSourcePanel
                        dataSourceType={formData.data_source_type}
                        dataSourceConfig={formData.data_source_config}
                        onChange={(type, config) =>
                            onFormChange({ ...formData, data_source_type: type, data_source_config: config })
                        }
                    />
                )}

                {/* Step 4: Review */}
                {step === 4 && (
                    <div className="space-y-3">
                        <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-4">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Group Info
                            </p>
                            <div className="space-y-2">
                                <div>
                                    <p className="text-xs text-slate-500">Name</p>
                                    <p className="text-sm font-medium text-slate-100">{formData.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Description</p>
                                    <p className="text-sm text-slate-300">{formData.description || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Assignment</p>
                                    <span className="badge-info text-xs">
                                        {assignmentLabel(formData.assignment_rule)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-4">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Data Source
                            </p>
                            <div className="space-y-2">
                                <div>
                                    <p className="text-xs text-slate-500">Type</p>
                                    <span className="badge-gray text-xs">{dataSourceLabel(formData.data_source_type)}</span>
                                </div>
                                {formData.data_source_type === 'csv' && (
                                    <div>
                                        <p className="text-xs text-slate-500">User IDs</p>
                                        <p className="text-sm text-slate-100">
                                            {(
                                                (formData.data_source_config as { user_ids?: string[] }).user_ids ?? []
                                            ).length.toLocaleString()}{' '}
                                            IDs loaded
                                        </p>
                                    </div>
                                )}
                                {formData.data_source_type === 'postgres_query' && (
                                    <div>
                                        <p className="text-xs text-slate-500">Query</p>
                                        <pre className="mt-1 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-300">
                                            {(formData.data_source_config as { query?: string }).query || '—'}
                                        </pre>
                                    </div>
                                )}
                                {formData.data_source_type === 'looker' && (
                                    <div>
                                        <p className="text-xs text-slate-500">API URL</p>
                                        <p className="text-sm text-slate-100">
                                            {(formData.data_source_config as { api_url?: string }).api_url || '—'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="mt-5 flex items-center justify-between">
                <div>
                    {step === 1 ? (
                        <button onClick={onCancel} className="btn-secondary">
                            Cancel
                        </button>
                    ) : (
                        <button onClick={() => setStep((s) => s - 1)} className="btn-secondary">
                            ← Previous
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {step < 4 ? (
                        <>
                            {step === 1 && formData.name.trim() === '' && (
                                <span className="text-xs text-slate-500">Name required</span>
                            )}
                            <button
                                onClick={() => setStep((s) => s + 1)}
                                className="btn-primary"
                                disabled={step === 1 && formData.name.trim() === ''}
                            >
                                Next →
                            </button>
                        </>
                    ) : (
                        <button onClick={onCreate} className="btn-success">
                            Create Group
                        </button>
                    )}
                </div>
            </div>
            </div>
        </div>
    );
};

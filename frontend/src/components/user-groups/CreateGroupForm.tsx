import React from 'react';

type GroupFormData = {
    name: string;
    description: string;
    assignment_rule: string;
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

export const CreateGroupForm: React.FC<CreateGroupFormProps> = ({
    formData,
    rulePrompt,
    onRulePromptChange,
    onFormChange,
    onCreate,
    onCancel,
    buildRuleFromText,
}) => {
    return (
        <div className="card animate-slide-up bg-slate-950/60">
            <h3 className="mb-4">New User Group</h3>
            <div className="space-y-3">
                <div>
                    <label className="label">Group Name</label>
                    <input
                        type="text"
                        className="input"
                        value={formData.name}
                        onChange={(e) => onFormChange({ ...formData, name: e.target.value })}
                        placeholder="e.g., Beta Users"
                    />
                </div>
                <div>
                    <label className="label">Description</label>
                    <textarea
                        className="input"
                        rows={2}
                        value={formData.description}
                        onChange={(e) => onFormChange({ ...formData, description: e.target.value })}
                        placeholder="Describe this user group"
                    />
                </div>
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
                            onClick={() => onFormChange({ ...formData, assignment_rule: buildRuleFromText(rulePrompt) })}
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
                <div className="flex gap-2">
                    <button onClick={onCreate} className="btn-success">
                        Create Group
                    </button>
                    <button onClick={onCancel} className="btn-secondary">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

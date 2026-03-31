import React from 'react';
import type { UserGroup } from '../../types';

type GroupFormData = {
    name: string;
    description: string;
    assignment_rule: string;
};

type SelectedGroupPanelProps = {
    selectedGroup: UserGroup;
    isEditing: boolean;
    editForm: GroupFormData;
    editRulePrompt: string;
    onToggleEdit: () => void;
    onDelete: () => void;
    onEditFormChange: (next: GroupFormData) => void;
    onEditRulePromptChange: (value: string) => void;
    onSave: () => void;
    onCancelEdit: () => void;
    buildRuleFromText: (value: string) => string;
};

export const SelectedGroupPanel: React.FC<SelectedGroupPanelProps> = ({
    selectedGroup,
    isEditing,
    editForm,
    editRulePrompt,
    onToggleEdit,
    onDelete,
    onEditFormChange,
    onEditRulePromptChange,
    onSave,
    onCancelEdit,
    buildRuleFromText,
}) => {
    return (
        <div className="card animate-fade-in">
            <div className="flex items-center justify-between">
                <h3>Selected Group: {selectedGroup.name}</h3>
                <div className="flex items-center gap-2">
                    <button onClick={onToggleEdit} className="btn-secondary">
                        {isEditing ? 'Close' : 'Edit'}
                    </button>
                    <button onClick={onDelete} className="btn-danger">
                        Delete
                    </button>
                </div>
            </div>

            {isEditing ? (
                <div className="mt-4 space-y-3">
                    <div>
                        <label className="label">Group Name</label>
                        <input
                            type="text"
                            className="input"
                            value={editForm.name}
                            onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="label">Description</label>
                        <textarea
                            className="input"
                            rows={2}
                            value={editForm.description}
                            onChange={(e) => onEditFormChange({ ...editForm, description: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="label">Assignment Mode</label>
                        <select
                            className="input"
                            value={editForm.assignment_rule.startsWith('{') ? 'custom' : editForm.assignment_rule}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom') {
                                    onEditFormChange({
                                        ...editForm,
                                        assignment_rule: '{\n  "version": "1",\n  "conditions": []\n}',
                                    });
                                } else {
                                    onEditFormChange({ ...editForm, assignment_rule: val });
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
                                value={editRulePrompt}
                                onChange={(e) => onEditRulePromptChange(e.target.value)}
                                placeholder="e.g., Email ends with @example.com"
                            />
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() =>
                                    onEditFormChange({ ...editForm, assignment_rule: buildRuleFromText(editRulePrompt) })
                                }
                            >
                                Generate JSON Rule
                            </button>
                        </div>
                    </div>
                    {(editForm.assignment_rule.startsWith('{') || editForm.assignment_rule === 'custom') && (
                        <div>
                            <label className="label">Rule Definition (JSON)</label>
                            <textarea
                                className="input font-mono text-sm"
                                rows={6}
                                value={editForm.assignment_rule}
                                onChange={(e) => onEditFormChange({ ...editForm, assignment_rule: e.target.value })}
                            />
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button onClick={onSave} className="btn-success">
                            Save Changes
                        </button>
                        <button onClick={onCancelEdit} className="btn-secondary">
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="mb-4 text-slate-300">{selectedGroup.description}</p>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <p className="text-sm text-slate-400">Total Users</p>
                            <p className="text-2xl font-bold text-slate-100">
                                {selectedGroup.size.toLocaleString()}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Created</p>
                            <p className="font-medium text-slate-100">
                                {new Date(selectedGroup.created_at).toLocaleDateString()}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Assignment Rule</p>
                            <p className="font-medium text-slate-100">{selectedGroup.assignment_rule}</p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <p className="mb-2 text-sm font-medium text-slate-400">
                            💡 Drag this group to move it between experiments (feature coming soon)
                        </p>
                    </div>
                </>
            )}
        </div>
    );
};

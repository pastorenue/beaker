import React from 'react';
import { FeatureFlagStatus, type FeatureFlag } from '../../types';

type FlagTableProps = {
    flags: FeatureFlag[];
    sortedFlags: FeatureFlag[];
    selectedFlag: FeatureFlag | null;
    flagSort: 'asc' | 'desc';
    editingFlagId: string | null;
    editForm: {
        name: string;
        description: string;
        status: FeatureFlagStatus;
        tagsInput: string;
        tags: string[];
        environment: string;
        owner: string;
        user_groups: string[];
        groupInput: string;
    };
    onToggleSort: () => void;
    onSelectFlag: (flag: FeatureFlag) => void;
    onStartEdit: (flag: FeatureFlag) => void;
    onSaveEdit: (flag: FeatureFlag) => void;
    onCancelEdit: () => void;
    onDelete: (flag: FeatureFlag) => void;
    onEditFormChange: (next: FlagTableProps['editForm']) => void;
    onAddTag: (value: string, setter: (tags: string[]) => void, current: string[]) => void;
    onRemoveTag: (value: string, setter: (tags: string[]) => void, current: string[]) => void;
};

export const FlagTable: React.FC<FlagTableProps> = ({
    flags,
    sortedFlags,
    selectedFlag,
    flagSort,
    editingFlagId,
    editForm,
    onToggleSort,
    onSelectFlag,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onDelete,
    onEditFormChange,
    onAddTag,
    onRemoveTag,
}) => {
    return (
        <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-800/60 text-left text-xs capitalize tracking-wide text-slate-500">
                        <th className="px-4 py-3">
                            <button type="button" onClick={onToggleSort} className="flex items-center gap-1">
                                Name
                                <span className="text-xs">{flagSort === 'asc' ? '▲' : '▼'}</span>
                            </button>
                        </th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Environment</th>
                        <th className="px-4 py-3">Owner</th>
                        <th className="px-4 py-3">Tags</th>
                        <th className="px-4 py-3">Updated</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                    {sortedFlags.length === 0 && (
                        <tr>
                            <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                                {flags.length === 0 ? 'No feature flags yet. Create your first flag.' : 'No flags match the current filters.'}
                            </td>
                        </tr>
                    )}
                    {sortedFlags.map((flag) => (
                        <tr
                            key={flag.id}
                            onClick={() => {
                                if (editingFlagId) return;
                                onSelectFlag(flag);
                            }}
                            className={`transition-colors hover:bg-slate-800/30 cursor-pointer ${
                                selectedFlag?.id === flag.id ? 'bg-slate-800/30' : ''
                            }`}
                        >
                            {/* Name */}
                            <td className="px-4 py-3">
                                {editingFlagId === flag.id ? (
                                    <input
                                        className="input h-8"
                                        value={editForm.name}
                                        onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
                                    />
                                ) : (
                                    <span className="font-semibold text-slate-100">{flag.name}</span>
                                )}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                                {editingFlagId === flag.id ? (
                                    <select
                                        className="input h-8"
                                        value={editForm.status}
                                        onChange={(e) =>
                                            onEditFormChange({ ...editForm, status: e.target.value as FeatureFlagStatus })
                                        }
                                    >
                                        <option value={FeatureFlagStatus.Active}>Active</option>
                                        <option value={FeatureFlagStatus.Inactive}>Inactive</option>
                                    </select>
                                ) : (
                                    <span
                                        className={`status-badge ${
                                            flag.status === FeatureFlagStatus.Active ? 'status-badge--active' : 'status-badge--inactive'
                                        }`}
                                    >
                                        {flag.status.charAt(0).toUpperCase() + flag.status.slice(1)}
                                    </span>
                                )}
                            </td>

                            {/* Environment */}
                            <td className="px-4 py-3 text-slate-300">
                                {editingFlagId === flag.id ? (
                                    <input
                                        className="input h-8"
                                        value={editForm.environment}
                                        onChange={(e) => onEditFormChange({ ...editForm, environment: e.target.value })}
                                    />
                                ) : (
                                    flag.environment || '—'
                                )}
                            </td>

                            {/* Owner */}
                            <td className="px-4 py-3 text-slate-300">
                                {editingFlagId === flag.id ? (
                                    <input
                                        className="input h-8"
                                        value={editForm.owner}
                                        onChange={(e) => onEditFormChange({ ...editForm, owner: e.target.value })}
                                    />
                                ) : (
                                    flag.owner || '—'
                                )}
                            </td>

                            {/* Tags */}
                            <td className="px-4 py-3 text-slate-300">
                                {editingFlagId === flag.id ? (
                                    <div className="chip-input chip-input--table">
                                        <div className="chip-list">
                                            {editForm.tags.map((tag) => (
                                                <span key={tag} className="chip">
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        className="chip-remove"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onRemoveTag(tag, (tags) => onEditFormChange({ ...editForm, tags }), editForm.tags);
                                                        }}
                                                        aria-label={`Remove ${tag}`}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <input
                                            className="input chip-input-field"
                                            value={editForm.tagsInput}
                                            onChange={(e) => onEditFormChange({ ...editForm, tagsInput: e.target.value })}
                                            onKeyDown={(e) => {
                                                if (e.key === ',' || e.key === 'Enter') {
                                                    e.preventDefault();
                                                    onAddTag(
                                                        editForm.tagsInput,
                                                        (tags) => onEditFormChange({ ...editForm, tags }),
                                                        editForm.tags,
                                                    );
                                                    onEditFormChange({ ...editForm, tagsInput: '' });
                                                }
                                            }}
                                            list="feature-flag-tags"
                                            placeholder="Add tag"
                                        />
                                    </div>
                                ) : (
                                    (flag.tags || []).length === 0 ? '—' : flag.tags.join(', ')
                                )}
                            </td>

                            {/* Updated */}
                            <td className="px-4 py-3 text-slate-400 text-xs">
                                {new Date(flag.updated_at).toLocaleDateString()}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                    {editingFlagId === flag.id ? (
                                        <>
                                            <button
                                                type="button"
                                                className="icon-action"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSaveEdit(flag);
                                                }}
                                                title="Save changes"
                                                aria-label="Save changes"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4L19 6" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-action"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onCancelEdit();
                                                }}
                                                title="Cancel edit"
                                                aria-label="Cancel edit"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="icon-action"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onStartEdit(flag);
                                                }}
                                                title="Edit flag"
                                                aria-label="Edit flag"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l2.651 2.651-9.193 9.193-3.535.884.884-3.535 9.193-9.193z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-action"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onDelete(flag);
                                                }}
                                                title="Delete flag"
                                                aria-label="Delete flag"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4h8v2" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l1 14h10l1-14" />
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

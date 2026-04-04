import React from 'react';
import type { UserGroup } from '../../types';

type GroupGridProps = {
    groups: UserGroup[];
    selectedGroupId: string | null;
    onSelectGroup: (group: UserGroup) => void;
};

const assignmentBadgeClass = (rule: string): string => {
    if (rule === 'random') return 'badge-info';
    if (rule === 'hash') return 'badge-gray';
    if (rule === 'manual') return 'badge-gray';
    if (rule.startsWith('{')) return 'badge-warning';
    return 'badge-gray';
};

const assignmentLabel = (rule: string): string => {
    if (rule === 'random') return 'Random';
    if (rule === 'hash') return 'Hash';
    if (rule === 'manual') return 'Manual';
    if (rule.startsWith('{')) return 'Custom';
    return rule;
};

const dataSourceBadgeClass = (type: string): string => {
    switch (type) {
        case 'csv': return 'badge-success';
        case 'postgres_query': return 'badge-info';
        case 'looker': return 'badge-warning';
        default: return 'badge-gray';
    }
};

const dataSourceLabel = (type: string): string => {
    switch (type) {
        case 'csv': return 'CSV';
        case 'postgres_query': return 'PostgreSQL';
        case 'looker': return 'Looker';
        default: return 'None';
    }
};

export const GroupGrid: React.FC<GroupGridProps> = ({ groups, selectedGroupId, onSelectGroup }) => {
    if (groups.length === 0) return null;

    return (
        <div className="overflow-hidden rounded-xl border-slate-800/20">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-800/70 bg-slate-900/60">
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-400">
                            Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-400">
                            ID
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-slate-400">
                            Users
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-400">
                            Assignment
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-400">
                            Data Source
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-400">
                            Created
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {groups.map((group) => (
                        <tr
                            key={group.id}
                            className={`cursor-pointer border-b border-slate-800/40 transition-colors hover:bg-sky-400/10 ${
                                selectedGroupId === group.id ? 'bg-slate-800/50' : ''
                            }`}
                            onClick={() => onSelectGroup(group)}
                        >
                            <td className="px-4 py-3 font-medium text-slate-100">{group.name}</td>
                            <td
                                className="px-4 py-3 font-mono text-xs text-slate-500"
                                title={group.id}
                            >
                                {group.id.slice(0, 8) + '…'}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-200">
                                {group.size.toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                                <span className={assignmentBadgeClass(group.assignment_rule)}>
                                    {assignmentLabel(group.assignment_rule)}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <span className={dataSourceBadgeClass(group.data_source_type)}>
                                    {dataSourceLabel(group.data_source_type)}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                                {new Date(group.created_at).toLocaleDateString()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

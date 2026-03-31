import React from 'react';
import type { UserGroup } from '../../types';

type GroupGridProps = {
    groups: UserGroup[];
    selectedGroupId: string | null;
    onSelectGroup: (group: UserGroup) => void;
};

export const GroupGrid: React.FC<GroupGridProps> = ({ groups, selectedGroupId, onSelectGroup }) => {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
                <div
                    key={group.id}
                    className={`card cursor-pointer transition-all ${
                        selectedGroupId === group.id ? 'ring-2 ring-cyan-400/70' : ''
                    } `}
                    onClick={() => onSelectGroup(group)}
                >
                    <h3 className="mb-2">{group.name}</h3>
                    <p className="mb-3 text-sm text-slate-400">{group.description}</p>
                    <div className="flex items-center justify-between soft-divider pt-3">
                        <div>
                            <p className="text-xs text-slate-500">Users</p>
                            <p className="text-lg font-bold text-slate-100">{group.size.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">Assignment</p>
                            <p className="badge-info text-xs">{group.assignment_rule}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

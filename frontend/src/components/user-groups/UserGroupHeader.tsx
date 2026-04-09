import React from 'react';

type UserGroupHeaderProps = {
    onToggleCreate: () => void;
};

export const UserGroupHeader: React.FC<UserGroupHeaderProps> = ({ onToggleCreate }) => {
    return (
        <div className="flex items-center justify-between">
            <h2 className="text-3xl font-medium text-slate-100">User Groups</h2>
            <button onClick={onToggleCreate} className="btn-primary">
                + Create User Group
            </button>
        </div>
    );
};

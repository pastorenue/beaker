
import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DataSourceConfig, DataSourceType, UserGroup } from '../types';
import { userGroupApi } from '../services/api';
import { CreateGroupForm } from './user-groups/CreateGroupForm';
import { EmptyGroupState } from './user-groups/EmptyGroupState';
import { GroupGrid } from './user-groups/GroupGrid';
import { GroupDetailDrawer } from './user-groups/GroupDetailDrawer';
import { UserGroupHeader } from './user-groups/UserGroupHeader';
import { LoadingSpinner } from './Common';
import { useAccount } from '../contexts/AccountContext';

type GroupFormData = {
    name: string;
    description: string;
    assignment_rule: string;
    data_source_type: DataSourceType;
    data_source_config: DataSourceConfig;
};

const emptyFormData: GroupFormData = {
    name: '',
    description: '',
    assignment_rule: 'random',
    data_source_type: 'none' as DataSourceType,
    data_source_config: {} as DataSourceConfig,
};

export const UserGroupManager: React.FC = () => {
    const { activeAccountId } = useAccount();
    const queryClient = useQueryClient();
    const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [rulePrompt, setRulePrompt] = useState('');
    const [editRulePrompt, setEditRulePrompt] = useState('');
    const [formData, setFormData] = useState<GroupFormData>(emptyFormData);
    const [editForm, setEditForm] = useState<GroupFormData>(emptyFormData);

    const { data: groups = [], isLoading } = useQuery({
        queryKey: ['userGroups', activeAccountId],
        queryFn: async () => {
            const response = await userGroupApi.list();
            return response.data;
        },
        enabled: !!activeAccountId,
    });

    const createMutation = useMutation({
        mutationFn: userGroupApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['userGroups', activeAccountId] });
            setShowCreateForm(false);
            setFormData(emptyFormData);
        },
    });

    const syncMutation = useMutation({
        mutationFn: async (groupId: string) => {
            const response = await userGroupApi.sync(groupId);
            return response.data;
        },
        onSuccess: (syncResponse) => {
            queryClient.setQueryData<UserGroup[]>(['userGroups', activeAccountId], (oldData) => {
                const existing = Array.isArray(oldData) ? oldData : [];
                return existing.map((item: UserGroup) =>
                    item.id === syncResponse.group_id
                        ? { ...item, size: syncResponse.synced_user_count }
                        : item,
                );
            });
            if (selectedGroup?.id === syncResponse.group_id) {
                setSelectedGroup((prev) =>
                    prev ? { ...prev, size: syncResponse.synced_user_count } : prev,
                );
            }
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: typeof editForm }) => {
            const response = await userGroupApi.update(id, data);
            return response.data;
        },
        onSuccess: (group) => {
            queryClient.setQueryData<UserGroup[]>(['userGroups', activeAccountId], (oldData) => {
                const existing = Array.isArray(oldData) ? oldData : [];
                return existing.map((item: UserGroup) => (item.id === group.id ? group : item));
            });
            setSelectedGroup(group);
            setIsEditing(false);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await userGroupApi.delete(id);
            return id;
        },
        onSuccess: (id) => {
            queryClient.setQueryData<UserGroup[]>(['userGroups', activeAccountId], (oldData) => {
                const existing = Array.isArray(oldData) ? oldData : [];
                return existing.filter((item: UserGroup) => item.id !== id);
            });
            if (selectedGroup?.id === id) {
                setSelectedGroup(null);
            }
            setIsEditing(false);
        },
    });

    const handleCreate = () => {
        createMutation.mutate(formData);
    };

    const buildRuleFromText = (text: string) => {
        const normalized = text.trim().toLowerCase();
        const conditions: Array<{ attribute: string; op: string; value: string | number }> = [];

        const countryMatch = normalized.match(/country\s*(is|=)\s*([a-z]+)/i);
        if (countryMatch) {
            conditions.push({ attribute: 'country', op: 'eq', value: countryMatch[2].toUpperCase() });
        }

        const emailMatch = normalized.match(/email\s*(ends with|domain)\s*(@?[a-z0-9.-]+)/i);
        if (emailMatch) {
            const domain = emailMatch[2].startsWith('@') ? emailMatch[2] : `@${emailMatch[2]}`;
            conditions.push({ attribute: 'email', op: 'regex', value: `.*\\${domain}$` });
        }

        const planMatch = normalized.match(/plan\s*(is|=)\s*([a-z0-9_-]+)/i);
        if (planMatch) {
            conditions.push({ attribute: 'plan', op: 'eq', value: planMatch[2] });
        }

        const regionMatch = normalized.match(/region\s*(is|=)\s*([a-z0-9_-]+)/i);
        if (regionMatch) {
            conditions.push({ attribute: 'region', op: 'eq', value: regionMatch[2] });
        }

        const ageMatch = normalized.match(/age\s*(>=|<=|>|<)\s*(\d+)/i);
        if (ageMatch) {
            conditions.push({ attribute: 'age', op: ageMatch[1], value: Number(ageMatch[2]) });
        }

        if (conditions.length === 0) {
            conditions.push({ attribute: 'attribute', op: 'eq', value: 'value' });
        }

        return JSON.stringify({ version: '1', conditions }, null, 2);
    };

    const handleUpdate = () => {
        if (!selectedGroup) return;
        updateMutation.mutate({
            id: selectedGroup.id,
            data: {
                name: editForm.name,
                description: editForm.description,
                assignment_rule: editForm.assignment_rule,
                data_source_type: editForm.data_source_type,
                data_source_config: editForm.data_source_config,
            },
        });
    };

    const handleDelete = (groupId: string) => {
        if (!window.confirm('Delete this user group? This cannot be undone.')) return;
        deleteMutation.mutate(groupId);
    };

    useEffect(() => {
        if (!selectedGroup) return;
        setEditForm({
            name: selectedGroup.name,
            description: selectedGroup.description,
            assignment_rule: selectedGroup.assignment_rule,
            data_source_type: selectedGroup.data_source_type ?? 'none',
            data_source_config: selectedGroup.data_source_config ?? {},
        });
    }, [selectedGroup]);

    if (isLoading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="space-y-0">
            <UserGroupHeader onToggleCreate={() => setShowCreateForm(!showCreateForm)} />

            {showCreateForm && (
                <CreateGroupForm
                    formData={formData}
                    rulePrompt={rulePrompt}
                    onRulePromptChange={setRulePrompt}
                    onFormChange={setFormData}
                    onCreate={handleCreate}
                    onCancel={() => setShowCreateForm(false)}
                    buildRuleFromText={buildRuleFromText}
                />
            )}

            <GroupGrid
                groups={groups}
                selectedGroupId={selectedGroup?.id ?? null}
                onSelectGroup={setSelectedGroup}
            />

            <GroupDetailDrawer
                selectedGroup={selectedGroup}
                isOpen={!!selectedGroup}
                onClose={() => { setSelectedGroup(null); setIsEditing(false); }}
                isEditing={isEditing}
                editForm={editForm}
                editRulePrompt={editRulePrompt}
                onToggleEdit={() => setIsEditing((prev) => !prev)}
                onDelete={() => handleDelete(selectedGroup?.id ?? '')}
                onEditFormChange={setEditForm}
                onEditRulePromptChange={setEditRulePrompt}
                onSave={handleUpdate}
                onCancelEdit={() => setIsEditing(false)}
                onSync={(groupId) => syncMutation.mutate(groupId)}
                buildRuleFromText={buildRuleFromText}
            />

            <EmptyGroupState hasGroups={groups.length > 0} showCreateForm={showCreateForm} />
        </div>
    );
};

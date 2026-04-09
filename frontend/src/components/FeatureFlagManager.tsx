import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateFlagModal } from './feature-flags/CreateFlagModal';
import { FeatureGatePanel } from './feature-flags/FeatureGatePanel';
import { FeatureFlagHeader } from './feature-flags/FeatureFlagHeader';
import { FlagFilters } from './feature-flags/FlagFilters';
import { FlagTable } from './feature-flags/FlagTable';
import {
    CreateFeatureFlagRequest,
    CreateFeatureGateRequest,
    FeatureFlag,
    FeatureGate,
    FeatureFlagStatus,
    FeatureGateStatus,
    UserGroup,
    Experiment,
} from '../types';
import { featureFlagApi, featureGateApi, userGroupApi, experimentApi } from '../services/api';
import { LoadingSpinner } from './Common';
import { useAccount } from '../contexts/AccountContext';

const emptyFlag: CreateFeatureFlagRequest = {
    name: '',
    description: '',
    status: FeatureFlagStatus.Active,
    tags: [],
    environment: '',
    owner: '',
    user_groups: [],
};

const emptyGate: CreateFeatureGateRequest = {
    flag_id: '',
    name: '',
    description: '',
    status: FeatureGateStatus.Active,
    rule: '{\n  "version": "1",\n  "conditions": []\n}',
    default_value: false,
    pass_value: true,
};

export const FeatureFlagManager: React.FC = () => {
    const { activeAccountId } = useAccount();
    const queryClient = useQueryClient();
    const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
    const [showFlagForm, setShowFlagForm] = useState(false);
    const [showGateForm, setShowGateForm] = useState(false);
    const [openGateDetailId, setOpenGateDetailId] = useState<string | null>(null);
    const [gateTooltipSide, setGateTooltipSide] = useState<'left' | 'right'>('left');
    const [flagForm, setFlagForm] = useState<CreateFeatureFlagRequest>({ ...emptyFlag });
    const [tagInput, setTagInput] = useState('');
    const [groupInput, setGroupInput] = useState('');
    const [gateForm, setGateForm] = useState<CreateFeatureGateRequest>({ ...emptyGate });
    const [flagSort, setFlagSort] = useState<'asc' | 'desc'>('asc');
    const [editingFlagId, setEditingFlagId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        name: '',
        description: '',
        status: FeatureFlagStatus.Active,
        tagsInput: '',
        tags: [] as string[],
        environment: '',
        owner: '',
        user_groups: [] as string[],
        groupInput: '',
    });
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
    const [filterTags, setFilterTags] = useState('');
    const [filterEnvironment, setFilterEnvironment] = useState('');
    const [filterOwner, setFilterOwner] = useState('');

    const { data: flags = [], isLoading: flagsLoading } = useQuery({
        queryKey: ['featureFlags', activeAccountId],
        queryFn: async () => (await featureFlagApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: gates = [], isLoading: gatesLoading } = useQuery({
        queryKey: ['featureGates', activeAccountId],
        queryFn: async () => (await featureGateApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: userGroups = [] } = useQuery({
        queryKey: ['userGroups', activeAccountId],
        queryFn: async () => (await userGroupApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments', activeAccountId],
        queryFn: async () => (await experimentApi.list()).data,
        enabled: !!activeAccountId,
    });

    const createFlag = useMutation({
        mutationFn: (data: CreateFeatureFlagRequest) => featureFlagApi.create(data),
        onSuccess: (response) => {
            queryClient.setQueryData<FeatureFlag[]>(['featureFlags', activeAccountId], (oldData) => {
                const existing = Array.isArray(oldData) ? oldData : [];
                return [response.data, ...existing];
            });
            setShowFlagForm(false);
            setFlagForm({ ...emptyFlag });
            setTagInput('');
        },
    });

    const updateFlag = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<CreateFeatureFlagRequest> }) =>
            featureFlagApi.update(id, data),
        onSuccess: (response) => {
            queryClient.setQueryData<FeatureFlag[]>(['featureFlags', activeAccountId], (oldData) => {
                const existing = Array.isArray(oldData) ? oldData : [];
                return existing.map((item: FeatureFlag) => (item.id === response.data.id ? response.data : item));
            });
            setEditingFlagId(null);
        },
    });

    const deleteFlag = useMutation({
        mutationFn: (id: string) => featureFlagApi.delete(id),
        onSuccess: (_, id) => {
            queryClient.setQueryData<FeatureFlag[]>(['featureFlags', activeAccountId], (oldData) => {
                const existing = Array.isArray(oldData) ? oldData : [];
                return existing.filter((item: FeatureFlag) => item.id !== id);
            });
            if (selectedFlag?.id === id) {
                setSelectedFlag(null);
            }
        },
    });

    const createGate = useMutation({
        mutationFn: (data: CreateFeatureGateRequest) => featureGateApi.create(data),
        onSuccess: (response) => {
            queryClient.setQueryData<FeatureGate[]>(['featureGates', activeAccountId], (oldData) => {
                const existing = Array.isArray(oldData) ? oldData : [];
                return [response.data, ...existing];
            });
            setShowGateForm(false);
            setGateForm({ ...emptyGate, flag_id: selectedFlag?.id || '' });
        },
    });

    const selectedGates = useMemo(() => {
        if (!selectedFlag) return [] as FeatureGate[];
        return gates.filter((gate) => gate.flag_id === selectedFlag.id);
    }, [gates, selectedFlag]);

    const rolloutAdvice = useMemo(() => {
        if (!selectedFlag) return null;
        const linkedExperiments = experiments.filter(
            (experiment: Experiment) => experiment.feature_flag_id === selectedFlag.id,
        ).length;
        const activeGates = selectedGates.filter((gate) => gate.status === FeatureGateStatus.Active).length;

        const steps: string[] = [];
        if (selectedFlag.status === FeatureFlagStatus.Inactive) {
            steps.push('Start with a 5% rollout to a controlled segment.');
            steps.push('Add guardrails for error rate and latency before scaling.');
        } else {
            steps.push('Ramp gradually (10% → 25% → 50% → 100%) while monitoring SRM and guardrails.');
        }
        if (activeGates === 0) {
            steps.push('Create at least one active gate to control exposure.');
        }
        if (linkedExperiments === 0) {
            steps.push('Run an experiment linked to this flag to quantify lift and risk.');
        }

        return {
            headline: selectedFlag.status === FeatureFlagStatus.Active ? 'Flag is active' : 'Flag is inactive',
            steps,
            linkedExperiments,
            activeGates,
        };
    }, [experiments, selectedFlag, selectedGates]);

    const tagOptions = useMemo(() => {
        const tagSet = new Set<string>();
        flags.forEach((flag) => (flag.tags || []).forEach((tag) => tagSet.add(tag)));
        return Array.from(tagSet).sort();
    }, [flags]);

    const environmentOptions = useMemo(() => {
        const envSet = new Set<string>();
        flags.forEach((flag) => {
            if (flag.environment) envSet.add(flag.environment);
        });
        return Array.from(envSet).sort();
    }, [flags]);

    const ownerOptions = useMemo(() => {
        const ownerSet = new Set<string>();
        flags.forEach((flag) => {
            if (flag.owner) ownerSet.add(flag.owner);
        });
        return Array.from(ownerSet).sort();
    }, [flags]);

    const filteredFlags = useMemo(() => {
        return flags.filter((flag) => {
            const matchesStatus =
                filterStatus === 'all' ? true : filterStatus === 'active' ? flag.status === FeatureFlagStatus.Active : flag.status === FeatureFlagStatus.Inactive;
            const matchesTags = filterTags
                ? (flag.tags || []).some((tag) => tag.toLowerCase().includes(filterTags.toLowerCase()))
                : true;
            const matchesEnvironment = filterEnvironment
                ? (flag.environment || '').toLowerCase().includes(filterEnvironment.toLowerCase())
                : true;
            const matchesOwner = filterOwner ? (flag.owner || '').toLowerCase().includes(filterOwner.toLowerCase()) : true;
            return matchesStatus && matchesTags && matchesEnvironment && matchesOwner;
        });
    }, [flags, filterStatus, filterTags, filterEnvironment, filterOwner]);

    const sortedFlags = useMemo(() => {
        const data = [...filteredFlags];
        data.sort((a, b) => a.name.localeCompare(b.name));
        if (flagSort === 'desc') data.reverse();
        return data;
    }, [filteredFlags, flagSort]);

    const toggleFlagSort = () => {
        setFlagSort((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    };

    const userGroupById = useMemo(() => {
        const map = new Map<string, UserGroup>();
        userGroups.forEach((group) => map.set(group.id, group));
        return map;
    }, [userGroups]);

    const userGroupByName = useMemo(() => {
        const map = new Map<string, UserGroup>();
        userGroups.forEach((group) => map.set(group.name.toLowerCase(), group));
        return map;
    }, [userGroups]);

    const startEditFlag = (flag: FeatureFlag) => {
        setEditingFlagId(flag.id);
        setEditForm({
            name: flag.name,
            description: flag.description,
            status: flag.status,
            tagsInput: '',
            tags: flag.tags || [],
            environment: flag.environment || '',
            owner: flag.owner || '',
            user_groups: flag.user_groups || [],
            groupInput: '',
        });
    };

    const saveEditFlag = (flag: FeatureFlag) => {
        updateFlag.mutate({
            id: flag.id,
            data: {
                name: editForm.name,
                description: editForm.description,
                status: editForm.status,
                tags: editForm.tags,
                environment: editForm.environment,
                owner: editForm.owner,
                user_groups: editForm.user_groups,
            },
        });
    };

    const addTagChip = (value: string, setter: (tags: string[]) => void, current: string[]) => {
        const next = value.trim();
        if (!next) return;
        if (current.includes(next)) return;
        setter([...current, next]);
    };

    const removeTagChip = (value: string, setter: (tags: string[]) => void, current: string[]) => {
        setter(current.filter((tag) => tag !== value));
    };

    const addGroupChip = (value: string, setter: (groups: string[]) => void, current: string[]) => {
        const next = value.trim();
        if (!next) return;
        let groupId = next;
        const match = userGroupByName.get(next.toLowerCase());
        if (match) {
            groupId = match.id;
        } else if (!userGroupById.get(next)) {
            return;
        }
        if (current.includes(groupId)) return;
        setter([...current, groupId]);
    };

    const removeGroupChip = (value: string, setter: (groups: string[]) => void, current: string[]) => {
        setter(current.filter((groupId) => groupId !== value));
    };

    if (flagsLoading || gatesLoading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="space-y-0">
            <FeatureFlagHeader onCreate={() => setShowFlagForm((prev) => !prev)} />

            {showFlagForm && (
                <CreateFlagModal
                    flagForm={flagForm}
                    setFlagForm={setFlagForm}
                    tagInput={tagInput}
                    setTagInput={setTagInput}
                    groupInput={groupInput}
                    setGroupInput={setGroupInput}
                    userGroups={userGroups}
                    userGroupById={userGroupById}
                    onClose={() => setShowFlagForm(false)}
                    onCreate={() => createFlag.mutate({ ...flagForm })}
                    isPending={createFlag.isPending}
                    addTagChip={addTagChip}
                    removeTagChip={removeTagChip}
                    addGroupChip={addGroupChip}
                    removeGroupChip={removeGroupChip}
                />
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.8fr_1fr]">
                <div className="space-y-4">
                    <FlagFilters
                        filterStatus={filterStatus}
                        filterTags={filterTags}
                        filterEnvironment={filterEnvironment}
                        filterOwner={filterOwner}
                        tagOptions={tagOptions}
                        environmentOptions={environmentOptions}
                        ownerOptions={ownerOptions}
                        onFilterStatusChange={setFilterStatus}
                        onFilterTagsChange={setFilterTags}
                        onFilterEnvironmentChange={setFilterEnvironment}
                        onFilterOwnerChange={setFilterOwner}
                        onReset={() => {
                            setFilterStatus('all');
                            setFilterTags('');
                            setFilterEnvironment('');
                            setFilterOwner('');
                        }}
                    />
                    <FlagTable
                        flags={flags}
                        sortedFlags={sortedFlags}
                        selectedFlag={selectedFlag}
                        flagSort={flagSort}
                        editingFlagId={editingFlagId}
                        editForm={editForm}
                        userGroupById={userGroupById}
                        onToggleSort={toggleFlagSort}
                        onSelectFlag={(flag) => {
                            setSelectedFlag(flag);
                            setGateForm({ ...emptyGate, flag_id: flag.id });
                        }}
                        onStartEdit={startEditFlag}
                        onSaveEdit={saveEditFlag}
                        onCancelEdit={() => setEditingFlagId(null)}
                        onDelete={(flag) => {
                            if (window.confirm(`Delete ${flag.name}?`)) {
                                deleteFlag.mutate(flag.id);
                            }
                        }}
                        onEditFormChange={setEditForm}
                        onAddTag={addTagChip}
                        onRemoveTag={removeTagChip}
                        onAddGroup={addGroupChip}
                        onRemoveGroup={removeGroupChip}
                    />
                </div>

                <FeatureGatePanel
                    selectedFlag={selectedFlag}
                    selectedGates={selectedGates}
                    rolloutAdvice={rolloutAdvice}
                    showGateForm={showGateForm}
                    gateForm={gateForm}
                    setGateForm={setGateForm}
                    openGateDetailId={openGateDetailId}
                    gateTooltipSide={gateTooltipSide}
                    setGateTooltipSide={setGateTooltipSide}
                    setOpenGateDetailId={setOpenGateDetailId}
                    onOpenGateForm={() => {
                        if (!selectedFlag && flags.length > 0) {
                            setSelectedFlag(flags[0]);
                            setGateForm({ ...emptyGate, flag_id: flags[0].id });
                        }
                        setShowGateForm(true);
                    }}
                    onCloseGateForm={() => setShowGateForm(false)}
                    onCreateGate={() => {
                        if (!selectedFlag) return;
                        createGate.mutate({ ...gateForm, flag_id: selectedFlag.id });
                    }}
                    isCreatePending={createGate.isPending}
                />
            </div>
            <datalist id="feature-flag-user-groups">
                {userGroups.map((group) => (
                    <option key={group.id} value={group.name} />
                ))}
            </datalist>
        </div>
    );
};

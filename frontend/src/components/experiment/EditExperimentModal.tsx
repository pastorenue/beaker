import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Experiment, UpdateExperimentRequest, Hypothesis, Variant } from '../../types';
import { ExperimentStatus, MetricType } from '../../types';
import { userGroupApi } from '../../services/api';
import { useAccount } from '../../contexts/AccountContext';

interface Props {
    experiment: Experiment;
    onClose: () => void;
    onSave: (req: UpdateExperimentRequest) => void;
    isPending: boolean;
}

export function EditExperimentModal({ experiment, onClose, onSave, isPending }: Props) {
    const { activeAccountId } = useAccount();
    const isDraft = experiment.status === ExperimentStatus.Draft;

    const [name, setName] = React.useState(experiment.name);
    const [description, setDescription] = React.useState(experiment.description);
    const [primaryMetric, setPrimaryMetric] = React.useState(experiment.primary_metric);
    const [endDate, setEndDate] = React.useState(
        experiment.end_date ? new Date(experiment.end_date).toISOString().split('T')[0] : ''
    );
    const [requiresExistingUsers, setRequiresExistingUsers] = React.useState(
        experiment.requires_existing_users
    );
    const [userGroups, setUserGroups] = React.useState<string[]>(experiment.user_groups);
    const [variants, setVariants] = React.useState<Variant[]>(experiment.variants);
    const [hypothesis, setHypothesis] = React.useState<Hypothesis>(
        experiment.hypothesis ?? {
            null_hypothesis: '',
            alternative_hypothesis: '',
            expected_effect_size: 0.05,
            metric_type: MetricType.Proportion,
            significance_level: 0.05,
            power: 0.8,
        }
    );

    const { data: availableGroups = [] } = useQuery({
        queryKey: ['userGroups', activeAccountId],
        queryFn: async () => (await userGroupApi.list()).data,
        enabled: !!activeAccountId,
    });

    const totalAllocation = variants.reduce((sum, v) => sum + v.allocation_percent, 0);
    const allocationValid = Math.abs(totalAllocation - 100) < 0.01;
    const controlValid = variants.filter(v => v.is_control).length === 1;

    const updateVariant = (idx: number, field: keyof Variant, value: string | number | boolean) => {
        setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isDraft && (!allocationValid || !controlValid)) return;
        onSave({
            name,
            description,
            primary_metric: primaryMetric,
            end_date: endDate ? `${endDate}T00:00:00Z` : undefined,
            requires_existing_users: requiresExistingUsers,
            user_groups: userGroups,
            variants,
            hypothesis,
            health_checks: experiment.health_checks,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
                    <h3 className="text-lg font-medium text-slate-100">Edit Experiment</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        aria-label="Close"
                    >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

                        {/* Basics */}
                        <section className="space-y-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Basics</h4>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                    Name <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    required
                                    className="input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={3}
                                    className="input w-full resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                        Primary Metric <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={primaryMetric}
                                        onChange={e => setPrimaryMetric(e.target.value)}
                                        required
                                        className="input w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                        className="input w-full"
                                    />
                                </div>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={requiresExistingUsers}
                                    onChange={e => setRequiresExistingUsers(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                                />
                                <span className="text-sm text-slate-300">Require existing users only</span>
                            </label>
                        </section>

                        {/* User Groups */}
                        {availableGroups.length > 0 && (
                            <section className="space-y-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">User Groups</h4>
                                <div className="flex flex-wrap gap-2">
                                    {availableGroups.map(group => (
                                        <button
                                            key={group.id}
                                            type="button"
                                            onClick={() => setUserGroups(prev =>
                                                prev.includes(group.id)
                                                    ? prev.filter(id => id !== group.id)
                                                    : [...prev, group.id]
                                            )}
                                            className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                                                userGroups.includes(group.id)
                                                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                                    : 'border-slate-700/60 text-slate-400 hover:text-slate-300'
                                            }`}
                                        >
                                            {group.name}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Variants — draft only */}
                        {isDraft && (
                            <section className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variants</h4>
                                    <span className={`text-xs ${allocationValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {totalAllocation.toFixed(1)}% allocated
                                    </span>
                                </div>
                                {!controlValid && (
                                    <p className="text-xs text-rose-400">Exactly one variant must be marked as control.</p>
                                )}
                                <div className="space-y-2">
                                    {variants.map((variant, idx) => (
                                        <div
                                            key={idx}
                                            className="grid items-center gap-2 rounded-lg border border-slate-800/60 px-3 py-2"
                                            style={{ gridTemplateColumns: '1fr 80px auto auto' }}
                                        >
                                            <input
                                                type="text"
                                                value={variant.name}
                                                onChange={e => updateVariant(idx, 'name', e.target.value)}
                                                placeholder="Name"
                                                className="input text-sm"
                                                required
                                            />
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={variant.allocation_percent}
                                                    onChange={e => updateVariant(idx, 'allocation_percent', parseFloat(e.target.value) || 0)}
                                                    min={0}
                                                    max={100}
                                                    step={0.1}
                                                    className="input text-sm w-full pr-5"
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span>
                                            </div>
                                            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer whitespace-nowrap">
                                                <input
                                                    type="radio"
                                                    name="control_variant"
                                                    checked={variant.is_control}
                                                    onChange={() => setVariants(prev =>
                                                        prev.map((v, i) => ({ ...v, is_control: i === idx }))
                                                    )}
                                                    className="h-3.5 w-3.5"
                                                />
                                                Control
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => variants.length > 2 && setVariants(prev => prev.filter((_, i) => i !== idx))}
                                                disabled={variants.length <= 2}
                                                className="text-slate-600 hover:text-rose-400 disabled:opacity-30 transition-colors"
                                                aria-label="Remove variant"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setVariants(prev => [...prev, {
                                        name: `Variant ${prev.length + 1}`,
                                        description: '',
                                        allocation_percent: 0,
                                        is_control: false,
                                    }])}
                                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                >
                                    + Add variant
                                </button>
                            </section>
                        )}

                        {/* Hypothesis — draft only */}
                        {isDraft && (
                            <section className="space-y-3">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hypothesis</h4>
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                        Null Hypothesis
                                    </label>
                                    <textarea
                                        value={hypothesis.null_hypothesis}
                                        onChange={e => setHypothesis(prev => ({ ...prev, null_hypothesis: e.target.value }))}
                                        rows={2}
                                        className="input w-full resize-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                        Alternative Hypothesis
                                    </label>
                                    <textarea
                                        value={hypothesis.alternative_hypothesis}
                                        onChange={e => setHypothesis(prev => ({ ...prev, alternative_hypothesis: e.target.value }))}
                                        rows={2}
                                        className="input w-full resize-none text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                            Metric Type
                                        </label>
                                        <select
                                            value={hypothesis.metric_type}
                                            onChange={e => setHypothesis(prev => ({ ...prev, metric_type: e.target.value as MetricType }))}
                                            className="input w-full"
                                        >
                                            <option value={MetricType.Proportion}>Proportion</option>
                                            <option value={MetricType.Continuous}>Continuous</option>
                                            <option value={MetricType.Count}>Count</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                            Expected Effect Size
                                        </label>
                                        <input
                                            type="number"
                                            value={hypothesis.expected_effect_size}
                                            onChange={e => setHypothesis(prev => ({ ...prev, expected_effect_size: parseFloat(e.target.value) || 0 }))}
                                            step={0.01}
                                            min={0}
                                            max={1}
                                            className="input w-full"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                            Significance Level (α)
                                        </label>
                                        <input
                                            type="number"
                                            value={hypothesis.significance_level}
                                            onChange={e => setHypothesis(prev => ({ ...prev, significance_level: parseFloat(e.target.value) || 0 }))}
                                            step={0.01}
                                            min={0.001}
                                            max={0.2}
                                            className="input w-full"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                            Power (1−β)
                                        </label>
                                        <input
                                            type="number"
                                            value={hypothesis.power}
                                            onChange={e => setHypothesis(prev => ({ ...prev, power: parseFloat(e.target.value) || 0 }))}
                                            step={0.01}
                                            min={0}
                                            max={1}
                                            className="input w-full"
                                        />
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-800/60 px-6 py-4">
                        <button type="button" onClick={onClose} className="btn-secondary text-sm">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isPending || (isDraft && (!allocationValid || !controlValid))}
                            className="btn-primary text-sm disabled:opacity-50"
                        >
                            {isPending ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

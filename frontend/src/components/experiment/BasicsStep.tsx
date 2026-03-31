import React from 'react';
import {
    AnalysisEngine,
    ExperimentType,
    SamplingMethod,
    type CreateExperimentRequest,
    type FeatureFlag,
    type FeatureGate,
    type HealthCheck,
    type UserGroup,
} from '../../types';
import { HealthChecksPanel } from './HealthChecksPanel';

type BasicsStepProps = {
    formData: CreateExperimentRequest;
    availableGroups: UserGroup[];
    groupInput: string;
    setGroupInput: (value: string) => void;
    showGroupOptions: boolean;
    setShowGroupOptions: (value: boolean) => void;
    filteredGroups: UserGroup[];
    toggleUserGroup: (groupId: string) => void;
    addUserGroupByName: (value: string) => void;
    metricInput: string;
    setMetricInput: (value: string) => void;
    showMetricOptions: boolean;
    setShowMetricOptions: (value: boolean) => void;
    filteredMetrics: string[];
    setPrimaryMetric: (value: string) => void;
    removePrimaryMetric: (value: string) => void;
    suggestedMetrics: string[];
    updateField: (field: keyof CreateExperimentRequest, value: unknown) => void;
    setFormData: React.Dispatch<React.SetStateAction<CreateExperimentRequest>>;
    featureFlags: FeatureFlag[];
    featureGates: FeatureGate[];
    onAddHealthCheck: () => void;
    onUpdateHealthCheck: (index: number, field: keyof HealthCheck, value: number | string | undefined) => void;
    onRemoveHealthCheck: (index: number) => void;
};

export const BasicsStep: React.FC<BasicsStepProps> = ({
    formData,
    availableGroups,
    groupInput,
    setGroupInput,
    showGroupOptions,
    setShowGroupOptions,
    filteredGroups,
    toggleUserGroup,
    addUserGroupByName,
    metricInput,
    setMetricInput,
    showMetricOptions,
    setShowMetricOptions,
    filteredMetrics,
    setPrimaryMetric,
    removePrimaryMetric,
    suggestedMetrics,
    updateField,
    setFormData,
    featureFlags,
    featureGates,
    onAddHealthCheck,
    onUpdateHealthCheck,
    onRemoveHealthCheck,
}) => {
    return (
        <div className="space-y-4">
            <div>
                <label className="label">Experiment Name</label>
                <input
                    type="text"
                    className="input"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g., Homepage CTA Button Color Test"
                />
            </div>
            <div>
                <label className="label">Description</label>
                <textarea
                    className="input"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Describe what this experiment is testing"
                />
            </div>
            <div>
                <label className="label">Target User Groups</label>
                {availableGroups.length > 0 ? (
                    <div className="space-y-2">
                        <div className="chip-input rounded-xl border border-slate-700/80 bg-slate-950/50 px-3 py-2 text-sm text-slate-100">
                            <div className="chip-stack flex flex-wrap items-center gap-2">
                                {(formData.user_groups || []).map((groupId) => {
                                    const group = availableGroups.find((item) => item.id === groupId);
                                    if (!group) return null;
                                    return (
                                        <span
                                            key={group.id}
                                            className="chip-pill inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-cyan-400 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200"
                                        >
                                            {group.name}
                                            <button
                                                type="button"
                                                onClick={() => toggleUserGroup(group.id)}
                                                className="text-cyan-200/70 hover:text-cyan-100"
                                                aria-label={`Remove ${group.name}`}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    );
                                })}
                                <input
                                    type="text"
                                    className="chip-text flex-[1_1_200px] min-w-[200px] bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                                    value={groupInput}
                                    onChange={(e) => setGroupInput(e.target.value)}
                                    onFocus={() => setShowGroupOptions(true)}
                                    onBlur={() => {
                                        setShowGroupOptions(false);
                                        addUserGroupByName(groupInput);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            addUserGroupByName(groupInput);
                                        }
                                    }}
                                    placeholder="Type group name and press Enter"
                                />
                            </div>
                        </div>
                        {showGroupOptions && filteredGroups.length > 0 && (
                            <div className="mt-2 rounded-xl border border-slate-800/70 bg-slate-950/80 p-2">
                                {filteredGroups.map((group) => (
                                    <button
                                        key={group.id}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                            addUserGroupByName(group.name);
                                            setShowGroupOptions(false);
                                        }}
                                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-900/70"
                                    >
                                        <span>{group.name}</span>
                                        <span className="text-xs text-slate-500">{group.size}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 italic">
                        No user groups available. Experiment will target all users by default.
                    </p>
                )}
            </div>
            <div>
                <label className="label">Primary Metric</label>
                <div className="chip-input rounded-xl border border-slate-700/80 bg-slate-950/50 px-3 py-2 text-sm text-slate-100">
                    <div className="chip-stack flex flex-wrap items-center gap-2">
                        {(formData.primary_metric || '')
                            .split(',')
                            .map((metric) => metric.trim())
                            .filter(Boolean)
                            .map((metric) => (
                                <span
                                    key={metric}
                                    className="chip-pill inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-cyan-400 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200"
                                >
                                    {metric}
                                    <button
                                        type="button"
                                        onClick={() => removePrimaryMetric(metric)}
                                        className="text-cyan-200/70 hover:text-cyan-100"
                                        aria-label={`Remove ${metric}`}
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        <input
                            type="text"
                            className="chip-text flex-[1_1_200px] min-w-[200px] bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                            value={metricInput}
                            onChange={(e) => setMetricInput(e.target.value)}
                            onFocus={() => setShowMetricOptions(true)}
                            onBlur={() => {
                                setShowMetricOptions(false);
                                setPrimaryMetric(metricInput);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault();
                                    setPrimaryMetric(metricInput);
                                }
                            }}
                            placeholder="Type metric name and press Enter"
                        />
                    </div>
                </div>
                {showMetricOptions && filteredMetrics.length > 0 && (
                    <div className="mt-2 rounded-xl border border-slate-800/70 bg-slate-950/80 p-2">
                        {filteredMetrics.map((metric) => (
                            <button
                                key={metric}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    setPrimaryMetric(metric);
                                    setShowMetricOptions(false);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-900/70"
                            >
                                <span>{metric}</span>
                                <span className="text-xs text-slate-500">Metric</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {suggestedMetrics.length > 0 && (
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">AI Suggestions</p>
                        <span className="badge-gray">Based on history</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {suggestedMetrics.map((metric) => (
                            <button
                                key={metric}
                                type="button"
                                onClick={() => setPrimaryMetric(metric)}
                                className="badge-info"
                            >
                                {metric}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div>
                <label className="label">Planned End Date</label>
                <input
                    type="date"
                    className="input"
                    required
                    value={formData.end_date ?? ''}
                    onChange={(e) => updateField('end_date', e.target.value || undefined)}
                />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                    <label className="label">Experiment Type</label>
                    <select
                        className="input"
                        value={formData.experiment_type}
                        onChange={(e) => updateField('experiment_type', e.target.value as ExperimentType)}
                    >
                        <option value={ExperimentType.AbTest}>A/B Test</option>
                        <option value={ExperimentType.Multivariate}>Multivariate</option>
                        <option value={ExperimentType.FeatureGate}>Feature Gate</option>
                        <option value={ExperimentType.Holdout}>Holdout</option>
                    </select>
                </div>
                <div>
                    <label className="label">Sampling Method</label>
                    <select
                        className="input"
                        value={formData.sampling_method}
                        onChange={(e) => updateField('sampling_method', e.target.value as SamplingMethod)}
                    >
                        <option value={SamplingMethod.Hash}>Hash (Deterministic)</option>
                        <option value={SamplingMethod.Random}>Random</option>
                        <option value={SamplingMethod.Stratified}>Stratified</option>
                    </select>
                </div>
                <div>
                    <label className="label">Analysis Engine</label>
                    <select
                        className="input"
                        value={formData.analysis_engine}
                        onChange={(e) => updateField('analysis_engine', e.target.value as AnalysisEngine)}
                    >
                        <option value={AnalysisEngine.Frequentist}>Frequentist</option>
                        <option value={AnalysisEngine.Bayesian}>Bayesian</option>
                        <option value={AnalysisEngine.Sequential}>Sequential (mSPRT)</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label className="label">Feature Flag</label>
                    <select
                        className="input"
                        value={formData.feature_flag_id || ''}
                        onChange={(e) =>
                            setFormData((prev) => ({
                                ...prev,
                                feature_flag_id: e.target.value || undefined,
                                feature_gate_id: undefined,
                            }))
                        }
                    >
                        <option value="">Not linked</option>
                        {featureFlags.map((flag) => (
                            <option key={flag.id} value={flag.id}>
                                {flag.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label">Feature Gate</label>
                    <select
                        className="input"
                        value={formData.feature_gate_id || ''}
                        onChange={(e) => updateField('feature_gate_id', e.target.value || undefined)}
                    >
                        <option value="">Not linked</option>
                        {featureGates
                            .filter((gate) =>
                                formData.feature_flag_id ? gate.flag_id === formData.feature_flag_id : true
                            )
                            .map((gate) => (
                                <option key={gate.id} value={gate.id}>
                                    {gate.name}
                                </option>
                            ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">Tie gates to feature flags for rollout control.</p>
                </div>
            </div>
            <HealthChecksPanel
                healthChecks={formData.health_checks}
                onAdd={onAddHealthCheck}
                onUpdate={(index, field, value) => onUpdateHealthCheck(index, field, value)}
                onRemove={onRemoveHealthCheck}
            />
        </div>
    );
};

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
    CreateExperimentRequest,
    Hypothesis,
    Variant,
    HealthCheck,
} from '../types';
import {
    MetricType as MT,
    ExperimentType,
    SamplingMethod,
    AnalysisEngine,
    HealthCheckDirection,
} from '../types';
import { userGroupApi, featureFlagApi, featureGateApi, experimentApi, aiStrategistApi } from '../services/api';
import { BasicsStep } from './experiment/BasicsStep';
import { HypothesisStep } from './experiment/HypothesisStep';
import { ReviewStep } from './experiment/ReviewStep';
import { StepIndicator } from './experiment/StepIndicator';
import { StepNavigation } from './experiment/StepNavigation';
import { VariantsStep } from './experiment/VariantsStep';
import { useAccount } from '../contexts/AccountContext';

interface ExperimentCreatorProps {
    onSubmit: (experiment: CreateExperimentRequest) => void;
    onCancel: () => void;
    initialData?: Partial<CreateExperimentRequest>;
}

export const ExperimentCreator: React.FC<ExperimentCreatorProps> = ({ onSubmit, onCancel, initialData }) => {
    const { activeAccountId } = useAccount();
    const [step, setStep] = useState(1);
    const [metricInput, setMetricInput] = useState('');
    const [groupInput, setGroupInput] = useState('');
    const [showGroupOptions, setShowGroupOptions] = useState(false);
    const [showMetricOptions, setShowMetricOptions] = useState(false);
    const defaultHypothesis = {
        null_hypothesis: '',
        alternative_hypothesis: '',
        expected_effect_size: 0.05,
        metric_type: MT.Proportion,
        significance_level: 0.05,
        power: 0.8,
    };
    const defaults: CreateExperimentRequest = {
        name: '',
        description: '',
        experiment_type: ExperimentType.AbTest,
        sampling_method: SamplingMethod.Hash,
        analysis_engine: AnalysisEngine.Frequentist,
        health_checks: [],
        hypothesis: defaultHypothesis,
        variants: [
            { name: 'Control', description: '', allocation_percent: 50, is_control: true },
            { name: 'Treatment', description: '', allocation_percent: 50, is_control: false },
        ],
        primary_metric: '',
        user_groups: [],
        end_date: undefined,
        requires_existing_users: false,
    };
    const [formData, setFormData] = useState<CreateExperimentRequest>({
        ...defaults,
        ...initialData,
        hypothesis: { ...defaultHypothesis, ...initialData?.hypothesis },
    });

    const { data: availableGroups = [] } = useQuery({
        queryKey: ['userGroups', activeAccountId],
        queryFn: async () => {
            const response = await userGroupApi.list();
            return response.data;
        },
        enabled: !!activeAccountId,
    });

    const { data: featureFlags = [] } = useQuery({
        queryKey: ['featureFlags', activeAccountId],
        queryFn: async () => {
            const response = await featureFlagApi.list();
            return response.data;
        },
        enabled: !!activeAccountId,
    });

    const { data: featureGates = [] } = useQuery({
        queryKey: ['featureGates', activeAccountId],
        queryFn: async () => {
            const response = await featureGateApi.list();
            return response.data;
        },
        enabled: !!activeAccountId,
    });

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments', activeAccountId],
        queryFn: async () => {
            const response = await experimentApi.list();
            return response.data;
        },
        enabled: !!activeAccountId,
    });

    const metricOptions = React.useMemo(() => {
        const options = new Set<string>();
        experiments.forEach((experiment) => {
            if (!experiment.primary_metric) return;
            experiment.primary_metric
                .split(',')
                .map((metric) => metric.trim())
                .filter(Boolean)
                .forEach((metric) => options.add(metric));
        });
        return Array.from(options).sort();
    }, [experiments]);

    const suggestedMetrics = React.useMemo(() => {
        const defaults = new Set<string>();
        if (formData.hypothesis.metric_type === MT.Proportion) {
            defaults.add('conversion_rate');
            defaults.add('activation_rate');
        }
        if (formData.hypothesis.metric_type === MT.Continuous) {
            defaults.add('average_order_value');
            defaults.add('time_on_task');
        }
        if (formData.hypothesis.metric_type === MT.Count) {
            defaults.add('sessions_per_user');
            defaults.add('feature_usage_count');
        }
        if (formData.experiment_type === ExperimentType.FeatureGate) {
            defaults.add('gate_pass_rate');
            defaults.add('rollout_success_rate');
        }

        metricOptions.slice(0, 6).forEach((metric) => defaults.add(metric));

        const selected = new Set(
            (formData.primary_metric || '')
                .split(',')
                .map((metric) => metric.trim())
                .filter(Boolean),
        );

        return Array.from(defaults).filter((metric) => !selected.has(metric)).slice(0, 6);
    }, [formData.experiment_type, formData.hypothesis.metric_type, formData.primary_metric, metricOptions]);

    const filteredGroups = React.useMemo(() => {
        const query = groupInput.trim().toLowerCase();
        return availableGroups
            .filter((group) => !formData.user_groups?.includes(group.id))
            .filter((group) => group.name.toLowerCase().includes(query))
            .slice(0, 6);
    }, [availableGroups, formData.user_groups, groupInput]);

    const filteredMetrics = React.useMemo(() => {
        const query = metricInput.trim().toLowerCase();
        const selected = new Set(
            (formData.primary_metric || '')
                .split(',')
                .map((metric) => metric.trim())
                .filter(Boolean),
        );
        return metricOptions
            .filter((metric) => !selected.has(metric))
            .filter((metric) => metric.toLowerCase().includes(query))
            .slice(0, 6);
    }, [formData.primary_metric, metricInput, metricOptions]);

    const toggleUserGroup = (groupId: string) => {
        setFormData((prev: CreateExperimentRequest) => {
            const current = prev.user_groups || [];
            const next = current.includes(groupId)
                ? current.filter((id: string) => id !== groupId)
                : [...current, groupId];
            return { ...prev, user_groups: next };
        });
    };

    const addUserGroupByName = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        const match = availableGroups.find((group) => group.name.toLowerCase() === trimmed.toLowerCase());
        if (match) {
            setFormData((prev: CreateExperimentRequest) => {
                const current = prev.user_groups || [];
                if (current.includes(match.id)) return prev;
                return { ...prev, user_groups: [...current, match.id] };
            });
        }
        setGroupInput('');
    };

    const setPrimaryMetric = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        const metrics = (formData.primary_metric || '')
            .split(',')
            .map((metric) => metric.trim())
            .filter(Boolean);
        if (!metrics.includes(trimmed)) {
            const next = [...metrics, trimmed];
            updateField('primary_metric', next.join(', '));
        }
        setMetricInput('');
    };

    const removePrimaryMetric = (metric: string) => {
        const metrics = (formData.primary_metric || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .filter((value) => value !== metric);
        updateField('primary_metric', metrics.join(', '));
    };

    const handleAiDraft = async () => {
        const description = [formData.name, formData.description].filter(Boolean).join(' — ');
        const { data: draft } = await aiStrategistApi.draftHypothesis({
            experiment_description: description,
            metric_type: formData.hypothesis.metric_type,
        });
        updateHypothesis('null_hypothesis', draft.null_hypothesis);
        updateHypothesis('alternative_hypothesis', draft.alternative_hypothesis);
        updateHypothesis('expected_effect_size', draft.expected_effect_size);
        updateHypothesis('metric_type', draft.metric_type as MT);
        updateHypothesis('significance_level', draft.significance_level);
        updateHypothesis('power', draft.power);
    };

    const applyHypothesisTemplate = () => {
        const primaryMetric = (formData.primary_metric || '')
            .split(',')
            .map((metric) => metric.trim())
            .filter(Boolean)[0] || 'conversion_rate';
        const effectSize = formData.hypothesis.metric_type === MT.Continuous ? 0.08 : 0.05;

        updateHypothesis(
            'null_hypothesis',
            `There is no difference in ${primaryMetric} between control and treatment.`,
        );
        updateHypothesis(
            'alternative_hypothesis',
            `Treatment improves ${primaryMetric} by at least ${(effectSize * 100).toFixed(0)}%.`,
        );
        updateHypothesis('expected_effect_size', effectSize);
    };

    const updateField = (field: keyof CreateExperimentRequest, value: unknown) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const updateHypothesis = (field: keyof Hypothesis, value: unknown) => {
        setFormData((prev) => ({
            ...prev,
            hypothesis: { ...prev.hypothesis, [field]: value },
        }));
    };

    const updateVariant = (index: number, field: keyof Variant, value: unknown) => {
        setFormData((prev) => {
            const newVariants = [...prev.variants];
            newVariants[index] = { ...newVariants[index], [field]: value };
            return { ...prev, variants: newVariants };
        });
    };

    const addVariant = () => {
        const totalAllocation = formData.variants.reduce((sum, v) => sum + v.allocation_percent, 0);
        setFormData((prev) => ({
            ...prev,
            variants: [
                ...prev.variants,
                {
                    name: `Variant ${prev.variants.length + 1}`,
                    description: '',
                    allocation_percent: Math.max(0, 100 - totalAllocation),
                    is_control: false,
                },
            ],
        }));
    };

    const removeVariant = (index: number) => {
        if (formData.variants.length > 2) {
            setFormData((prev) => ({
                ...prev,
                variants: prev.variants.filter((_, i) => i !== index),
            }));
        }
    };

    const addHealthCheck = () => {
        setFormData((prev) => ({
            ...prev,
            health_checks: [
                ...(prev.health_checks || []),
                {
                    metric_name: '',
                    direction: HealthCheckDirection.AtLeast,
                    min: 0,
                    max: 1,
                } as HealthCheck,
            ],
        }));
    };

    const updateHealthCheck = (index: number, field: keyof HealthCheck, value: unknown) => {
        setFormData((prev) => {
            const current = prev.health_checks || [];
            const updated = [...current];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, health_checks: updated };
        });
    };

    const removeHealthCheck = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            health_checks: (prev.health_checks || []).filter((_, i) => i !== index),
        }));
    };

    const handleSubmit = () => {
        const payload: CreateExperimentRequest = {
            ...formData,
            // Convert YYYY-MM-DD from <input type="date"> to ISO 8601 datetime
            end_date: formData.end_date ? `${formData.end_date}T00:00:00Z` : undefined,
        };
        onSubmit(payload);
    };

    return (
        <div className="card max-w-4xl mx-auto animate-slide-up">
            <h2 className="mb-6">Create New Experiment</h2>

            <StepIndicator step={step} />

            {/* Step 1: Basic Info */}
            {step === 1 && (
                <BasicsStep
                    formData={formData}
                    availableGroups={availableGroups}
                    groupInput={groupInput}
                    setGroupInput={setGroupInput}
                    showGroupOptions={showGroupOptions}
                    setShowGroupOptions={setShowGroupOptions}
                    filteredGroups={filteredGroups}
                    toggleUserGroup={toggleUserGroup}
                    addUserGroupByName={addUserGroupByName}
                    metricInput={metricInput}
                    setMetricInput={setMetricInput}
                    showMetricOptions={showMetricOptions}
                    setShowMetricOptions={setShowMetricOptions}
                    filteredMetrics={filteredMetrics}
                    setPrimaryMetric={setPrimaryMetric}
                    removePrimaryMetric={removePrimaryMetric}
                    suggestedMetrics={suggestedMetrics}
                    updateField={updateField}
                    setFormData={setFormData}
                    featureFlags={featureFlags}
                    featureGates={featureGates}
                    onAddHealthCheck={addHealthCheck}
                    onUpdateHealthCheck={updateHealthCheck}
                    onRemoveHealthCheck={removeHealthCheck}
                />
            )}

            {/* Step 2: Hypothesis */}
            {step === 2 && (
                <HypothesisStep
                    formData={formData}
                    updateHypothesis={updateHypothesis}
                    applyHypothesisTemplate={applyHypothesisTemplate}
                    onAiDraft={handleAiDraft}
                />
            )}

            {/* Step 3: Variants */}
            {step === 3 && (
                <VariantsStep
                    formData={formData}
                    updateVariant={updateVariant}
                    removeVariant={removeVariant}
                    addVariant={addVariant}
                />
            )}

            {/* Step 4: Review */}
            {step === 4 && (
                <ReviewStep
                    formData={formData}
                    featureFlags={featureFlags}
                    featureGates={featureGates}
                />
            )}

            {/* Navigation */}
            <StepNavigation
                step={step}
                onPrev={() => setStep(step - 1)}
                onNext={() => setStep(step + 1)}
                onCancel={onCancel}
                onSubmit={handleSubmit}
            />
        </div>
    );
};

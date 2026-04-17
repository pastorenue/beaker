import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { experimentApi } from '../services/api';
import { EditExperimentModal } from '../components/experiment/EditExperimentModal';
import { ExperimentMonitor } from '../components/experiment/ExperimentMonitor';
import { JiraIssuePanel } from '../components/experiment/JiraIssuePanel';
import { StatisticalDashboard } from '../components/StatisticalDashboard';
import { StatisticalHeader } from '../components/statistical-dashboard/StatisticalHeader';
import { CupedConfigurationModal } from '../components/CupedConfigurationModal';
import { LoadingSpinner } from '../components/Common';
import { useAccount } from '../contexts/AccountContext';
import { useToast } from '../contexts/ToastContext';
import { AiSupportDrawer } from '../components/ai-assist/AiSupportDrawer';
import type { Experiment, UpdateExperimentRequest } from '../types';

export function ExperimentDetailPage() {
    const { activeAccountId } = useAccount();
    const { addToast } = useToast();
    const { id } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [useCuped, setUseCuped] = React.useState(false);
    const [showCupedConfig, setShowCupedConfig] = React.useState(false);
    const [isAiDrawerOpen, setIsAiDrawerOpen] = React.useState(false);
    const [showEditModal, setShowEditModal] = React.useState(false);
    const [experimentOverride, setExperimentOverride] = React.useState<Experiment | null>(null);

    const getMutationErrorMessage = (error: unknown) => {
        const err = error as { response?: { data?: { error?: string } }; message?: string };
        return err.response?.data?.error ?? err.message ?? 'Unknown error';
    };

    const { data: experiment, isLoading: expLoading } = useQuery({
        queryKey: ['experiment', id, activeAccountId],
        queryFn: async () => {
            const response = await experimentApi.get(id!);
            return response.data;
        },
        enabled: !!id && !!activeAccountId,
    });

    const { data: analysis, isLoading: analysisLoading } = useQuery({
        queryKey: ['analysis', id, useCuped, activeAccountId],
        queryFn: async () => {
            const response = await experimentApi.getAnalysis(id!, useCuped);
            return response.data;
        },
        enabled: !!experiment && !!activeAccountId,
        refetchInterval: (experiment?.status === 'running') ? 5000 : false,
    });

    const startMutation = useMutation({
        mutationFn: () => experimentApi.start(id!),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['experiment', id, activeAccountId] });
            queryClient.invalidateQueries({ queryKey: ['analysis', id, activeAccountId] });
        },
        onError: (error: unknown) => {
            console.error('Failed to start experiment:', error);
            alert(`Failed to start experiment: ${getMutationErrorMessage(error)}`);
        }
    });

    const pauseMutation = useMutation({
        mutationFn: () => experimentApi.pause(id!),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['experiment', id, activeAccountId] });
        },
        onError: (error: unknown) => {
            console.error('Failed to pause experiment:', error);
            alert(`Failed to pause experiment: ${getMutationErrorMessage(error)}`);
        }
    });

    const stopMutation = useMutation({
        mutationFn: () => experimentApi.stop(id!),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['experiment', id, activeAccountId] });
            queryClient.invalidateQueries({ queryKey: ['analysis', id, activeAccountId] });
        },
        onError: (error: unknown) => {
            console.error('Failed to stop experiment:', error);
            alert(`Failed to stop experiment: ${getMutationErrorMessage(error)}`);
        }
    });

    const editMutation = useMutation({
        mutationFn: (data: UpdateExperimentRequest) => experimentApi.update(id!, data),
        onSuccess: (response) => {
            queryClient.setQueryData(['experiment', id, activeAccountId], response.data);
            setShowEditModal(false);
            addToast('Experiment updated', 'success');
        },
        onError: () => addToast('Failed to update experiment', 'error'),
    });

    // Build a complete sample sizes list that always includes control.
    // analysis.sample_sizes only has treatment variants from older backend builds,
    // so we derive control's count from results[0].sample_size_a if missing.
    const allSampleSizes = React.useMemo(() => {
        if (!analysis) return undefined;
        const firstResult = analysis.results[0];
        const requiredSize = analysis.sample_sizes[0]?.required_size ?? 0;
        const hasControl = analysis.sample_sizes.some(s => s.variant === firstResult?.variant_a);
        const controlEntry = !hasControl && firstResult
            ? [{ variant: firstResult.variant_a, current_size: firstResult.sample_size_a ?? 0, required_size: requiredSize }]
            : [];
        return [...controlEntry, ...analysis.sample_sizes];
    }, [analysis]);

    if (expLoading) return <LoadingSpinner fullHeight />;
    if (!experiment) return <div>Experiment not found</div>;

    // Merge any local overrides (e.g. jira_issue_key updates) with server data
    const activeExperiment: Experiment = experimentOverride ?? experiment;

    const isPolling = analysisLoading || (!!activeExperiment && activeExperiment.status === 'running');

    const experimentContext = activeExperiment && analysis
        ? `Experiment: "${activeExperiment.name}" | Engine: ${activeExperiment.analysis_engine} | Status: ${activeExperiment.status}` +
        (analysis.results[0]
            ? ` | p-value: ${analysis.results[0].p_value.toFixed(4)} | Significant: ${analysis.results[0].is_significant}`
            : '')
        : activeExperiment
            ? `Experiment: "${activeExperiment.name}" | Engine: ${activeExperiment.analysis_engine} | Status: ${activeExperiment.status}`
            : undefined;

    return (
        <div className="space-y-0">
            <Link to="/dashboard" className="inline-flex items-center text-slate-300 hover:text-slate-200">
                ← Back to Experiments
            </Link>

            <ExperimentMonitor
                experiment={activeExperiment}
                onStart={() => startMutation.mutate()}
                onPause={() => pauseMutation.mutate()}
                onStop={() => stopMutation.mutate()}
                onEdit={() => setShowEditModal(true)}
                isLoading={startMutation.isPending || pauseMutation.isPending || stopMutation.isPending}
                sampleSizes={allSampleSizes}
                extraTopContent={
                    analysis ? (
                        <StatisticalHeader
                            experiment={activeExperiment}
                            isPolling={isPolling}
                            useCuped={useCuped}
                            onToggleCuped={setUseCuped}
                            onOpenConfig={() => setShowCupedConfig(true)}
                            cupedError={analysis.cuped_error}
                            hasCupedResults={Boolean(analysis.cuped_adjusted_results)}
                            eValue={analysis.results[0]?.e_value}
                            sequentialThreshold={analysis.results[0]?.sequential_threshold}
                        />
                    ) : null
                }
            />

            <JiraIssuePanel
                experiment={activeExperiment}
                onUpdated={(updated) => setExperimentOverride(updated)}
            />

            {analysisLoading && <LoadingSpinner />}
            {analysis && (
                <StatisticalDashboard
                    analysis={analysis}
                    useCuped={useCuped}
                />
            )}

            {analysis && (
                <CupedConfigurationModal
                    experimentId={experiment.id}
                    isOpen={showCupedConfig}
                    onClose={() => setShowCupedConfig(false)}
                />
            )}

            {activeExperiment.status === 'draft' && (
                <div className="card">
                    <p className="text-slate-300">
                        ℹ️ Start the experiment to begin collecting data and viewing analysis results.
                    </p>
                </div>
            )}

            {/* Floating AI Support button */}
            <button
                onClick={() => setIsAiDrawerOpen(true)}
                className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-gray-500 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-cyan-400 transition-colors"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                >
                    <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684Z" />
                </svg>
                AI Support
            </button>

            <AiSupportDrawer
                isOpen={isAiDrawerOpen}
                onClose={() => setIsAiDrawerOpen(false)}
                experimentContext={experimentContext}
            />

            {showEditModal && (
                <EditExperimentModal
                    experiment={activeExperiment}
                    onClose={() => setShowEditModal(false)}
                    onSave={(data) => editMutation.mutate(data)}
                    isPending={editMutation.isPending}
                />
            )}
        </div>
    );
}

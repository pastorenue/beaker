import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { experimentApi } from '../services/api';
import { ExperimentMonitor } from '../components/experiment/ExperimentMonitor';
import { StatisticalDashboard } from '../components/StatisticalDashboard';
import { StatisticalHeader } from '../components/statistical-dashboard/StatisticalHeader';
import { CupedConfigurationModal } from '../components/CupedConfigurationModal';
import { LoadingSpinner } from '../components/Common';
import { useAccount } from '../contexts/AccountContext';
import { AiSupportDrawer } from '../components/ai-assist/AiSupportDrawer';

export function ExperimentDetailPage() {
    const { activeAccountId } = useAccount();
    const { id } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [useCuped, setUseCuped] = React.useState(false);
    const [showCupedConfig, setShowCupedConfig] = React.useState(false);
    const [isAiDrawerOpen, setIsAiDrawerOpen] = React.useState(false);

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

    if (expLoading) return <LoadingSpinner fullHeight />;
    if (!experiment) return <div>Experiment not found</div>;
    const isPolling = analysisLoading || (!!experiment && experiment.status === 'running');

    const experimentContext = experiment && analysis
        ? `Experiment: "${experiment.name}" | Engine: ${experiment.analysis_engine} | Status: ${experiment.status}` +
        (analysis.results[0]
            ? ` | p-value: ${analysis.results[0].p_value.toFixed(4)} | Significant: ${analysis.results[0].is_significant}`
            : '')
        : experiment
            ? `Experiment: "${experiment.name}" | Engine: ${experiment.analysis_engine} | Status: ${experiment.status}`
            : undefined;

    return (
        <div className="space-y-6">
            <Link to="/dashboard" className="inline-flex items-center text-slate-300 hover:text-slate-200">
                ← Back to Experiments
            </Link>

            <ExperimentMonitor
                experiment={experiment}
                onStart={() => startMutation.mutate()}
                onPause={() => pauseMutation.mutate()}
                onStop={() => stopMutation.mutate()}
                isLoading={startMutation.isPending || pauseMutation.isPending || stopMutation.isPending}
                extraTopContent={
                    analysis ? (
                        <StatisticalHeader
                            experiment={experiment}
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

            {experiment.status === 'draft' && (
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
        </div>
    );
}

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

export function ExperimentDetailPage() {
    const { activeAccountId } = useAccount();
    const { id } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [useCuped, setUseCuped] = React.useState(false);
    const [showCupedConfig, setShowCupedConfig] = React.useState(false);

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

    return (
        <div className="space-y-6">
            <Link to="/dashboard" className="inline-flex items-center text-cyan-300 hover:text-cyan-200">
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
        </div>
    );
}

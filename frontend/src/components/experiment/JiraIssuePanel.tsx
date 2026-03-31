import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { experimentApi, integrationApi } from '../../services/api';
import type { Experiment, JiraIntegrationConfig } from '../../types';
import { useAccount } from '../../contexts/AccountContext';

interface JiraIssuePanelProps {
    experiment: Experiment;
    onUpdated: (exp: Experiment) => void;
}

export const JiraIssuePanel: React.FC<JiraIssuePanelProps> = ({ experiment, onUpdated }) => {
    const { activeAccountId } = useAccount();
    const queryClient = useQueryClient();

    const [showCreateForm, setShowCreateForm] = React.useState(false);
    const [showLinkForm, setShowLinkForm] = React.useState(false);
    const [summary, setSummary] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [linkKey, setLinkKey] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);

    const { data: integrations = [] } = useQuery({
        queryKey: ['integrations', activeAccountId],
        queryFn: async () => {
            const res = await integrationApi.list();
            return res.data;
        },
        enabled: !!activeAccountId,
    });

    const jiraConfig = integrations.find((i) => i.integration_type === 'jira')
        ?.config as JiraIntegrationConfig | undefined;

    const issueUrl = jiraConfig && experiment.jira_issue_key
        ? `${jiraConfig.site_url.replace(/\/$/, '')}/browse/${experiment.jira_issue_key}`
        : null;

    const invalidateExperiment = () => {
        queryClient.invalidateQueries({ queryKey: ['experiment', experiment.id, activeAccountId] });
    };

    const createMutation = useMutation({
        mutationFn: () =>
            experimentApi.createJiraIssue(experiment.id, {
                summary: summary || `Experiment: ${experiment.name}`,
                description: description || undefined,
            }),
        onSuccess: (res) => {
            setSuccess(`Created ${res.data.issue_key}`);
            setError(null);
            setSummary('');
            setDescription('');
            setShowCreateForm(false);
            invalidateExperiment();
            onUpdated({ ...experiment, jira_issue_key: res.data.issue_key });
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to create Jira issue');
            setSuccess(null);
        },
    });

    const linkMutation = useMutation({
        mutationFn: () =>
            experimentApi.linkJiraIssue(experiment.id, { jira_issue_key: linkKey.trim() }),
        onSuccess: () => {
            setSuccess(`Linked ${linkKey.trim()}`);
            setError(null);
            setShowLinkForm(false);
            invalidateExperiment();
            onUpdated({ ...experiment, jira_issue_key: linkKey.trim() });
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to link Jira issue');
            setSuccess(null);
        },
    });

    const unlinkMutation = useMutation({
        mutationFn: () => experimentApi.unlinkJiraIssue(experiment.id),
        onSuccess: () => {
            setSuccess('Jira issue unlinked');
            setError(null);
            invalidateExperiment();
            onUpdated({ ...experiment, jira_issue_key: undefined });
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to unlink Jira issue');
            setSuccess(null);
        },
    });

    if (!jiraConfig) {
        return null;
    }

    return (
        <div className="card space-y-3">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-100">Jira</h3>
                {experiment.jira_issue_key && (
                    <span className="badge-info text-xs">{experiment.jira_issue_key}</span>
                )}
            </div>

            {experiment.jira_issue_key ? (
                <div className="flex flex-wrap items-center gap-3">
                    {issueUrl ? (
                        <a
                            href={issueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-indigo-400 hover:text-indigo-300 underline"
                        >
                            {experiment.jira_issue_key} ↗
                        </a>
                    ) : (
                        <span className="text-sm text-slate-300 font-mono">
                            {experiment.jira_issue_key}
                        </span>
                    )}
                    <button
                        className="btn-secondary h-7 px-3 text-xs"
                        disabled={unlinkMutation.isPending}
                        onClick={() => unlinkMutation.mutate()}
                    >
                        {unlinkMutation.isPending ? 'Unlinking…' : 'Unlink'}
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <button
                            className="btn-secondary h-7 px-3 text-xs"
                            onClick={() => {
                                setShowCreateForm(!showCreateForm);
                                setShowLinkForm(false);
                                setError(null);
                                setSuccess(null);
                            }}
                        >
                            Create Jira Issue
                        </button>
                        <button
                            className="btn-secondary h-7 px-3 text-xs"
                            onClick={() => {
                                setShowLinkForm(!showLinkForm);
                                setShowCreateForm(false);
                                setError(null);
                                setSuccess(null);
                            }}
                        >
                            Link Existing
                        </button>
                    </div>

                    {showCreateForm && (
                        <div className="space-y-2 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
                            <div className="space-y-1">
                                <label className="label text-xs">Summary</label>
                                <input
                                    className="input text-sm"
                                    placeholder={`Experiment: ${experiment.name}`}
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="label text-xs">Description (optional)</label>
                                <textarea
                                    className="input text-sm resize-none"
                                    rows={2}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <button
                                className="btn-primary h-7 px-3 text-xs"
                                disabled={createMutation.isPending}
                                onClick={() => createMutation.mutate()}
                            >
                                {createMutation.isPending ? 'Creating…' : 'Create'}
                            </button>
                        </div>
                    )}

                    {showLinkForm && (
                        <div className="flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
                            <input
                                className="input text-sm flex-1"
                                placeholder="EXP-123"
                                value={linkKey}
                                onChange={(e) => setLinkKey(e.target.value)}
                            />
                            <button
                                className="btn-primary h-8 px-3 text-xs"
                                disabled={linkMutation.isPending || !linkKey.trim()}
                                onClick={() => linkMutation.mutate()}
                            >
                                {linkMutation.isPending ? 'Linking…' : 'Link'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {error && <p className="text-xs text-rose-300">{error}</p>}
            {success && <p className="text-xs text-emerald-300">{success}</p>}
        </div>
    );
};

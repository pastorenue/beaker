import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationApi } from '../services/api';
import type {
    AccountIntegration,
    JiraIntegrationConfig,
    SlackIntegrationConfig,
} from '../types';
import { useAccount } from '../contexts/AccountContext';

export const IntegrationsPanel: React.FC = () => {
    const { activeAccountId } = useAccount();
    const { data: integrations = [], isLoading } = useQuery({
        queryKey: ['integrations', activeAccountId],
        queryFn: async () => {
            const res = await integrationApi.list();
            return res.data;
        },
        enabled: !!activeAccountId,
    });

    const slackIntegration = integrations.find((i) => i.integration_type === 'slack');
    const jiraIntegration = integrations.find((i) => i.integration_type === 'jira');

    if (isLoading) {
        return <p className="text-sm text-slate-400">Loading integrations…</p>;
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-slate-400">
                Connect Slack and Jira to receive experiment notifications and link issues.
            </p>
            <SlackConfigCard existing={slackIntegration} />
            <JiraConfigCard existing={jiraIntegration} />
        </div>
    );
};

// ---------------------------------------------------------------------------
// Slack card
// ---------------------------------------------------------------------------

const SlackConfigCard: React.FC<{ existing?: AccountIntegration }> = ({ existing }) => {
    const queryClient = useQueryClient();
    const { activeAccountId } = useAccount();

    const existingConfig = existing?.config as SlackIntegrationConfig | undefined;
    const [webhookUrl, setWebhookUrl] = React.useState('');
    const [enabled, setEnabled] = React.useState(existing?.enabled ?? true);
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);

    const upsertMutation = useMutation({
        mutationFn: () =>
            integrationApi.upsertSlack({
                enabled,
                config: { webhook_url: webhookUrl },
            }),
        onSuccess: () => {
            setSuccess('Slack integration saved.');
            setError(null);
            setWebhookUrl('');
            queryClient.invalidateQueries({ queryKey: ['integrations', activeAccountId] });
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to save Slack integration');
            setSuccess(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => integrationApi.delete('slack'),
        onSuccess: () => {
            setSuccess('Slack integration removed.');
            setError(null);
            queryClient.invalidateQueries({ queryKey: ['integrations', activeAccountId] });
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to remove Slack integration');
            setSuccess(null);
        },
    });

    return (
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-slate-100 text-sm">Slack</p>
                    <p className="text-xs text-slate-500">
                        Receive notifications via Incoming Webhooks.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {existing ? (
                        <span className="badge-info text-xs">Connected</span>
                    ) : (
                        <span className="badge-gray text-xs">Not configured</span>
                    )}
                    <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                            className="accent-indigo-500"
                        />
                        Enabled
                    </label>
                </div>
            </div>

            {existing && existingConfig && (
                <p className="text-xs text-slate-500">
                    Webhook: <span className="font-mono text-slate-300">{existingConfig.webhook_url}</span>
                </p>
            )}

            <div className="space-y-1">
                <label className="label text-xs">
                    {existing ? 'New Webhook URL (leave blank to keep current)' : 'Webhook URL'}
                </label>
                <input
                    className="input text-sm"
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                />
            </div>

            <div className="flex items-center gap-2">
                <button
                    className="btn-primary h-8 px-3 text-xs"
                    disabled={upsertMutation.isPending || (!webhookUrl.trim() && !existing)}
                    onClick={() => {
                        if (!webhookUrl.trim() && existing) {
                            // Toggle enabled only
                            integrationApi
                                .upsertSlack({ enabled, config: existingConfig! })
                                .then(() => {
                                    setSuccess('Slack integration updated.');
                                    queryClient.invalidateQueries({ queryKey: ['integrations', activeAccountId] });
                                })
                                .catch(() => setError('Failed to update'));
                        } else {
                            upsertMutation.mutate();
                        }
                    }}
                >
                    {upsertMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                {existing && (
                    <button
                        className="btn-secondary h-8 px-3 text-xs"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate()}
                    >
                        {deleteMutation.isPending ? 'Removing…' : 'Remove'}
                    </button>
                )}
            </div>

            {error && <p className="text-xs text-rose-300">{error}</p>}
            {success && <p className="text-xs text-emerald-300">{success}</p>}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Jira card
// ---------------------------------------------------------------------------

const JiraConfigCard: React.FC<{ existing?: AccountIntegration }> = ({ existing }) => {
    const queryClient = useQueryClient();
    const { activeAccountId } = useAccount();

    const existingConfig = existing?.config as JiraIntegrationConfig | undefined;
    const [siteUrl, setSiteUrl] = React.useState(existingConfig?.site_url ?? '');
    const [email, setEmail] = React.useState(existingConfig?.email ?? '');
    const [apiToken, setApiToken] = React.useState('');
    const [projectKey, setProjectKey] = React.useState(existingConfig?.project_key ?? '');
    const [enabled, setEnabled] = React.useState(existing?.enabled ?? true);
    const [testResult, setTestResult] = React.useState<string | null>(null);
    const [testOk, setTestOk] = React.useState<boolean | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);

    const upsertMutation = useMutation({
        mutationFn: () =>
            integrationApi.upsertJira({
                enabled,
                config: {
                    site_url: siteUrl,
                    email,
                    api_token: apiToken,
                    project_key: projectKey || undefined,
                },
            }),
        onSuccess: () => {
            setSuccess('Jira integration saved.');
            setError(null);
            setApiToken('');
            queryClient.invalidateQueries({ queryKey: ['integrations', activeAccountId] });
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to save Jira integration');
            setSuccess(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => integrationApi.delete('jira'),
        onSuccess: () => {
            setSuccess('Jira integration removed.');
            setError(null);
            queryClient.invalidateQueries({ queryKey: ['integrations', activeAccountId] });
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to remove Jira integration');
            setSuccess(null);
        },
    });

    const testMutation = useMutation({
        mutationFn: () => integrationApi.testJira(),
        onSuccess: (res) => {
            setTestOk(res.data.ok);
            setTestResult(
                res.data.ok
                    ? `Connected as ${res.data.display_name}`
                    : res.data.display_name,
            );
        },
        onError: () => {
            setTestOk(false);
            setTestResult('Connection test failed');
        },
    });

    return (
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-slate-100 text-sm">Jira</p>
                    <p className="text-xs text-slate-500">
                        Link and create Jira issues from experiments.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {existing ? (
                        <span className="badge-info text-xs">Connected</span>
                    ) : (
                        <span className="badge-gray text-xs">Not configured</span>
                    )}
                    <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                            className="accent-indigo-500"
                        />
                        Enabled
                    </label>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <label className="label text-xs">Site URL</label>
                    <input
                        className="input text-sm"
                        placeholder="https://org.atlassian.net"
                        value={siteUrl}
                        onChange={(e) => setSiteUrl(e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="label text-xs">Email</label>
                    <input
                        className="input text-sm"
                        type="email"
                        placeholder="user@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="label text-xs">API Token</label>
                    <input
                        className="input text-sm"
                        type="password"
                        placeholder={existing ? '••••••••' : 'Atlassian API token'}
                        value={apiToken}
                        onChange={(e) => setApiToken(e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="label text-xs">Default Project Key (optional)</label>
                    <input
                        className="input text-sm"
                        placeholder="EXP"
                        value={projectKey}
                        onChange={(e) => setProjectKey(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    className="btn-primary h-8 px-3 text-xs"
                    disabled={upsertMutation.isPending || !siteUrl.trim() || !email.trim() || (!apiToken.trim() && !existing)}
                    onClick={() => upsertMutation.mutate()}
                >
                    {upsertMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                {existing && (
                    <>
                        <button
                            className="btn-secondary h-8 px-3 text-xs"
                            disabled={testMutation.isPending}
                            onClick={() => testMutation.mutate()}
                        >
                            {testMutation.isPending ? 'Testing…' : 'Test Connection'}
                        </button>
                        <button
                            className="btn-secondary h-8 px-3 text-xs"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate()}
                        >
                            {deleteMutation.isPending ? 'Removing…' : 'Remove'}
                        </button>
                    </>
                )}
            </div>

            {testResult !== null && (
                <p className={`text-xs ${testOk ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {testResult}
                </p>
            )}
            {error && <p className="text-xs text-rose-300">{error}</p>}
            {success && <p className="text-xs text-emerald-300">{success}</p>}
        </div>
    );
};

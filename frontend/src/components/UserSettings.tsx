import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, sdkApi, accountApi } from '../services/api';
import type { RotateSdkTokensRequest, TotpSetupResponse, Account } from '../types';
import { useAccount } from '../contexts/AccountContext';

export const UserSettings: React.FC = () => {
    const { activeAccountId } = useAccount();
    const queryClient = useQueryClient();
    const [pendingRotate, setPendingRotate] = React.useState<RotateSdkTokensRequest['kind'] | null>(null);
    const [copiedKey, setCopiedKey] = React.useState<'tracking' | 'feature_flags' | null>(null);
    const [totpSetup, setTotpSetup] = React.useState<TotpSetupResponse | null>(null);
    const [totpCode, setTotpCode] = React.useState('');
    const [totpEnabled, setTotpEnabled] = React.useState(false);
    const [totpError, setTotpError] = React.useState<string | null>(null);
    const [totpSuccess, setTotpSuccess] = React.useState<string | null>(null);
    const [activeSdkTab, setActiveSdkTab] = React.useState<'tokens' | 'feature_flags'>('tokens');
    const userId = window.localStorage.getItem('expothesis-user-id') ?? '';
    const { data, isLoading } = useQuery({
        queryKey: ['sdk-tokens', activeAccountId],
        queryFn: async () => {
            const response = await sdkApi.getTokens();
            return response.data;
        },
        enabled: !!activeAccountId,
    });
    const { data: authProfile } = useQuery({
        queryKey: ['auth-profile', userId],
        queryFn: async () => {
            if (!userId) return null;
            const response = await authApi.me(userId);
            return response.data;
        },
        enabled: Boolean(userId),
    });
    const { data: accounts = [] } = useQuery({
        queryKey: ['accounts'],
        queryFn: async () => (await accountApi.list()).data,
    });
    const rotateMutation = useMutation({
        mutationFn: (payload: RotateSdkTokensRequest) => sdkApi.rotateTokens(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sdk-tokens', activeAccountId] });
        },
    });

    const trackingKey = data?.tracking_api_key ?? '—';
    const featureFlagsKey = data?.feature_flags_api_key ?? '—';

    const handleCopy = async (value: string, kind: 'tracking' | 'feature_flags') => {
        if (!value || value === '—') return;
        try {
            await navigator.clipboard.writeText(value);
            setCopiedKey(kind);
            window.setTimeout(() => setCopiedKey((current) => (current === kind ? null : current)), 1500);
        } catch {
            // Silently ignore clipboard failures.
        }
    };

    const handleTotpSetup = async () => {
        setTotpError(null);
        setTotpSuccess(null);
        if (!userId) {
            setTotpError('Missing user session. Please sign in again.');
            return;
        }
        try {
            const res = await authApi.setupTotp(userId);
            setTotpSetup(res.data);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setTotpError(error.response?.data?.error || 'Failed to start authenticator setup');
        }
    };

    const handleTotpVerify = async () => {
        setTotpError(null);
        setTotpSuccess(null);
        if (!userId) {
            setTotpError('Missing user session. Please sign in again.');
            return;
        }
        if (!totpCode.trim()) {
            setTotpError('Enter the 6-digit code from your authenticator app.');
            return;
        }
        try {
            await authApi.verifyTotp(userId, totpCode.trim());
            setTotpEnabled(true);
            setTotpSuccess('Authenticator enabled.');
            setTotpCode('');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setTotpError(error.response?.data?.error || 'Verification failed');
        }
    };

    const handleTotpDisable = async () => {
        setTotpError(null);
        setTotpSuccess(null);
        if (!userId) {
            setTotpError('Missing user session. Please sign in again.');
            return;
        }
        try {
            await authApi.disableTotp(userId);
            setTotpEnabled(false);
            setTotpSetup(null);
            setTotpCode('');
            setTotpSuccess('Authenticator removed.');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setTotpError(error.response?.data?.error || 'Failed to disable authenticator');
        }
    };

    React.useEffect(() => {
        if (!authProfile) return;
        setTotpEnabled(authProfile.totp_enabled);
    }, [authProfile]);

    return (
        <div className="space-y-6">
            <div>
                <h1>User Settings</h1>
                <p className="mt-1 text-slate-400">
                    Manage your profile, security, accounts, and SDK credentials.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="card">
                    <h3>Profile</h3>
                    <p className="mt-2 text-sm text-slate-400">Update your display name and contact details.</p>
                    <div className="mt-4 space-y-3">
                        <div className="space-y-1">
                            <label className="label">Name</label>
                            <input className="input" defaultValue="Admin Operator" />
                        </div>
                        <div className="space-y-1">
                            <label className="label">Email</label>
                            <input className="input" defaultValue="admin@expothesis.local" />
                        </div>
                    </div>
                </div>
                <div className="card">
                    <h3>Accounts</h3>
                    <p className="mt-2 text-sm text-slate-400">
                        Switch between accounts and create new ones.
                    </p>
                    <AccountManager accounts={accounts} />
                </div>
                <div className="card">
                    <h3>Security</h3>
                    <p className="mt-2 text-sm text-slate-400">Manage password resets and two-factor auth.</p>
                    <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 px-4 py-3 text-sm">
                            <div>
                                <p className="font-semibold text-slate-100">Authenticator app</p>
                                <p className="text-xs text-slate-500">{totpEnabled ? 'Enabled' : 'Not configured'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {totpEnabled && (
                                    <button className="btn-secondary" onClick={handleTotpDisable}>
                                        Remove
                                    </button>
                                )}
                                <button className="btn-secondary" onClick={handleTotpSetup}>
                                    {totpSetup ? 'Regenerate' : 'Set up'}
                                </button>
                            </div>
                        </div>
                        {totpSetup && (
                            <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 text-sm text-slate-300">
                                <p className="text-xs text-slate-500">Scan QR</p>
                                <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center">
                                    <div className="flex h-36 w-36 items-center justify-center rounded-xl border border-slate-800/70 bg-slate-950/70">
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                                                totpSetup.otpauth_url,
                                            )}`}
                                            alt="Authenticator QR"
                                            className="h-32 w-32 rounded-lg"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="text-xs text-slate-500">Secret</div>
                                        <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                                            {totpSetup.secret}
                                        </div>
                                        <div className="text-xs text-slate-500">OTPAuth URL</div>
                                        <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-[0.65rem] text-slate-300">
                                            {totpSetup.otpauth_url}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 space-y-2">
                                    <label className="label">Enter code to verify</label>
                                    <input
                                        className="input"
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value)}
                                        placeholder="123456"
                                    />
                                    <div className="flex items-center gap-2">
                                        <button className="btn-primary" onClick={handleTotpVerify}>
                                            Verify Authenticator
                                        </button>
                                        {totpSuccess && <span className="text-xs text-emerald-300">{totpSuccess}</span>}
                                        {totpError && <span className="text-xs text-rose-300">{totpError}</span>}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 px-4 py-3 text-sm">
                            <div>
                                <p className="font-semibold text-slate-100">Password</p>
                                <p className="text-xs text-slate-500">Last updated 2 days ago</p>
                            </div>
                            <button className="btn-secondary">Reset</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                    <h3>SDK & Integrations</h3>
                    <button
                        className="btn-secondary h-8 px-3 text-xs"
                        onClick={() => setPendingRotate('all')}
                        disabled={rotateMutation.isPending}
                    >
                        Regenerate All Tokens
                    </button>
                </div>

                <div className="mt-4 flex gap-6 border-b border-slate-800/60">
                    <button
                        className={`pb-3 text-sm font-medium transition-colors ${activeSdkTab === 'tokens' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'border-b-2 border-transparent text-slate-500 hover:text-slate-300'}`}
                        onClick={() => setActiveSdkTab('tokens')}
                    >
                        API Tokens
                    </button>
                    <button
                        className={`pb-3 text-sm font-medium transition-colors ${activeSdkTab === 'feature_flags' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'border-b-2 border-transparent text-slate-500 hover:text-slate-300'}`}
                        onClick={() => setActiveSdkTab('feature_flags')}
                    >
                        Feature Flags SDK Reference
                    </button>
                </div>

                <div className="mt-6">
                    {activeSdkTab === 'tokens' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-400">
                                Use these tokens in your client SDKs for tracking and feature flags.
                            </p>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500">Tracking API Key</span>
                                        <div className="flex items-center gap-2">
                                            <span className="badge-gray">{isLoading ? 'Loading' : 'Active'}</span>
                                            <button
                                                className="btn-secondary h-8 px-3 text-xs"
                                                onClick={() => setPendingRotate('tracking')}
                                                disabled={rotateMutation.isPending}
                                            >
                                                Regenerate
                                            </button>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <input className="input pr-9" value={trackingKey} readOnly />
                                        <button
                                            type="button"
                                            className="icon-action absolute right-2 top-1/2 -translate-y-1/2"
                                            onClick={() => handleCopy(trackingKey, 'tracking')}
                                            aria-label="Copy tracking key"
                                        >
                                            {copiedKey === 'tracking' ? (
                                                <span className="copy-burst" aria-hidden="true">
                                                    <span className="copy-burst-label">Copied</span>
                                                    <span className="copy-bubble copy-bubble-1" />
                                                    <span className="copy-bubble copy-bubble-2" />
                                                    <span className="copy-bubble copy-bubble-3" />
                                                    <span className="copy-bubble copy-bubble-4" />
                                                </span>
                                            ) : (
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                </svg>
                                            )}
                                            {copiedKey === 'tracking' && <span className="sr-only">Copied</span>}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500">Feature Flags Key</span>
                                        <div className="flex items-center gap-2">
                                            <span className="badge-info">SDK</span>
                                            <button
                                                className="btn-secondary h-8 px-3 text-xs"
                                                onClick={() => setPendingRotate('feature_flags')}
                                                disabled={rotateMutation.isPending}
                                            >
                                                Regenerate
                                            </button>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <input className="input pr-9" value={featureFlagsKey} readOnly />
                                        <button
                                            type="button"
                                            className="icon-action absolute right-2 top-1/2 -translate-y-1/2"
                                            onClick={() => handleCopy(featureFlagsKey, 'feature_flags')}
                                            aria-label="Copy feature flags key"
                                        >
                                            {copiedKey === 'feature_flags' ? (
                                                <span className="copy-burst" aria-hidden="true">
                                                    <span className="copy-burst-label">Copied</span>
                                                    <span className="copy-bubble copy-bubble-1" />
                                                    <span className="copy-bubble copy-bubble-2" />
                                                    <span className="copy-bubble copy-bubble-3" />
                                                    <span className="copy-bubble copy-bubble-4" />
                                                </span>
                                            ) : (
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                </svg>
                                            )}
                                            {copiedKey === 'feature_flags' && <span className="sr-only">Copied</span>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSdkTab === 'feature_flags' && (
                        <div>
                            <p className="text-sm text-slate-400">
                                Evaluate flags by user attributes with the lightweight client.
                            </p>
                            <pre className="mt-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-4 text-xs text-slate-200 overflow-x-auto">
                                {\`import {ExpothesisFeatureFlags} from '@/sdk/featureFlags';

                                const flags = new ExpothesisFeatureFlags({
                                    endpoint: 'http://localhost:8080/api/sdk/feature-flags/evaluate',
                                apiKey: '\${featureFlagsKey || 'YOUR_KEY'}'
});

                                const result = await flags.evaluate({
                                    userId: 'user_123',
                                attributes: {plan: 'pro', region: 'us' }
});

                                const isNewNavEnabled = await flags.isEnabled('new-nav', {
                                    userId: 'user_123',
                                attributes: {plan: 'pro' }
}); \`}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
            {pendingRotate && (
                <div className="modal-overlay">
                    <div className="modal-backdrop" onClick={() => setPendingRotate(null)} />
                    <div className="modal-panel max-w-lg">
                        <div className="modal-header">
                            <h3>Regenerate Tokens</h3>
                            <button type="button" className="icon-action" onClick={() => setPendingRotate(null)} aria-label="Close">
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                            <p>
                                You are about to regenerate{' '}
                                <span className="font-semibold text-slate-100">
                                    {pendingRotate === 'all'
                                        ? 'all SDK tokens'
                                        : pendingRotate === 'tracking'
                                            ? 'the tracking token'
                                            : 'the feature flags token'}
                                </span>
                                . Any clients using the current token will stop working.
                            </p>
                            <p>Continue?</p>
                        </div>
                        <div className="mt-5 flex items-center justify-end gap-3">
                            <button className="btn-secondary" onClick={() => setPendingRotate(null)}>
                                Cancel
                            </button>
                            <button
                                className="btn-danger"
                                onClick={() => {
                                    rotateMutation.mutate({ kind: pendingRotate });
                                    setPendingRotate(null);
                                }}
                                disabled={rotateMutation.isPending}
                            >
                                Regenerate
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const AccountManager: React.FC<{ accounts: Account[] }> = ({ accounts }) => {
    const queryClient = useQueryClient();
    const [name, setName] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);
    const createAccount = useMutation({
        mutationFn: (accountName: string) => accountApi.create(accountName),
        onSuccess: async () => {
            setName('');
            setSuccess('Account created');
            setError(null);
            await queryClient.invalidateQueries({ queryKey: ['accounts'] });
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to create account');
            setSuccess(null);
        },
    });

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="label">Create account</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                        className="input flex-1"
                        placeholder="e.g. Growth Team"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <button
                        className="btn-primary"
                        disabled={!name.trim() || createAccount.isPending}
                        onClick={() => {
                            if (!name.trim()) return;
                            createAccount.mutate(name.trim());
                        }}
                    >
                        {createAccount.isPending ? 'Adding…' : 'Add account'}
                    </button>
                </div>
                {error && <div className="text-xs text-rose-300">{error}</div>}
                {success && <div className="text-xs text-emerald-300">{success}</div>}
            </div>

            <div className="space-y-2">
                <div className="text-xs text-slate-500">Your accounts</div>
                <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800/70 bg-slate-950/40">
                    {accounts.length === 0 && (
                        <div className="px-4 py-3 text-sm text-slate-400">No accounts yet.</div>
                    )}
                    {accounts.map((account) => (
                        <div key={account.id} className="flex items-center justify-between px-4 py-3 text-sm">
                            <div>
                                <div className="font-semibold text-slate-100">{account.name}</div>
                                <div className="text-xs text-slate-500">{account.role}</div>
                            </div>
                            <span className="rounded-full bg-slate-800/70 px-3 py-1 text-xs text-slate-300">
                                {account.id.slice(0, 8)}…
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <div className="text-xs text-slate-500">Invite Team Members</div>
                <InviteManager />
            </div>
        </div>
    );
};

const InviteManager: React.FC = () => {
    const { activeAccountId } = useAccount();
    const [email, setEmail] = React.useState('');
    const [role, setRole] = React.useState('member');
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);

    const inviteMutation = useMutation({
        mutationFn: (data: { email: string; role: string }) => {
            if (!activeAccountId) throw new Error('No active account selected');
            return accountApi.createInvite(activeAccountId, data);
        },
        onSuccess: () => {
            setEmail('');
            setSuccess(`Invitation sent to ${email} `);
            setError(null);
        },
        onError: (err: any) => {
            setError(err.response?.data?.error || 'Failed to send invitation');
            setSuccess(null);
        }
    });

    if (!activeAccountId) {
        return <div className="text-sm text-slate-400">Please select an account in the sidebar to invite members.</div>;
    }

    return (
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_120px_100px]">
                <input
                    className="input"
                    type="email"
                    placeholder="teammate@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <select
                    className="input"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                </select>
                <button
                    className="btn-primary h-[40px]"
                    disabled={!email.trim() || inviteMutation.isPending}
                    onClick={() => inviteMutation.mutate({ email, role })}
                >
                    {inviteMutation.isPending ? 'Sending...' : 'Invite'}
                </button>
            </div>
            {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
            {success && <p className="mt-2 text-xs text-emerald-300">{success}</p>}
        </div>
    );
};

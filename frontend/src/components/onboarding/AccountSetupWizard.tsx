import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { accountApi } from '../../services/api';
import { useAccount } from '../../contexts/AccountContext';

export const AccountSetupWizard: React.FC = () => {
    const navigate = useNavigate();
    const { setActiveAccountId } = useAccount();
    const queryClient = useQueryClient();
    const [step, setStep] = React.useState<'account_create' | 'invite_members' | 'success'>('account_create');
    const [accountName, setAccountName] = React.useState('');
    const [invites, setInvites] = React.useState<{ email: string; role: string }[]>([]);
    const [newInviteEmail, setNewInviteEmail] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [createdAccountId, setCreatedAccountId] = React.useState<string | null>(null);

    const handleCreateAccount = async () => {
        if (!accountName.trim()) return;
        setIsLoading(true);
        setError(null);
        try {
            const res = await accountApi.create(accountName);
            const accountId = res.data.id;
            setCreatedAccountId(accountId);
            setActiveAccountId(accountId);
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setStep('invite_members');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create account');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddInvite = () => {
        if (!newInviteEmail.trim()) return;
        setInvites([...invites, { email: newInviteEmail, role: 'member' }]);
        setNewInviteEmail('');
    };

    const handleFinish = async () => {
        if (!createdAccountId) return;
        setIsLoading(true);
        try {
            for (const invite of invites) {
                await accountApi.createInvite(createdAccountId, invite);
            }
            setStep('success');
        } catch (err: any) {
            setError('Failed to send some invitations, but your account is ready.');
            setStep('success');
        } finally {
            setIsLoading(false);
        }
    };

    if (step === 'success') {
        return (
            <div className="flex min-h-screen items-center justify-center px-6">
                <div className="card w-full max-w-md text-center">
                    <div className="mb-4 flex justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-500/20 text-cyan-400">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <h2 className="mb-2">You're all set!</h2>
                    <p className="mb-6 text-slate-400">
                        Your account <strong>{accountName}</strong> has been created.
                        {invites.length > 0 && ` We've sent ${invites.length} invitations to your team.`}
                    </p>
                    <button className="btn-primary w-full" onClick={() => navigate('/home')}>
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center px-6 py-10">
            <div className="card w-full max-w-md">
                <div className="mb-6">
                    <div className="flex space-x-2">
                        <div className={`h-1 flex-1 rounded-full ${step === 'account_create' ? 'bg-gray-500' : 'bg-slate-700'}`} />
                        <div className={`h-1 flex-1 rounded-full ${step === 'invite_members' ? 'bg-gray-500' : 'bg-slate-700'}`} />
                    </div>
                </div>

                {error && <div className="mb-4 text-sm text-rose-300">{error}</div>}

                {step === 'account_create' ? (
                    <>
                        <h2 className="mb-2 text-2xl">Create your Account</h2>
                        <p className="mb-6 text-md text-slate-400">
                            Give your team a name to get started. You can always change this later.
                        </p>
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Account Name</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={accountName}
                                    onChange={(e) => setAccountName(e.target.value)}
                                    placeholder="Acme Corp"
                                    autoFocus
                                />
                            </div>
                            <button
                                className="btn-primary w-full"
                                onClick={handleCreateAccount}
                                disabled={!accountName.trim() || isLoading}
                            >
                                {isLoading ? 'Creating...' : 'Continue'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h2 className="mb-2 text-3xl font-semibold">Invite your team</h2>
                        <p className="mb-6 text-sm text-slate-400">
                            Beaker is better with others. Invite your teammates to collaborate.
                        </p>
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    className="input flex-1"
                                    value={newInviteEmail}
                                    onChange={(e) => setNewInviteEmail(e.target.value)}
                                    placeholder="teammate@example.com"
                                    onKeyPress={(e) => e.key === 'Enter' && handleAddInvite()}
                                />
                                <button className="btn-secondary" onClick={handleAddInvite}>
                                    Add
                                </button>
                            </div>

                            {invites.length > 0 && (
                                <div className="max-h-40 overflow-y-auto rounded-lg bg-slate-800/50 p-3">
                                    {invites.map((invite, idx) => (
                                        <div key={idx} className="flex items-center justify-between py-1 text-sm border-b border-slate-700/50 last:border-0">
                                            <span className="text-slate-300">{invite.email}</span>
                                            <button
                                                className="text-slate-500 hover:text-rose-400"
                                                onClick={() => setInvites(invites.filter((_, i) => i !== idx))}
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-col gap-3">
                                <button className="btn-primary w-full" onClick={handleFinish} disabled={isLoading}>
                                    {isLoading ? 'Sending invites...' : invites.length > 0 ? 'Send Invites & Finish' : 'Skip & Finish'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

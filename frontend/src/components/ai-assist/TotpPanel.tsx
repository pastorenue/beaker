import React from 'react';
import { authApi } from '../../services/api';

type TotpPanelProps = {
    totpSecret: string | null;
    totpUrl: string | null;
    totpCode: string;
    onSecretChange: (secret: string | null) => void;
    onUrlChange: (url: string | null) => void;
    onCodeChange: (code: string) => void;
};

export const TotpPanel: React.FC<TotpPanelProps> = ({
    totpSecret,
    totpUrl,
    totpCode,
    onSecretChange,
    onUrlChange,
    onCodeChange,
}) => {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <h3>Authenticator 2FA</h3>
                <span className="badge-gray">TOTP</span>
            </div>
            <p className="mt-3 text-sm text-slate-300">Enable an authenticator app for stronger access control.</p>
            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    className="btn-secondary"
                    onClick={async () => {
                        const userId = window.localStorage.getItem('expothesis-user-id');
                        if (!userId) return;
                        const res = await authApi.setupTotp(userId);
                        onSecretChange(res.data.secret);
                        onUrlChange(res.data.otpauth_url);
                    }}
                >
                    Generate Secret
                </button>
                {totpSecret && (
                    <button
                        className="btn-primary"
                        onClick={async () => {
                            const userId = window.localStorage.getItem('expothesis-user-id');
                            if (!userId || !totpCode) return;
                            await authApi.verifyTotp(userId, totpCode);
                            onCodeChange('');
                        }}
                    >
                        Verify & Enable
                    </button>
                )}
            </div>
            {totpSecret && (
                <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3 text-sm text-slate-300">
                    <div className="text-xs text-slate-400">Secret</div>
                    <div className="mt-1 font-mono break-all">{totpSecret}</div>
                    {totpUrl && <div className="mt-2 text-xs text-slate-400">otpauth: {totpUrl}</div>}
                    <input
                        className="input mt-3"
                        value={totpCode}
                        onChange={(event) => onCodeChange(event.target.value)}
                        placeholder="Enter 6-digit code"
                    />
                </div>
            )}
        </div>
    );
};

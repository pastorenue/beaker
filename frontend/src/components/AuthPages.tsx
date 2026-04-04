import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, inviteApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { InviteDetailsResponse } from '../types';

const normalizeAuthError = (message: string) => {
    const normalized = message.trim();
    if (normalized.toLowerCase().includes('totp')) {
        return 'Invalid code. Please check your authenticator app and try again.';
    }
    if (normalized.toLowerCase().includes('otp')) {
        return 'Invalid code. Please try again.';
    }
    if (normalized.toLowerCase().includes('password')) {
        return 'Email or password is incorrect.';
    }
    return normalized;
};

const getAuthError = (error: unknown, fallback: string) => {
    const err = error as { response?: { data?: { error?: string } } };
    const raw = err.response?.data?.error ?? fallback;
    return normalizeAuthError(raw);
};

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [totp, setTotp] = React.useState('');
    const [totpEnabled, setTotpEnabled] = React.useState(false);
    const [step, setStep] = React.useState<'login' | 'otp'>('login');
    const [error, setError] = React.useState<string | null>(null);
    const { login } = useAuth();

    const handleLogin = async () => {
        setError(null);
        try {
            const res = await authApi.login({ email, password });
            setTotpEnabled(res.data.totp_enabled);
            if (res.data.token && res.data.user_id) {
                login(res.data.token, res.data.user_id);
                navigate('/home');
                return;
            }
            if (!res.data.requires_otp) {
                const tokenRes = await authApi.verifyOtp({ email, code: '' });
                login(tokenRes.data.token, tokenRes.data.user_id);
                navigate('/home');
                return;
            }
            setStep('otp');
        } catch (err: unknown) {
            setError(getAuthError(err, 'Login failed'));
        }
    };

    const handleVerify = async () => {
        setError(null);
        try {
            const res = await authApi.verifyOtp({ email, code: '', totp_code: totp || undefined });
            login(res.data.token, res.data.user_id);
            navigate('/home');
        } catch (err: unknown) {
            setError(getAuthError(err, 'Verification failed'));
        }
    };

    return (
        <div className="lp flex min-h-screen flex-col items-center justify-center p-6">
            <header className="lp-nav lp-nav--scrolled absolute top-0 w-full" style={{ position: 'absolute' }}>
                <div className="lp-nav-inner justify-between">
                    <Link to="/" className="lp-logo">
                        <span className="lp-logo-mark">Ex</span>
                        <span className="lp-logo-text">Expothesis</span>
                    </Link>
                    <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">Back to home &rarr;</Link>
                </div>
            </header>

            <div className="w-full max-w-[420px] space-y-8 relative z-10 pt-16">
                <div className="text-center">
                    <h2 className="text-4xl font-medium text-slate-900">
                        {step === 'login' ? 'Sign in to Expothesis' : 'Verify your sign-in'}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                        {step === 'login'
                            ? 'Secure access to your experimentation control plane.'
                            : 'Enter the code from your authenticator app to continue.'}
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200/60 bg-white p-8 shadow-xl shadow-slate-200/40">
                    {error && <div className="mb-4 rounded-lg bg-red-50/80 p-3 text-sm text-red-600 border border-red-100">{error}</div>}
                    <div className="space-y-4">
                        {step === 'login' ? (
                            <>
                                <div>
                                    <input
                                        type="email"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Email address"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="password"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Password"
                                    />
                                </div>
                                <button className="lp-btn lp-btn-primary w-full !py-3 !text-sm mt-2" onClick={handleLogin}>
                                    Sign In →
                                </button>
                                <div className="pt-4 text-center text-sm text-slate-500">
                                    No account? <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">Create one</Link>
                                </div>
                            </>
                        ) : (
                            <>
                                {totpEnabled && (
                                    <input
                                        type="text"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                        value={totp}
                                        onChange={(e) => setTotp(e.target.value)}
                                        placeholder="Authenticator code"
                                    />
                                )}
                                <button className="lp-btn lp-btn-primary w-full !py-3 !text-sm mt-2" onClick={handleVerify}>
                                    Verify & Sign in →
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {step === 'login' && (
                    <div className="grid grid-cols-3 gap-6 border-t border-slate-200 pt-8 text-center text-[1rem] text-slate-500">
                        <div>
                            <span className="block font-semibold text-slate-700">Feature flags</span>
                            Target precisely.
                        </div>
                        <div>
                            <span className="block font-semibold text-slate-700">A/B testing</span>
                            CUPED built-in.
                        </div>
                        <div>
                            <span className="block font-semibold text-slate-700">Analytics</span>
                            Live lift tracking.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [inviteDetails, setInviteDetails] = React.useState<InviteDetailsResponse | null>(null);
    const { login } = useAuth();
    const inviteToken = searchParams.get('token');

    React.useEffect(() => {
        if (inviteToken) {
            inviteApi.getDetails(inviteToken).then(res => {
                setInviteDetails(res.data);
                setEmail(res.data.email);
            }).catch(() => {
                setError('Invalid or expired invitation link.');
            });
        }
    }, [inviteToken]);

    const handleRegister = async () => {
        setError(null);
        try {
            const res = await authApi.register({
                email,
                password,
                invite_token: inviteToken || undefined
            });

            if (res.data.token && res.data.user_id) {
                login(res.data.token, res.data.user_id);
                if (inviteToken) {
                    navigate('/home');
                } else {
                    navigate('/setup');
                }
                return;
            }
            if (!res.data.requires_otp) {
                const tokenRes = await authApi.verifyOtp({ email, code: '' });
                login(tokenRes.data.token, tokenRes.data.user_id);
                if (inviteToken) {
                    navigate('/home');
                } else {
                    navigate('/setup');
                }
                return;
            }
        } catch (err: unknown) {
            setError(getAuthError(err, 'Registration failed'));
        }
    };

    return (
        <div className="lp flex min-h-screen flex-col items-center justify-center p-6">
            <header className="lp-nav lp-nav--scrolled absolute top-0 w-full" style={{ position: 'absolute' }}>
                <div className="lp-nav-inner justify-between">
                    <Link to="/" className="lp-logo">
                        <span className="lp-logo-mark">Ex</span>
                        <span className="lp-logo-text">Expothesis</span>
                    </Link>
                    <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">Back to home &rarr;</Link>
                </div>
            </header>

            <div className="w-full max-w-[420px] space-y-8 relative z-10 pt-16">
                <div className="text-center">
                    <h2 className="text-4xl font-medium text-slate-900">
                        {inviteDetails ? 'Accept Invitation' : 'Create account'}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                        {inviteDetails
                            ? `You've been invited to join ${inviteDetails.account_name}. Create your account to continue.`
                            : 'Create your account to start experimenting.'}
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200/60 bg-white p-8 shadow-xl shadow-slate-200/40">
                    {error && <div className="mb-4 rounded-lg bg-red-50/80 p-3 text-sm text-red-600 border border-red-100">{error}</div>}
                    <div className="space-y-4">
                        <div>
                            <input
                                type="email"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                            />
                        </div>
                        <button className="lp-btn lp-btn-primary w-full !py-3 !text-sm mt-2" onClick={handleRegister}>
                            {inviteDetails ? 'Accept & Continue →' : 'Register →'}
                        </button>
                        <div className="pt-4 text-center text-sm text-slate-500">
                            Already have an account? <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">Sign in</Link>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-6 border-t border-slate-200 pt-8 text-center text-[1rem] text-slate-500">
                    <div>
                        <span className="block font-semibold text-slate-700">Frictionless</span>
                        Setup in minutes.
                    </div>
                    <div>
                        <span className="block font-semibold text-slate-700">Smarter tests</span>
                        With CUPED.
                    </div>
                    <div>
                        <span className="block font-semibold text-slate-700">Live stream</span>
                        Realtime data.
                    </div>
                </div>
            </div>
        </div>
    );
};

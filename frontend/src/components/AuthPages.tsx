import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, inviteApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { InviteDetailsResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

const normalizeAuthError = (message: string) => {
    const normalized = message.trim();
    if (normalized.toLowerCase().includes('totp')) {
        return 'Invalid code. Please check your authenticator app and try again.';
    }
    if (normalized.toLowerCase().includes('otp')) {
        return 'Invalid code. Please try again.';
    }
    if (normalized.toLowerCase().includes('password') && !normalized.toLowerCase().includes('google')) {
        return 'Email or password is incorrect.';
    }
    return normalized;
};

const getAuthError = (error: unknown, fallback: string) => {
    const err = error as { response?: { data?: { error?: string } } };
    const raw = err.response?.data?.error ?? fallback;
    return normalizeAuthError(raw);
};

const GoogleIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
        <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
);

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [totp, setTotp] = React.useState('');
    const [totpEnabled, setTotpEnabled] = React.useState(false);
    const [step, setStep] = React.useState<'login' | 'otp'>('login');
    const [error, setError] = React.useState<string | null>(null);
    const [rememberMe, setRememberMe] = React.useState(false);
    const { login } = useAuth();

    const oauthError = searchParams.get('error');
    const successMessage = searchParams.get('message');

    const handleLogin = async () => {
        setError(null);
        try {
            const res = await authApi.login({ email, password, remember_me: rememberMe });
            setTotpEnabled(res.data.totp_enabled);
            if (res.data.token && res.data.user_id) {
                login(res.data.token, res.data.user_id);
                navigate('/home');
                return;
            }
            if (!res.data.requires_otp) {
                const tokenRes = await authApi.verifyOtp({ email, code: '', remember_me: rememberMe });
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
            const res = await authApi.verifyOtp({ email, code: '', totp_code: totp || undefined, remember_me: rememberMe });
            login(res.data.token, res.data.user_id);
            navigate('/home');
        } catch (err: unknown) {
            setError(getAuthError(err, 'Verification failed'));
        }
    };

    const displayError = error || oauthError;

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
                    {successMessage && (
                        <div className="mb-4 rounded-lg bg-green-50/80 p-3 text-sm text-green-700 border border-green-100">
                            {successMessage}
                        </div>
                    )}
                    {displayError && (
                        <div className="mb-4 rounded-lg bg-red-50/80 p-3 text-sm text-red-600 border border-red-100">
                            {displayError}
                        </div>
                    )}
                    <div className="space-y-4">
                        {step === 'login' ? (
                            <>
                                <div>
                                    <input
                                        type="email"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                                        placeholder="Email address"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="password"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                                        placeholder="Password"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                            className="rounded border-slate-300"
                                        />
                                        Remember me
                                    </label>
                                    <Link to="/forgot-password" className="text-xs text-slate-500 hover:text-slate-700">
                                        Forgot password?
                                    </Link>
                                </div>
                                <button className="lp-btn lp-btn-primary w-full !py-3 !text-sm mt-2" onClick={handleLogin}>
                                    Sign In →
                                </button>
                                <div className="relative flex items-center gap-3">
                                    <div className="flex-1 border-t border-slate-200" />
                                    <span className="text-xs text-slate-400">or</span>
                                    <div className="flex-1 border-t border-slate-200" />
                                </div>
                                <a
                                    href={`${API_BASE}/api/auth/oauth/google?remember_me=${rememberMe}`}
                                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                                >
                                    <GoogleIcon />
                                    Continue with Google
                                </a>
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
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
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
                                onKeyDown={(e) => { if (e.key === 'Enter') handleRegister(); }}
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleRegister(); }}
                                placeholder="Password"
                            />
                        </div>
                        <button className="lp-btn lp-btn-primary w-full !py-3 !text-sm mt-2" onClick={handleRegister}>
                            {inviteDetails ? 'Accept & Continue →' : 'Register →'}
                        </button>
                        <div className="relative flex items-center gap-3">
                            <div className="flex-1 border-t border-slate-200" />
                            <span className="text-xs text-slate-400">or</span>
                            <div className="flex-1 border-t border-slate-200" />
                        </div>
                        <a
                            href={`${API_BASE}/api/auth/oauth/google`}
                            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                        >
                            <GoogleIcon />
                            Continue with Google
                        </a>
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

export const ForgotPasswordPage: React.FC = () => {
    const [email, setEmail] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [submitted, setSubmitted] = React.useState(false);

    const handleSubmit = async () => {
        setError(null);
        try {
            await authApi.forgotPassword({ email });
            setSubmitted(true);
        } catch {
            setError('Something went wrong. Please try again.');
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
                    <h2 className="text-4xl font-medium text-slate-900">Reset password</h2>
                    <p className="mt-2 text-sm text-slate-500">
                        Enter your email and we'll send a reset link if an account exists.
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200/60 bg-white p-8 shadow-xl shadow-slate-200/40">
                    {submitted ? (
                        <div className="text-center space-y-4">
                            <div className="rounded-lg bg-green-50/80 p-4 text-sm text-green-700 border border-green-100">
                                Check your inbox — if that email exists, a reset link is on its way.
                            </div>
                            <Link to="/login" className="block text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
                                Back to sign in
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {error && (
                                <div className="rounded-lg bg-red-50/80 p-3 text-sm text-red-600 border border-red-100">
                                    {error}
                                </div>
                            )}
                            <input
                                type="email"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                                placeholder="Email address"
                            />
                            <button
                                className="lp-btn lp-btn-primary w-full !py-3 !text-sm mt-2"
                                onClick={handleSubmit}
                            >
                                Send reset link →
                            </button>
                            <div className="pt-2 text-center text-sm text-slate-500">
                                <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
                                    Back to sign in
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [newPassword, setNewPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);

    const token = searchParams.get('token') ?? '';

    const handleSubmit = async () => {
        setError(null);
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        try {
            await authApi.resetPassword({ token, new_password: newPassword });
            navigate('/login?message=Password+reset+successfully', { replace: true });
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error ?? 'Failed to reset password. The link may have expired.');
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
                    <h2 className="text-4xl font-medium text-slate-900">Set new password</h2>
                    <p className="mt-2 text-sm text-slate-500">Choose a strong password for your account.</p>
                </div>

                <div className="rounded-2xl border border-slate-200/60 bg-white p-8 shadow-xl shadow-slate-200/40">
                    <div className="space-y-4">
                        {error && (
                            <div className="rounded-lg bg-red-50/80 p-3 text-sm text-red-600 border border-red-100">
                                {error}
                            </div>
                        )}
                        <input
                            type="password"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                            placeholder="New password"
                        />
                        <input
                            type="password"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                            placeholder="Confirm new password"
                        />
                        <button
                            className="lp-btn lp-btn-primary w-full !py-3 !text-sm mt-2"
                            onClick={handleSubmit}
                        >
                            Reset password →
                        </button>
                        <div className="pt-2 text-center text-sm text-slate-500">
                            <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
                                Back to sign in
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

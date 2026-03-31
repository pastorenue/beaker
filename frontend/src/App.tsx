import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { accountApi, authApi } from './services/api';
import { UserGroupManager } from './components/UserGroupManager';
import { SimulationStudio } from './components/SimulationStudio';
import { FeatureFlagManager } from './components/FeatureFlagManager';
import { SessionReplayPanel } from './components/SessionReplayPanel';
import { AnalyticsMonitoringDashboard } from './components/AnalyticsMonitoringDashboard';
import { HomeOverview } from './components/HomeOverview';
import { AiAssistHub } from './components/AiAssistHub';
import { TemplatesPlan } from './components/TemplatesPlan';
import { LoginPage, RegisterPage } from './components/AuthPages';
import { UserSettings } from './components/UserSettings';
import { Account } from './types';
import { AccountProvider, useAccount } from './contexts/AccountContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AccountSetupWizard } from './components/onboarding/AccountSetupWizard';
import { HomePage } from './pages/HomePage';
import { ExperimentDetailPage } from './pages/ExperimentDetailPage';
import { LandingPage } from './pages/LandingPage';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

function Layout({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [isRailCollapsed, setIsRailCollapsed] = React.useState(false);
    const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');
    const [idleWarningVisible, setIdleWarningVisible] = React.useState(false);
    const [idleSecondsLeft, setIdleSecondsLeft] = React.useState(300);
    const idleWarningTimeoutRef = React.useRef<number | null>(null);
    const idleLogoutTimeoutRef = React.useRef<number | null>(null);
    const idleCountdownRef = React.useRef<number | null>(null);

    const { token: authToken, userId, logout } = useAuth();
    const { activeAccountId, setActiveAccountId } = useAccount();

    const { data: userProfile } = useQuery({
        queryKey: ['me', userId],
        queryFn: async () => (await authApi.me(userId!)).data,
        enabled: !!userId && !!authToken,
    });

    const { data: accounts = [] } = useQuery({
        queryKey: ['accounts', userId],
        queryFn: async () => (await accountApi.list()).data,
        enabled: !!authToken,
    });

    React.useEffect(() => {
        if (accounts.length === 0) {
            return;
        }
        const currentExists = activeAccountId && accounts.some((o) => o.id === activeAccountId);
        if (!currentExists) {
            setActiveAccountId(accounts[0].id);
        }
    }, [activeAccountId, accounts, setActiveAccountId]);

    const navItems = [
        {
            to: '/home',
            label: 'Home',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5l8-6 8 6V20a1 1 0 0 1-1 1h-4.5a.5.5 0 0 1-.5-.5V15a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v5.5a.5.5 0 0 1-.5.5H5a1 1 0 0 1-1-1v-9.5Z" />
                </svg>
            ),
        },
        {
            to: '/dashboard',
            label: 'Experiments',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h10M4 12h16M4 17h7" />
                </svg>
            ),
        },
        {
            to: '/insights',
            label: 'Insights',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m5 14V9m5 10V7m5 12V11" />
                </svg>
            ),
        },
        {
            to: '/ai-assist',
            label: 'AI Assist',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m12.36 6.36-2.12-2.12M8.76 8.76 6.64 6.64m8.72 0-2.12 2.12M8.76 15.24 6.64 17.36" />
                </svg>
            ),
        },
        {
            to: '/user-groups',
            label: 'User Groups',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 4c-3 0-5 1.5-5 3v1h10v-1c0-1.5-2-3-5-3Zm8 0c-1 0-2 .2-3 .6a4.4 4.4 0 0 1 2 3.4v1h7v-1c0-1.5-2-3-6-3Z" />
                </svg>
            ),
        },
        {
            to: '/simulation-studio',
            label: 'Simulation Studio',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h6v6H6zM12 12h6v6h-6zM12 6h6v6h-6zM6 12h6v6H6z" />
                </svg>
            ),
        },
        {
            to: '/feature-flags',
            label: 'Feature Flags',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18m0-15h9l-2 3 2 3H5" />
                </svg>
            ),
        },
        {
            to: '/sessions',
            label: 'Sessions',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
                </svg>
            ),
        },
        {
            to: '/templates',
            label: 'Templates/Plan',
            icon: (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6M9 13h6M9 17h4" />
                </svg>
            ),
        },
    ];

    const pageTitle = location.pathname.startsWith('/experiment/')
        ? 'Experiment Control'
        : location.pathname.startsWith('/home')
            ? 'Home'
            : location.pathname.startsWith('/user-groups')
                ? 'User Segments'
                : location.pathname.startsWith('/simulation-studio')
                    ? 'Simulation Studio'
                    : location.pathname.startsWith('/feature-flags')
                        ? 'Feature Flags'
                        : location.pathname.startsWith('/sessions')
                            ? 'Sessions'
                            : location.pathname.startsWith('/templates')
                                ? 'Templates/Plan'
                                : location.pathname.startsWith('/insights')
                                    ? 'Insights'
                                    : location.pathname.startsWith('/settings')
                                        ? 'User Settings'
                                        : location.pathname.startsWith('/ai-assist')
                                            ? 'AI Assist'
                                            : location.pathname.startsWith('/dashboard')
                                                ? 'Experiment Dashboard'
                                                : 'Experiment Dashboard';

    React.useEffect(() => {
        const saved = window.localStorage.getItem('expothesis-theme');
        if (saved === 'light' || saved === 'dark') {
            setTheme(saved);
        }
    }, []);

    React.useEffect(() => {
        document.documentElement.classList.toggle('theme-light', theme === 'light');
        window.localStorage.setItem('expothesis-theme', theme);
    }, [theme]);

    const warnAfterMs = 20 * 60 * 1000;
    const logoutAfterMs = 25 * 60 * 1000;

    const clearIdleTimers = React.useCallback(() => {
        if (idleWarningTimeoutRef.current) {
            window.clearTimeout(idleWarningTimeoutRef.current);
            idleWarningTimeoutRef.current = null;
        }
        if (idleLogoutTimeoutRef.current) {
            window.clearTimeout(idleLogoutTimeoutRef.current);
            idleLogoutTimeoutRef.current = null;
        }
        if (idleCountdownRef.current) {
            window.clearInterval(idleCountdownRef.current);
            idleCountdownRef.current = null;
        }
    }, []);

    const handleLogout = React.useCallback(() => {
        logout();
        navigate('/login', { replace: true });
    }, [logout, navigate]);

    const startIdleTimers = React.useCallback(() => {
        clearIdleTimers();
        setIdleWarningVisible(false);
        setIdleSecondsLeft(Math.max(1, Math.floor((logoutAfterMs - warnAfterMs) / 1000)));
        idleWarningTimeoutRef.current = window.setTimeout(() => {
            setIdleWarningVisible(true);
            const deadline = Date.now() + (logoutAfterMs - warnAfterMs);
            idleCountdownRef.current = window.setInterval(() => {
                const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
                setIdleSecondsLeft(remaining);
            }, 1000);
        }, warnAfterMs);
        idleLogoutTimeoutRef.current = window.setTimeout(() => {
            handleLogout();
        }, logoutAfterMs);
    }, [clearIdleTimers, handleLogout, logoutAfterMs, warnAfterMs]);

    const isPublicRoute = ['/', '/login', '/register'].includes(location.pathname);

    React.useEffect(() => {
        if (!authToken || isPublicRoute) {
            clearIdleTimers();
            setIdleWarningVisible(false);
            return;
        }
        startIdleTimers();
        const handleActivity = () => {
            startIdleTimers();
        };
        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
        return () => {
            events.forEach((event) => window.removeEventListener(event, handleActivity));
            clearIdleTimers();
        };
    }, [authToken, clearIdleTimers, isPublicRoute, startIdleTimers]);

    if (isPublicRoute) {
        return <>{children}</>;
    }

    if (!authToken && !isPublicRoute) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="app-shell">
            <div className={`app-grid ${isRailCollapsed ? 'app-grid-rail' : ''}`}>
                {isSidebarOpen && (
                    <button
                        aria-label="Close navigation"
                        className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur md:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}
                <aside
                    className={`sidebar relative fixed left-0 top-0 z-40 h-full transform transition-transform duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                        } ${isRailCollapsed ? 'sidebar-collapsed' : 'w-[260px]'}`}
                >
                    <button
                        className="sidebar-float-toggle"
                        onClick={() => setIsRailCollapsed((prev) => !prev)}
                        aria-label={isRailCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className={`h-4 w-4 transition-transform duration-300 ${isRailCollapsed ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-6 7 6 7" />
                        </svg>
                    </button>
                    <Link to="/home" className="sidebar-brand">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-900 font-bold">
                            Ex
                        </div>
                        <div>
                            <div className="text-lg font-semibold">Expothesis</div>
                            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Labs</div>
                        </div>
                    </Link>

                    <div className="sidebar-pill">Experiment Suite</div>

                    <div className="px-3 pb-4">
                        <div className="relative">
                            <select
                                className="w-full appearance-none rounded-lg border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                                value={activeAccountId ?? ''}
                                onChange={(e) => setActiveAccountId(e.target.value)}
                            >
                                {accounts.map((account: Account) => (
                                    <option key={account.id} value={account.id} className="bg-slate-900 text-slate-200">
                                        {account.name}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="mb-4 border-b border-slate-800/60 mx-3" />

                    <nav className="space-y-2">
                        {navItems.map((item) => {
                            const isActive =
                                item.to === '/dashboard' || item.to === '/home'
                                    ? location.pathname === item.to
                                    : location.pathname.startsWith(item.to);
                            return (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    className={`sidebar-link group relative ${isActive ? 'sidebar-link-active' : ''}`}
                                    onClick={() => setIsSidebarOpen(false)}
                                    aria-label={item.label}
                                >
                                    <span className="text-cyan-200/80">{item.icon}</span>
                                    <span className={isRailCollapsed ? 'md:sr-only' : ''}>
                                        {item.label}
                                    </span>
                                    <span className="rail-tooltip" role="tooltip">
                                        {item.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-auto space-y-4">
                        <div className="panel">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">System</p>
                            <p className="mt-2 text-sm text-slate-300">Realtime analytics</p>
                            <p className="text-xs text-slate-500">Streaming updates every 5s</p>
                        </div>
                        <div className="sidebar-actions">
                            <Link to="/settings" className="sidebar-link group relative">
                                <span className="text-cyan-200/80">
                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm8 5.5-1.7.3a6.7 6.7 0 0 1-.7 1.7l1 1.4-1.6 1.6-1.4-1a6.7 6.7 0 0 1-1.7.7L12 20l-2.3-1.7a6.7 6.7 0 0 1-1.7-.7l-1.4 1-1.6-1.6 1-1.4a6.7 6.7 0 0 1-.7-1.7L4 12l1.7-2.3a6.7 6.7 0 0 1 .7-1.7l-1-1.4L7 4.9l1.4 1a6.7 6.7 0 0 1 1.7-.7L12 4l2.3 1.7a6.7 6.7 0 0 1 1.7.7l1.4-1L19 7l-1 1.4a6.7 6.7 0 0 1 .7 1.7L20 12Z"
                                        />
                                    </svg>
                                </span>
                                <span className={isRailCollapsed ? 'md:sr-only' : ''}>User Settings</span>
                                <span className="rail-tooltip" role="tooltip">User Settings</span>
                            </Link>
                            <button
                                type="button"
                                className="sidebar-link group relative"
                                onClick={() => {
                                    handleLogout();
                                    setIsSidebarOpen(false);
                                }}
                                aria-label="Log out"
                            >
                                <span className="text-rose-300/80">
                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 17l5-5-5-5" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3" />
                                    </svg>
                                </span>
                                <span className={isRailCollapsed ? 'md:sr-only' : ''}>Log out</span>
                                <span className="rail-tooltip" role="tooltip">Log out</span>
                            </button>
                        </div>

                    </div>
                </aside>

                <div className="flex min-h-screen flex-col">
                    <header className="topbar">
                        <div className="flex items-center gap-3">
                            <button
                                className="btn-secondary h-10 w-10 p-0 md:hidden"
                                aria-label="Open navigation"
                                onClick={() => setIsSidebarOpen(true)}
                            >
                                <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
                                </svg>
                            </button>
                            <div>
                                <div className="topbar-title">{pageTitle}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="meta-chip">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-cyan-200">
                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 9V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V9M3 21h18M4 21v-9.5A1.5 1.5 0 0 1 5.5 10h13A1.5 1.5 0 0 1 20 11.5V21" />
                                    </svg>
                                </div>
                                <div className="leading-tight">
                                    <div className="text-sm font-semibold text-slate-100">
                                        {accounts.find((o) => o.id === activeAccountId)?.name ?? 'No account'}
                                    </div>
                                </div>
                            </div>
                            <div className="meta-chip">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-200 font-semibold">
                                    {(userProfile?.email?.[0] || '?').toUpperCase()}
                                </div>
                                <div className="leading-tight">
                                    <div className="text-sm font-semibold text-slate-100">
                                        {userProfile?.email || '—'}
                                    </div>
                                </div>
                            </div>
                            <button
                                className="btn-secondary h-8 w-8 p-0"
                                aria-label="Toggle dark mode"
                                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                            >
                                {theme === 'dark' ? (
                                    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.36 6.36-1.41-1.41M8.05 8.05 6.64 6.64m10.72 0-1.41 1.41M8.05 15.95l-1.41 1.41"
                                        />
                                        <circle cx="12" cy="12" r="4" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"
                                        />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </header>
                    <main className="px-8 py-8">{children}</main>
                </div>
            </div>
            {idleWarningVisible && (
                <div className="toast toast-warning" role="status" aria-live="polite">
                    <div>
                        <p className="toast-title">You're about to be signed out</p>
                        <p className="toast-body">No activity detected. We'll sign you out in {idleSecondsLeft}s.</p>
                    </div>
                    <div className="toast-actions">
                        <button className="btn-secondary" onClick={startIdleTimers}>
                            Stay signed in
                        </button>
                        <button className="btn-danger" onClick={handleLogout}>
                            Sign out now
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <AccountProvider>
                        <Layout>
                            <Routes>
                                <Route path="/" element={<LandingPage />} />
                                <Route path="/login" element={<LoginPage />} />
                                <Route path="/register" element={<RegisterPage />} />
                                <Route path="/home" element={<HomeOverview />} />
                                <Route path="/setup" element={<AccountSetupWizard />} />
                                <Route path="/dashboard" element={<HomePage />} />
                                <Route path="/experiment/:id" element={<ExperimentDetailPage />} />
                                <Route path="/user-groups" element={<UserGroupManager />} />
                                <Route path="/insights" element={<AnalyticsMonitoringDashboard />} />
                                <Route path="/ai-assist" element={<AiAssistHub />} />
                                <Route path="/simulation-studio" element={<SimulationStudio />} />
                                <Route path="/feature-flags" element={<FeatureFlagManager />} />
                                <Route path="/templates" element={<TemplatesPlan />} />
                                <Route path="/settings" element={<UserSettings />} />
                                <Route
                                    path="/sessions"
                                    element={
                                        <div className="space-y-6">
                                            <div>
                                                <h1>Session Replay</h1>
                                                <p className="mt-1 text-slate-400">
                                                    Review session replays, heatmaps, and live activity.
                                                </p>
                                            </div>
                                            <SessionReplayPanel />
                                        </div>
                                    }
                                />
                            </Routes>
                        </Layout>
                    </AccountProvider>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

export default App;

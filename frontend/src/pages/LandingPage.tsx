import React from 'react';
import { Link } from 'react-router-dom';
import { ExpothesisTracker } from '../../../sdk/typescript/src/expothesis';

const isLoggedIn = () => !!window.localStorage.getItem('expothesis-token');

const NAV_LINKS = [
    { label: 'Platform', href: '#platform' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Docs', href: '#docs' },
];

const FEATURES = [
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
            </svg>
        ),
        title: 'Simulation Studio',
        body: 'Design flows visually, explore traffic splits, and validate guardrails with sandboxed simulation before you commit to rollout.',
        tag: 'No-risk testing',
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />
                <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
            </svg>
        ),
        title: 'Feature Gates & A/B Tests',
        body: 'Target precisely with rules and segments. Run A/B experiments with CUPED variance reduction and sequential testing to reach significance faster.',
        tag: 'Ship safely',
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
        ),
        title: 'Realtime Insight Engine',
        body: 'Stream ingestion, health checks, and lift estimates in near-real time. Investigate causality with session replay when signals diverge.',
        tag: 'Always-on analytics',
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
        ),
        title: 'Guardrails & Anomaly Detection',
        body: 'Automatic alerts when metrics drift outside acceptable bounds. Stop bad experiments before they affect your users.',
        tag: 'Built-in safety',
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M3 12h.01M12 3v.01M21 12h-.01M12 21v-.01M5.636 5.636l.007.007M18.364 5.636l-.007.007M18.364 18.364l-.007-.007M5.636 18.364l.007-.007" />
            </svg>
        ),
        title: 'Audience Targeting',
        body: 'Build cohorts from behavioral signals or attributes. Serve the right experience to the right segment—at any scale.',
        tag: 'Precision targeting',
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
        ),
        title: 'Session Replay',
        body: 'Watch exactly what happened when a metric moved unexpectedly. Correlate UI events with experiment assignment for full context.',
        tag: 'Deep debugging',
    },
];

const STATS = [
    { value: '<200ms', label: 'P95 eval latency' },
    { value: '99.98%', label: 'Gate SLA' },
    { value: '24/7', label: 'Ingestion uptime' },
    { value: '10+', label: 'SDK integrations' },
];

const STEPS = [
    {
        num: '01',
        title: 'Plan & simulate',
        body: 'Design experiment flows visually, preview traffic splits, and validate guardrails in a sandboxed simulation before writing a single line of rollout code.',
    },
    {
        num: '02',
        title: 'Target & activate',
        body: 'Gate with rules and segments. Roll out incrementally using experiments, feature flags, and intelligent kill-switches for instant rollback.',
    },
    {
        num: '03',
        title: 'Measure & learn',
        body: 'CUPED and sequential testing reduce variance and time-to-insight. Stream health metrics in real time and replay sessions to understand the why.',
    },
];

const LOGOS = ['Acme Corp', 'Globex', 'Initech', 'Stark Industries', 'Umbrella', 'Soylent'];

const TESTIMONIAL = {
    quote:
        "Expothesis cut our time from hypothesis to statistically significant result by 60%. The integrated simulation and replay features are genuinely unlike anything else we've used.",
    author: 'Head of Growth',
    company: 'Acme Corp',
    initials: 'AG',
};

export function LandingPage() {
    const trackerRef = React.useRef<ExpothesisTracker | null>(null);
    const trackerStarted = React.useRef(false);
    const [scrolled, setScrolled] = React.useState(false);
    const loggedIn = isLoggedIn();

    React.useEffect(() => {
        if (trackerStarted.current) return;
        trackerStarted.current = true;
        const tracker = new ExpothesisTracker({
            autoTrack: true,
            recordReplay: true,
            apiKey: import.meta.env.VITE_TRACKING_KEY,
            replayBatchSize: 40,
            replaySnapshotGraceMs: 5000,
            autoEndOnRouteChange: false,
            autoRestartOnRouteChange: false,
        });
        tracker.init();
        trackerRef.current = tracker;
        return () => {
            tracker.end();
            trackerStarted.current = false;
        };
    }, []);

    React.useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="lp">
            {/* ─── NAV ─────────────────────────────────────── */}
            <header className={`lp-nav${scrolled ? ' lp-nav--scrolled' : ''}`}>
                <div className="lp-nav-inner">
                    <a href="/" className="lp-logo">
                        <span className="lp-logo-mark">Ex</span>
                        <span className="lp-logo-text">Expothesis</span>
                    </a>

                    <nav className="lp-nav-links" aria-label="Main navigation">
                        {NAV_LINKS.map((l) => (
                            <a key={l.label} href={l.href} className="lp-nav-link">
                                {l.label}
                            </a>
                        ))}
                    </nav>

                    <div className="lp-nav-actions">
                        {loggedIn ? (
                            <Link to="/home" className="lp-btn lp-btn-primary">
                                Open Dashboard
                            </Link>
                        ) : (
                            <>
                                <Link to="/login" className="lp-nav-link">
                                    Log in
                                </Link>
                                <Link to="/register" className="lp-btn lp-btn-primary">
                                    Get started free
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* ─── HERO ─────────────────────────────────────── */}
            <section className="lp-hero">
                <div className="lp-hero-bg" aria-hidden="true">
                    <div className="lp-hero-grid" />
                    <div className="lp-hero-orb lp-hero-orb-1" />
                    <div className="lp-hero-orb lp-hero-orb-2" />
                    <div className="lp-hero-orb lp-hero-orb-3" />
                </div>

                <div className="lp-hero-inner">
                    <div className="lp-kicker-wrap">
                        <span className="lp-kicker-dot" />
                        <span className="lp-kicker">Experimentation control plane</span>
                    </div>

                    <h1 className="lp-hero-title">
                        Ship faster.&nbsp;
                        <span className="lp-hero-title-grad">Measure smarter.</span>
                        <br />
                        Learn continuously.
                    </h1>

                    <p className="lp-hero-sub">
                        Expothesis is the unified platform for A/B testing, feature gates, simulation, and analytics.
                        Stop stitching tools together—orchestrate the entire experiment lifecycle in one place.
                    </p>

                    <div className="lp-hero-actions">
                        {loggedIn ? (
                            <Link to="/home" className="lp-btn lp-btn-primary lp-btn-lg">
                                Open Dashboard →
                            </Link>
                        ) : (
                            <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">
                                Get started free →
                            </Link>
                        )}
                        <a href="#platform" className="lp-btn lp-btn-ghost lp-btn-lg">
                            Explore the platform
                        </a>
                    </div>

                    <div className="lp-hero-stats">
                        {STATS.map((s) => (
                            <div key={s.label} className="lp-hero-stat">
                                <span className="lp-hero-stat-val">{s.value}</span>
                                <span className="lp-hero-stat-label">{s.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Dashboard preview panel */}
                <div className="lp-hero-panel" aria-hidden="true">
                    <div className="lp-panel-header">
                        <div className="lp-panel-dots">
                            <span /><span /><span />
                        </div>
                        <span className="lp-panel-title">Experiment Monitor</span>
                        <span className="lp-panel-badge lp-panel-badge--live">● Live</span>
                    </div>
                    <div className="lp-panel-body">
                        <div className="lp-panel-row">
                            <span className="lp-panel-label">Homepage CTA Test</span>
                            <span className="lp-panel-chip lp-chip-running">Running</span>
                        </div>
                        <div className="lp-panel-metric-row">
                            <span className="lp-panel-metric-name">Conversion rate</span>
                            <span className="lp-panel-metric-val lp-val-pos">+8.4%</span>
                        </div>
                        <div className="lp-panel-metric-row">
                            <span className="lp-panel-metric-name">p-value</span>
                            <span className="lp-panel-metric-val">0.021</span>
                        </div>
                        <div className="lp-panel-metric-row">
                            <span className="lp-panel-metric-name">Power</span>
                            <span className="lp-panel-metric-val">91%</span>
                        </div>
                        <div className="lp-panel-chart" role="img" aria-label="Experiment lift chart">
                            <div className="lp-panel-chart-bar" style={{ height: '40%' }} />
                            <div className="lp-panel-chart-bar lp-panel-chart-bar--accent" style={{ height: '72%' }} />
                            <div className="lp-panel-chart-bar" style={{ height: '55%' }} />
                            <div className="lp-panel-chart-bar lp-panel-chart-bar--accent" style={{ height: '84%' }} />
                            <div className="lp-panel-chart-bar" style={{ height: '63%' }} />
                            <div className="lp-panel-chart-bar lp-panel-chart-bar--accent" style={{ height: '91%' }} />
                            <div className="lp-panel-chart-bar" style={{ height: '70%' }} />
                        </div>
                        <div className="lp-panel-footer">
                            <span className="lp-panel-label">CUPED applied · Sequential testing · SRM check ✓</span>
                        </div>
                    </div>

                    {/* Floating gate card */}
                    <div className="lp-float-card lp-float-card-a">
                        <div className="lp-float-card-label">Feature gate</div>
                        <div className="lp-float-card-title">new_checkout_flow</div>
                        <div className="lp-float-card-row">
                            <span className="lp-panel-chip lp-chip-enabled">Enabled</span>
                            <span className="lp-float-card-sub">42% traffic</span>
                        </div>
                    </div>

                    {/* Floating guardrail card */}
                    <div className="lp-float-card lp-float-card-b">
                        <div className="lp-float-card-label">Guardrail</div>
                        <div className="lp-float-card-title">Latency P99</div>
                        <div className="lp-float-card-row">
                            <span className="lp-panel-chip lp-chip-safe">Within bounds</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── LOGO STRIP ───────────────────────────────── */}
            <section className="lp-logos">
                <p className="lp-logos-label">Trusted by product and data teams at</p>
                <div className="lp-logos-strip">
                    {LOGOS.map((name) => (
                        <div key={name} className="lp-logo-pill" aria-label={`${name}`}>
                            {name}
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── FEATURES ─────────────────────────────────── */}
            <section id="platform" className="lp-section">
                <div className="lp-section-label">Platform</div>
                <h2 className="lp-section-title">Everything your team needs to experiment at scale</h2>
                <p className="lp-section-sub">
                    One control plane to plan, target, activate, and measure—without stitching separate tools together.
                </p>

                <div className="lp-feature-grid">
                    {FEATURES.map((f) => (
                        <div key={f.title} className="lp-feature-card">
                            <div className="lp-feature-icon">{f.icon}</div>
                            <div className="lp-feature-tag">{f.tag}</div>
                            <h3 className="lp-feature-title">{f.title}</h3>
                            <p className="lp-feature-body">{f.body}</p>
                            <span className="lp-feature-cta">Learn more →</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── HOW IT WORKS ─────────────────────────────── */}
            <section id="how-it-works" className="lp-section lp-steps-section">
                <div className="lp-steps-inner">
                    <div className="lp-steps-left">
                        <div className="lp-section-label">How it works</div>
                        <h2 className="lp-section-title lp-section-title--left">
                            From hypothesis to insight in three steps
                        </h2>
                        <p className="lp-section-sub lp-section-sub--left">
                            No context switching. No data silos. One continuous loop of learning.
                        </p>
                        <Link to="/register" className="lp-btn lp-btn-primary" style={{ marginTop: '32px', display: 'inline-flex' }}>
                            Start experimenting →
                        </Link>
                    </div>

                    <div className="lp-steps-right">
                        {STEPS.map((s, i) => (
                            <div key={s.num} className="lp-step">
                                <div className="lp-step-num-col">
                                    <div className="lp-step-circle">{s.num}</div>
                                    {i < STEPS.length - 1 && <div className="lp-step-line" />}
                                </div>
                                <div className="lp-step-content">
                                    <h3 className="lp-step-title">{s.title}</h3>
                                    <p className="lp-step-body">{s.body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── TESTIMONIAL ──────────────────────────────── */}
            <section className="lp-section lp-testimonial-section">
                <div className="lp-testimonial-card">
                    <div className="lp-testimonial-quote-mark">"</div>
                    <blockquote className="lp-testimonial-text">{TESTIMONIAL.quote}</blockquote>
                    <div className="lp-testimonial-author">
                        <div className="lp-testimonial-avatar">{TESTIMONIAL.initials}</div>
                        <div>
                            <div className="lp-testimonial-name">{TESTIMONIAL.author}</div>
                            <div className="lp-testimonial-company">{TESTIMONIAL.company}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── CTA BAND ─────────────────────────────────── */}
            <section className="lp-cta-section">
                <div className="lp-cta-bg" aria-hidden="true">
                    <div className="lp-cta-orb lp-cta-orb-1" />
                    <div className="lp-cta-orb lp-cta-orb-2" />
                </div>
                <div className="lp-cta-inner">
                    <h2 className="lp-cta-title">Command the lifecycle of every experiment.</h2>
                    <p className="lp-cta-sub">
                        Create a flag, start a test, run a simulation. Everything in one dashboard.
                    </p>
                    <div className="lp-cta-actions">
                        {loggedIn ? (
                            <Link to="/home" className="lp-btn lp-btn-primary lp-btn-lg">
                                Open Dashboard →
                            </Link>
                        ) : (
                            <>
                                <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">
                                    Get started free →
                                </Link>
                                <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-lg">
                                    Log in
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </section>

            {/* ─── FOOTER ───────────────────────────────────── */}
            <footer className="lp-footer">
                <div className="lp-footer-inner">
                    <div className="lp-footer-brand">
                        <a href="/" className="lp-logo lp-logo--footer">
                            <span className="lp-logo-mark">Ex</span>
                            <span className="lp-logo-text">Expothesis</span>
                        </a>
                        <p className="lp-footer-tagline">Experiment intelligence for modern product teams.</p>
                    </div>

                    <div className="lp-footer-links-grid">
                        <div>
                            <h4 className="lp-footer-col-title">Platform</h4>
                            <ul className="lp-footer-list">
                                <li><a href="#platform">Feature Gates</a></li>
                                <li><a href="#platform">A/B Testing</a></li>
                                <li><a href="#platform">Simulation Studio</a></li>
                                <li><a href="#platform">Session Replay</a></li>
                                <li><a href="#platform">Analytics</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="lp-footer-col-title">Resources</h4>
                            <ul className="lp-footer-list">
                                <li><a href="#docs">Documentation</a></li>
                                <li><a href="#docs">API Reference</a></li>
                                <li><a href="#docs">Changelog</a></li>
                                <li><a href="#docs">Status</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="lp-footer-col-title">Company</h4>
                            <ul className="lp-footer-list">
                                <li><a href="#company">About</a></li>
                                <li><a href="#company">Blog</a></li>
                                <li><a href="#company">Careers</a></li>
                                <li><a href="#company">Contact</a></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="lp-footer-bottom">
                    <span>© {new Date().getFullYear()} Expothesis. All rights reserved.</span>
                    <div className="lp-footer-legal">
                        <a href="#privacy">Privacy</a>
                        <a href="#terms">Terms</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

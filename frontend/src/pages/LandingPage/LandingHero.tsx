import { Link } from 'react-router-dom';

export function LandingHero() {
    return (
        <section className="landing-hero">
            <div className="landing-hero-content">
                <div className="landing-kicker">Futuristic Experiment Suite</div>
                <h1 className="landing-title">
                    Map, simulate, and activate experiments as living systems.
                </h1>
                <p className="landing-subtitle">
                    Bring your product strategy to life with experimentation orchestration, intelligent gates, and
                    real-time analytics that feel like an operations command center.
                </p>
                <div className="landing-hero-actions">
                    {window.localStorage.getItem('beaker-token') ? (
                        <Link to="/home" className="btn-primary">
                            Open Dashboard
                        </Link>
                    ) : (
                        <Link to="/register" className="btn-primary">
                            Get started
                        </Link>
                    )}
                    <a href="#platform" className="btn-secondary">
                        Explore Platform
                    </a>
                </div>
                <div className="landing-metrics">
                    {[
                        { label: 'Flow Latency', value: '< 200ms' },
                        { label: 'Gate Accuracy', value: '99.98%' },
                        { label: 'Streaming Signals', value: '24/7' },
                    ].map((item) => (
                        <div key={item.label} className="landing-metric-card">
                            <p>{item.label}</p>
                            <span>{item.value}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="landing-hero-visual">
                <div className="landing-stack">
                    <svg className="landing-stack-lines" viewBox="0 0 420 520" fill="none">
                        <path d="M70 140 L210 250 L350 140" className="landing-line" />
                        <path d="M70 330 L210 440 L350 330" className="landing-line landing-line-alt" />
                    </svg>

                    <div className="landing-layer layer-top">
                        <div className="layer-header">
                            <span>Build Experience</span>
                            <div className="layer-chip">API</div>
                        </div>
                        <div className="layer-orbit">
                            {['Audience', 'Journey', 'Signals', 'Activation'].map((label) => (
                                <div key={label} className="orbit-node">
                                    <span>{label}</span>
                                </div>
                            ))}
                        </div>
                        <div className="layer-center">Experiment Flow</div>
                    </div>

                    <div className="landing-layer layer-mid">
                        <div className="layer-header">
                            <span>Process Intelligence Graph</span>
                            <div className="layer-chip">API</div>
                        </div>
                        <div className="layer-graph">
                            <div className="graph-node" />
                            <div className="graph-node" />
                            <div className="graph-node" />
                            <div className="graph-edge" />
                        </div>
                    </div>

                    <div className="landing-layer layer-core">
                        <div className="layer-header">
                            <span>Data Core</span>
                            <div className="layer-chip">API</div>
                        </div>
                        <div className="layer-grid">
                            {Array.from({ length: 24 }).map((_, idx) => (
                                <span key={idx} className="grid-cell" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

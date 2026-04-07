import { Link } from 'react-router-dom';

export function LandingHeader() {
    return (
        <header className="landing-header">
            <div className="landing-brand">
                <img src="/beaker-logo.svg" alt="Beaker" style={{ height: '20px', width: 'auto' }} />
            </div>
            <div className="landing-header-actions">
                <a href="#platform" className="landing-link">
                    Platform
                </a>
                {window.localStorage.getItem('beaker-token') ? (
                    <Link to="/home" className="btn-primary landing-cta">
                        Open Dashboard
                    </Link>
                ) : (
                    <>
                        <Link to="/login" className="landing-link">
                            Log in
                        </Link>
                        <Link to="/register" className="btn-primary landing-cta">
                            Sign up
                        </Link>
                    </>
                )}
            </div>
        </header>
    );
}

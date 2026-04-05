import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const OAuthCallback: React.FC = () => {
    const [searchParams] = useSearchParams();
    const { login } = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        const token = searchParams.get('token');
        const userId = searchParams.get('user_id');
        const error = searchParams.get('error');

        if (error) {
            navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
            return;
        }
        if (token && userId) {
            login(token, userId);
            navigate('/home', { replace: true });
            return;
        }
        navigate('/login?error=Authentication+failed', { replace: true });
    }, [searchParams, login, navigate]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-slate-500">Completing sign in...</p>
        </div>
    );
};

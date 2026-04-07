import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface AuthContextType {
    token: string | null;
    userId: string | null;
    login: (token: string, userId: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(window.localStorage.getItem('beaker-token'));
    const [userId, setUserId] = useState<string | null>(window.localStorage.getItem('beaker-user-id'));
    const queryClient = useQueryClient();

    const login = (newToken: string, newUserId: string) => {
        window.localStorage.setItem('beaker-token', newToken);
        window.localStorage.setItem('beaker-user-id', newUserId);
        setToken(newToken);
        setUserId(newUserId);

        // Clear everything and ensure fresh refetch on login
        queryClient.clear();
        queryClient.invalidateQueries();
    };

    const logout = () => {
        window.localStorage.removeItem('beaker-token');
        window.localStorage.removeItem('beaker-user-id');
        window.localStorage.removeItem('beaker-account-id');
        setToken(null);
        setUserId(null);
        queryClient.clear();
    };

    return (
        <AuthContext.Provider value={{ token, userId, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

import React, { createContext, useContext, useState, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

interface ToastContextType {
    addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let nextId = 0;

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    if (toasts.length === 0) return null;
    return (
        <div className="toast-stack">
            {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast-${toast.type}`} role="status" aria-live="polite">
                    <span className="toast-body">{toast.message}</span>
                    <button className="toast-dismiss" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">×</button>
                </div>
            ))}
        </div>
    );
}

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const addToast = (message: string, type: ToastType = 'info') => {
        const id = nextId++;
        setToasts((prev) => {
            const updated = [...prev, { id, type, message }];
            return updated.length > 3 ? updated.slice(updated.length - 3) : updated;
        });
        window.setTimeout(() => dismiss(id), 4000);
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <ToastStack toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

const NotificationContext = createContext(null);

export const useNotification = () => {
    const ctx = useContext(NotificationContext);
    if (!ctx) {
        throw new Error('useNotification must be used within NotificationProvider');
    }
    return ctx;
};

export const NotificationProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const notify = useCallback(({ type = 'info', message = '', duration = 3000 }) => {
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => removeToast(id), duration);
    }, [removeToast]);

    const value = useMemo(() => ({ notify }), [notify]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
            <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2">
                {toasts.map((toast) => {
                    const isError = toast.type === 'error';
                    const isSuccess = toast.type === 'success';
                    const icon = isSuccess ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />;
                    const base = isError
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : isSuccess
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 text-slate-700';

                    return (
                        <div key={toast.id} className={`min-w-[240px] max-w-sm border rounded-lg shadow-sm px-4 py-3 flex items-start gap-2 ${base}`}>
                            <div className="mt-0.5">{icon}</div>
                            <div className="flex-1 text-sm font-medium">{toast.message}</div>
                            <button onClick={() => removeToast(toast.id)} className="text-slate-400 hover:text-slate-600">
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </NotificationContext.Provider>
    );
};

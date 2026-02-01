import React, { useState, useEffect } from 'react';
import { Bug, ToggleLeft, ToggleRight } from 'lucide-react';
import { DEBUG_CATEGORIES, isEnabled, setEnabled, getState } from '../../utils/debug';

const DebugView = () => {
    const [state, setState] = useState(getState);

    useEffect(() => {
        setState(getState());
    }, []);

    const handleToggle = (key, value) => {
        setEnabled(key, value);
        setState(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex items-center gap-2">
                <Bug size={20} className="text-amber-600" />
                <h2 className="font-bold text-slate-800">Отладка</h2>
                <span className="text-xs text-slate-500">Логи выводятся в консоль браузера (F12)</span>
            </div>
            <div className="flex-1 overflow-auto p-4">
                <p className="text-sm text-slate-600 mb-4">
                    Включите нужные категории — соответствующие сообщения появятся в консоли разработчика.
                </p>
                <div className="space-y-3">
                    {Object.entries(DEBUG_CATEGORIES).map(([key, { label, description }]) => {
                        const enabled = state[key] ?? false;
                        return (
                            <div
                                key={key}
                                className="flex items-start gap-4 p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                            >
                                <button
                                    onClick={() => handleToggle(key, !enabled)}
                                    className={`flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                        enabled
                                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                            : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                    }`}
                                    title={enabled ? 'Выключить' : 'Включить'}
                                >
                                    {enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                    {enabled ? 'Вкл' : 'Выкл'}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-800">{label}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{description}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default DebugView;

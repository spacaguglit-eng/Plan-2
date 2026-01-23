import React, { useEffect, useRef, useState } from 'react';
import { X, Lock } from 'lucide-react';

const PinModal = ({ isOpen, onClose, onSuccess }) => {
    const inputRef = useRef(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setCode('');
            setError('');
            setTimeout(() => {
                inputRef.current?.focus();
            }, 0);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (code === '1234') {
            onSuccess?.();
            onClose?.();
        } else {
            setError('Неверный код. Попробуйте ещё раз.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-100 text-blue-600 p-2 rounded-full">
                            <Lock size={18} />
                        </div>
                        <h3 className="font-bold text-lg text-slate-800">Введите код доступа</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase block mb-2">PIN</label>
                        <input
                            ref={inputRef}
                            type="password"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="••••"
                        />
                        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Подтвердить
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PinModal;

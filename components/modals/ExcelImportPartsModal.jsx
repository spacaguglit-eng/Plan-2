import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckSquare, Square, X } from 'lucide-react';

/**
 * Модалка выбора частей Excel-плана для импорта.
 *
 * props:
 * - isOpen: boolean
 * - onCancel: () => void
 * - onConfirm: (options) => void
 *
 * options:
 * - importCalendar: boolean
 * - importRoster: boolean
 */
export const ExcelImportPartsModal = ({ isOpen, onCancel, onConfirm }) => {
    const [importCalendar, setImportCalendar] = useState(true);
    const [importRoster, setImportRoster] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        // Сбрасываем состояние при каждом открытии
        setImportCalendar(true);
        setImportRoster(true);
        setError('');
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        setError('');

        const nextOptions = {
            importCalendar,
            importRoster
        };

        // Валидации:
        // 1) Должно быть выбрано хотя бы что-то
        if (!nextOptions.importCalendar && !nextOptions.importRoster) {
            setError('Нужно выбрать хотя бы одну часть для импорта.');
            return;
        }

        onConfirm(nextOptions);
    };

    const renderCheckboxRow = (checked, onToggle, title, description, disabled = false) => (
        <button
            type="button"
            onClick={() => !disabled && onToggle(!checked)}
            className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                disabled
                    ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
            }`}
        >
            <div className="mt-0.5">
                {checked ? (
                    <CheckSquare
                        size={18}
                        className={disabled ? 'text-slate-300' : 'text-blue-600'}
                    />
                ) : (
                    <Square
                        size={18}
                        className={disabled ? 'text-slate-300' : 'text-slate-400'}
                    />
                )}
            </div>
            <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{description}</div>
            </div>
        </button>
    );

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">
                            Загрузка плана из Excel
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Выберите, какие части плана обновить. Остальные данные останутся без изменений.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            Части плана для импорта
                        </div>
                        {renderCheckboxRow(
                            importCalendar,
                            setImportCalendar,
                            'Календарь (дни и смены)',
                            'Обновить расписание по сменам: список дней и хеши смен, чтобы сохранить совместимые ручные назначения.'
                        )}
                        {renderCheckboxRow(
                            importRoster,
                            setImportRoster,
                            'Справочник (линии и роли)',
                            'Обновить лист «Справочник» с линиями, ролями и закреплениями по сменам.'
                        )}
                    </div>

                    {error && (
                        <div className="mt-2 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
                    >
                        Отмена
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                    >
                        Импортировать выбранное
                    </button>
                </div>
            </div>
        </div>
    );
};


import React from 'react';

export default function LineWorkPlanModal({
    isOpen,
    onClose,
    lineOptions,
    lineWorkDraft,
    onLineWorkDraftChange,
    lineWorkError,
    onCreatePlan
}) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 shrink-0">
                    <h3 className="text-base font-semibold text-slate-800">План по датам линий</h3>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    >
                        Закрыть
                    </button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto min-h-0">
                    <div className="space-y-1">
                        <p className="text-sm text-slate-600">
                            Укажите даты работы линий. Формат: <span className="font-medium">дд.мм.гггг</span>.
                            Диапазоны — через дефис, несколько дат — через запятую.
                        </p>
                        <p className="text-xs text-slate-500">
                            Пример: 01.02.2026-03.02.2026, 05.02.2026
                        </p>
                    </div>
                    {lineWorkError && (
                        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{lineWorkError}</div>
                    )}
                    <div className="space-y-3">
                        {lineOptions.map((line) => (
                            <div key={line} className="grid grid-cols-[180px_1fr] gap-3 items-start">
                                <div className="text-xs font-medium text-slate-600 pt-2">{line}</div>
                                <input
                                    type="text"
                                    value={lineWorkDraft[line] || ''}
                                    onChange={(e) => onLineWorkDraftChange({ ...lineWorkDraft, [line]: e.target.value })}
                                    className="h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                    placeholder="01.02.2026-03.02.2026, 05.02.2026"
                                />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 bg-slate-50/30 shrink-0">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={onCreatePlan}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                    >
                        Сформировать план
                    </button>
                </div>
            </div>
        </div>
    );
}

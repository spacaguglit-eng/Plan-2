import React from 'react';
import { FileSpreadsheet, RotateCcw } from 'lucide-react';

export const DayStatusHeader = ({
    stats,
    date,
    shiftsData,
    manualAssignments,
    onRunAutoReassign,
    onExportLines,
    onResetDay,
    onResetAll,
    dateSelector
}) => {
    if (!stats || !shiftsData || shiftsData.length === 0) return null;
    
    return (
        <div className="mb-6 space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">{dateSelector != null ? dateSelector : `Дата: ${date}`}</div>
                <div className="flex items-center gap-2">
                    {onRunAutoReassign && (
                        <button
                            type="button"
                            onClick={onRunAutoReassign}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                            title="Заполнить вакансии на выбранную дату из свободных сотрудников"
                        >
                            Заполнить вакансии
                        </button>
                    )}
                    {onResetDay && (
                        <button
                            type="button"
                            onClick={onResetDay}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors shadow-sm"
                            title="Откатить назначения за день к базовым значениям"
                        >
                            <RotateCcw size={14} />
                            Откат дня
                        </button>
                    )}
                    {onResetAll && (
                        <button
                            type="button"
                            onClick={onResetAll}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors shadow-sm"
                            title="Откатить все назначения к базовым значениям"
                        >
                            <RotateCcw size={14} />
                            Откат всего
                        </button>
                    )}
                    {onExportLines && (
                        <button
                            onClick={onExportLines}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                            title="Экспорт графика по линиям"
                        >
                            <FileSpreadsheet size={14} />
                            Экспорт (Линии)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

import React from 'react';
import { FileSpreadsheet, RotateCcw, List } from 'lucide-react';

export const DayStatusHeader = ({
    stats,
    date,
    shiftsData,
    manualAssignments,
    onRunAutoReassign,
    onExportLines,
    onShowRawLineEvents,
    onResetDay,
    onResetAll,
    dateSelector,
    exportMode = 'full',
    onChangeExportMode
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
                        <div className="flex items-center gap-1">
                            {onChangeExportMode && (
                                <div className="inline-flex rounded-lg border border-emerald-200 bg-white text-[11px] overflow-hidden mr-1">
                                    <button
                                        type="button"
                                        onClick={() => onChangeExportMode('full')}
                                        className={`px-2 py-1 font-semibold transition-colors ${
                                            exportMode === 'full'
                                                ? 'bg-emerald-600 text-white'
                                                : 'text-emerald-700 hover:bg-emerald-50'
                                        }`}
                                    >
                                        С людьми
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onChangeExportMode('vacancies')}
                                        className={`px-2 py-1 font-semibold transition-colors border-l border-emerald-200 ${
                                            exportMode === 'vacancies'
                                                ? 'bg-emerald-600 text-white'
                                                : 'text-emerald-700 hover:bg-emerald-50'
                                        }`}
                                    >
                                        Вакансии
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={() => onExportLines(exportMode)}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                                title={exportMode === 'vacancies' ? 'Экспорт плана только по вакансиям' : 'Экспорт графика по линиям с людьми'}
                            >
                                <FileSpreadsheet size={14} />
                                Экспорт (Линии)
                            </button>
                            {onShowRawLineEvents && (
                                <button
                                    type="button"
                                    onClick={onShowRawLineEvents}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                    title="Сырые данные по событиям на линиях (demand + production)"
                                >
                                    <List size={14} />
                                    Сырые данные
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

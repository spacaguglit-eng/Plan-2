import React from 'react';
import { Calendar, Clock4, Database, GripVertical, Trash2, BarChart2, Zap, GitBranch, Plus } from 'lucide-react';
import { formatDateInputValue, parseNumeric } from './planningViewUtils';

export default function PlanningScheduleTab({
    products,
    cipBetween,
    clearPourQueue,
    addMissingProductsAsRules,
    productsWithoutRules,
    applyTransitionsForCurrentOrder,
    runTransitionOptimization,
    setIsTransitionModalOpen,
    planSaveName,
    setPlanSaveName,
    activePlanName,
    handleCreatePlanFromSchedule,
    lineOptions,
    lineWorkDates,
    setLineWorkDraft,
    setLineWorkDates,
    setIsLineWorkPlanOpen,
    setLineWorkError,
    setPlanImportError,
    setPasteText,
    setPlanImportPreview,
    setIsPlanImportOpen,
    setIsExportModalOpen,
    planCreateError,
    planCreateStatus,
    allRows,
    eventOptions,
    eventLabelByKey,
    handleTimeChange,
    handleDateChange,
    handleCipTypeChange,
    removeProductAt,
    moveProduct,
    dragIndex,
    setDragIndex
}) {
    return (
        <>
            <section className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] ring-1 ring-slate-200/50">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={clearPourQueue}
                            disabled={products.length === 0 && cipBetween.length === 0}
                            title="Удалить все позиции из очереди розлива"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            <Trash2 size={16} />
                            Очистить очередь
                        </button>
                        <button
                            type="button"
                            onClick={addMissingProductsAsRules}
                            disabled={productsWithoutRules.length === 0}
                            title={productsWithoutRules.length === 0 ? 'Все продукты из графика уже в матрице переходов' : `Добавить ${productsWithoutRules.length} продукт(ов) из графика без правил в матрицу с базовым CIP2`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            <Plus size={16} />
                            Добавить без правил ({productsWithoutRules.length})
                        </button>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-100/50 p-1 rounded-xl ring-1 ring-slate-200/40">
                        <button
                            onClick={applyTransitionsForCurrentOrder}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-500/20 transition-all active:scale-95"
                            title="Автоматически расставить переходы между продуктами"
                        >
                            <Zap size={15} />
                            Расставить переходы
                        </button>
                        <button
                            onClick={() => { runTransitionOptimization(); setIsTransitionModalOpen(true); }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-500/20 transition-all active:scale-95"
                            title="Найти оптимальный порядок розлива для минимизации переходов"
                        >
                            <GitBranch size={15} />
                            Кратчайший путь
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-indigo-50/50 p-1 rounded-xl ring-1 ring-indigo-100">
                            <input
                                type="text"
                                value={planSaveName}
                                onChange={(e) => setPlanSaveName(e.target.value)}
                                placeholder={activePlanName || `План ${new Date().toLocaleDateString('ru-RU')}`}
                                className="h-8 w-44 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                title="Имя сохраняемого плана"
                            />
                            <button
                                onClick={handleCreatePlanFromSchedule}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95 whitespace-nowrap"
                            >
                                Сформировать план
                            </button>
                        </div>
                        <div className="h-6 w-px bg-slate-200 mx-1" aria-hidden="true" />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setLineWorkError('');
                                    const draft = {};
                                    lineOptions.forEach((line) => {
                                        const dates = lineWorkDates?.[line];
                                        draft[line] = Array.isArray(dates) ? dates.join(', ') : (dates || '');
                                    });
                                    setLineWorkDraft(draft);
                                    setIsLineWorkPlanOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                                title="Настройка рабочих дат для каждой линии"
                            >
                                <Calendar size={15} className="text-slate-400" />
                                Даты линий
                            </button>
                            <button
                                onClick={() => { setPlanImportError(''); setPasteText(''); setPlanImportPreview(null); setIsPlanImportOpen(true); }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                                title="Импорт плана из внешних данных"
                            >
                                <Database size={15} className="text-slate-400" />
                                Импорт
                            </button>
                            <button
                                onClick={() => setIsExportModalOpen(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                                title="Выгрузить план в PDF или HTML"
                            >
                                <BarChart2 size={15} className="text-slate-400" />
                                Выгрузить
                            </button>
                        </div>
                    </div>
                </div>
            </section>
            {(planCreateError || planCreateStatus === 'success') && (
                <div className={`rounded-xl px-4 py-3 text-sm ${planCreateError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {planCreateError || 'План сформирован и сохранён.'}
                </div>
            )}

            <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
                <div className="flex items-center gap-3 border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                        <Clock4 size={18} strokeWidth={2} />
                    </div>
                    <div>
                        <h2 className="text-sm font-medium text-slate-700">Очередность розлива</h2>
                        <p className="text-xs text-slate-400 tabular-nums">{allRows.length} позиций</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse table-auto">
                        <thead>
                            <tr className="bg-slate-50/70 border-b border-slate-200/50">
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-0">№</th>
                                <th className="px-1 py-3 w-0 border-l border-slate-200/40"></th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Дата нач.</th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Дата кон.</th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Начало</th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Конец</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 min-w-[180px]">Наименование</th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Кол-во</th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Скорость</th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Длит.</th>
                                <th className="px-2 py-3 w-0 border-l border-slate-200/40" title="Удалить"> </th>
                            </tr>
                        </thead>
                        <tbody>
                            {allRows.map((row, displayIndex) => {
                                const isCip = row.kind === 'cip';
                                const isMissingTransition = isCip && row.missingTransition;
                                const durationLabel = row.durationMinutes > 0 ? `${row.durationMinutes} мин` : '—';
                                return (
                                    <tr
                                        key={row.id}
                                        draggable={!isCip}
                                        onDragStart={() => !isCip && setDragIndex(row.index)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={() => {
                                            if (isCip) return;
                                            moveProduct(dragIndex, row.index);
                                            setDragIndex(null);
                                        }}
                                        className={`border-b border-slate-100/80 transition-colors ${
                                            isMissingTransition ? 'bg-red-50/50' : isCip ? 'bg-slate-50/30' : 'bg-white hover:bg-slate-50/40'
                                        } ${!isCip ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    >
                                        <td className="px-3 py-2.5 text-center text-slate-400 tabular-nums">{displayIndex + 1}</td>
                                        <td className="px-1 py-2.5 text-center text-slate-300/80 border-l border-slate-200/40">
                                            {!isCip && <GripVertical size={16} className="opacity-50 inline-block" />}
                                        </td>
                                        <td className="px-3 py-2.5 border-l border-slate-200/40 w-0">
                                            <input
                                                type="date"
                                                value={formatDateInputValue(row.date)}
                                                onChange={(e) => handleDateChange(row, e.target.value)}
                                                className={`h-8 w-full min-w-0 rounded-md border px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 [&::-webkit-date-and-time-value]:text-center ${
                                                    row.manualDate ? 'bg-amber-50/80 border-amber-200/80 text-amber-800' : 'border-slate-200/80 bg-white'
                                                }`}
                                            />
                                        </td>
                                        <td className="px-3 py-2.5 border-l border-slate-200/40 text-center text-slate-500 text-sm tabular-nums whitespace-nowrap w-0">
                                            {row.endDate || '—'}
                                        </td>
                                        <td className="px-3 py-2.5 border-l border-slate-200/40 w-0">
                                            <input
                                                type="time"
                                                value={row.start || ''}
                                                onChange={(e) => handleTimeChange(row, 'start', e.target.value)}
                                                className={`h-8 w-full min-w-0 rounded-md border px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 [&::-webkit-datetime-edit]:text-center ${
                                                    row.manualStart ? 'bg-amber-50/80 border-amber-200/80 text-amber-800' : 'border-slate-200/80 bg-white'
                                                }`}
                                            />
                                        </td>
                                        <td className="px-3 py-2.5 border-l border-slate-200/40 w-0">
                                            <input
                                                type="time"
                                                value={row.end || ''}
                                                onChange={(e) => handleTimeChange(row, 'end', e.target.value)}
                                                className={`h-8 w-full min-w-0 rounded-md border px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 [&::-webkit-datetime-edit]:text-center ${
                                                    row.manualEnd ? 'bg-amber-50/80 border-amber-200/80 text-amber-800' : 'border-slate-200/80 bg-white'
                                                }`}
                                            />
                                        </td>
                                        <td className={`px-4 py-2.5 border-l border-slate-200/40 font-medium text-center ${isCip ? 'text-slate-500' : 'text-slate-700'}`}>
                                            {isCip ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <select
                                                        value={row.eventKey || eventOptions[0]?.key || ''}
                                                        onChange={(e) => handleCipTypeChange(row.index, e.target.value)}
                                                        className={`h-8 rounded-md border px-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-300/50 ${
                                                            isMissingTransition
                                                                ? 'border-red-200/80 bg-red-50/50 text-red-700 focus:ring-red-300/50'
                                                                : 'border-slate-200/80 bg-slate-50/50 text-slate-600 focus:ring-slate-300/50'
                                                        }`}
                                                    >
                                                        {eventOptions.map((option) => (
                                                            <option key={option.key} value={option.key}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                    {isMissingTransition ? (
                                                        <span className="rounded bg-red-100/80 px-2 py-0.5 text-xs font-medium text-red-600">Нет правил</span>
                                                    ) : (
                                                        <span className="rounded bg-slate-100/80 px-2 py-0.5 text-xs font-medium text-slate-500">Событие</span>
                                                    )}
                                                </div>
                                            ) : (
                                                row.name
                                            )}
                                        </td>
                                        <td className={`px-3 py-2.5 text-center border-l border-slate-200/40 tabular-nums whitespace-nowrap w-0 ${isCip ? 'text-slate-400' : 'font-medium text-slate-600'}`}>
                                            {isCip ? '—' : (row.qty != null && row.qty !== '' && Number.isFinite(parseNumeric(row.qty)) ? Math.round(parseNumeric(row.qty)).toLocaleString('ru-RU') : (row.qty ?? '—'))}
                                        </td>
                                        <td className={`px-3 py-2.5 text-center border-l border-slate-200/40 tabular-nums whitespace-nowrap w-0 ${isCip ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {isCip ? '—' : `${row.speed}/ч`}
                                        </td>
                                        <td className="px-3 py-2.5 text-center border-l border-slate-200/40 text-slate-500 tabular-nums whitespace-nowrap w-0">{durationLabel}</td>
                                        <td className="px-2 py-2.5 text-center border-l border-slate-200/40 w-0">
                                            {!isCip && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeProductAt(row.index)}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                                                    title="Удалить из очереди"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}

import React from 'react';
import { Plus, Beaker, ChevronDown, ChevronRight } from 'lucide-react';

export default function PlanningCipsTab({
    lineEvents,
    setLineEvents,
    lineOptions,
    expandedCipIndex,
    setExpandedCipIndex,
    addLineEvent,
    addDefaultCipEvents,
    removeLineEvent
}) {
    return (
        <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
            <div className="flex items-center justify-between border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                        <Beaker size={18} strokeWidth={2} />
                    </div>
                    <div>
                        <h2 className="text-sm font-medium text-slate-700">События по линиям (мин)</h2>
                        <p className="text-xs text-slate-400">Длительности CIP и прочих событий. Разверните событие для редактирования по линиям.</p>
                        <p className="text-[11px] text-slate-400 mt-1" title="По коду: usePlanningData — cipDurations и getEventKeyForCategoryName">
                            Для переходов и оптимизатора алгоритм ищет события по названию категории: <strong>CIP1</strong>, <strong>CIP2</strong>, <strong>CIP3</strong> (регекс); <strong>Переналадка</strong> (в т.ч. «Переналадка формата»); <strong>Смена ассортимента</strong>; <strong>Вытеснение</strong>. Укажите эти категории и длительности по линиям.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {addDefaultCipEvents && (
                        <button
                            type="button"
                            onClick={addDefaultCipEvents}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            title="CIP1, CIP2, CIP3, Переналадка, Смена ассортимента, Вытеснение"
                        >
                            По умолчанию
                        </button>
                    )}
                    <button
                        onClick={addLineEvent}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                    >
                        <Plus size={16} />
                        Добавить событие
                    </button>
                </div>
            </div>
            <div className="p-5 space-y-2">
                {lineEvents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200/60 bg-slate-50/40 py-12 text-center text-sm text-slate-500">
                        Нет событий. Добавьте событие и укажите длительности по линиям.
                    </div>
                ) : (
                    lineEvents.map((row, idx) => {
                        const isExpanded = expandedCipIndex === idx;
                        const rowKey = row.id ?? idx;
                        return (
                            <div
                                key={rowKey}
                                className="rounded-xl border border-slate-200/40 bg-white overflow-hidden"
                            >
                                <div
                                    className="flex items-center gap-2 px-4 py-3 bg-slate-50/40 border-b border-slate-200/40 cursor-pointer hover:bg-slate-50/60 transition-colors"
                                    onClick={() => setExpandedCipIndex(isExpanded ? null : idx)}
                                >
                                    <button
                                        type="button"
                                        className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
                                        aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
                                    >
                                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </button>
                                    <span className="w-7 text-sm text-slate-400 tabular-nums">{idx + 1}</span>
                                    <input
                                        type="text"
                                        value={row.category}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            setLineEvents((prev) => prev.map((item, i) => i === idx ? { ...item, category: e.target.value } : item));
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="Категория"
                                        className="flex-1 min-w-0 h-8 rounded-md border border-slate-200/80 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                    />
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); removeLineEvent(idx); setExpandedCipIndex((prev) => prev === idx ? null : prev > idx ? prev - 1 : prev); }}
                                        className="ml-auto rounded-md px-2.5 py-1.5 text-sm font-medium text-red-600 bg-red-50/80 hover:bg-red-100/80 transition-colors shrink-0"
                                    >
                                        Удалить
                                    </button>
                                </div>
                                {isExpanded && (
                                    <div className="p-4 bg-white border-t border-slate-100/80">
                                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Длительности по линиям (мин)</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
                                            {lineOptions.map((line) => (
                                                <div key={line} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100/80 last:border-0">
                                                    <label className="text-sm text-slate-600 shrink-0 min-w-0 truncate" title={line}>{line}</label>
                                                    <input
                                                        type="number"
                                                        value={row.durations?.[line] ?? ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value;
                                                            setLineEvents((prev) => prev.map((item, i) => i !== idx ? item : {
                                                                ...item,
                                                                durations: { ...item.durations, [line]: value === '' ? '' : Number(value) }
                                                            }));
                                                        }}
                                                        className="w-20 h-8 rounded-md border border-slate-200/80 bg-white px-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 shrink-0"
                                                        min="0"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}

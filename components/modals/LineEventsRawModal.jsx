import React, { useMemo, useState, useCallback } from 'react';
import { X, List } from 'lucide-react';

const formatDateTime = (d) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hh}:${mm}`;
};

export const LineEventsRawModal = ({ rawIntervals = [], lineTimelines, onClose }) => {
    const [selectedLineNames, setSelectedLineNames] = useState(() => new Set());

    const sorted = useMemo(() => {
        const list = rawIntervals.map((r) => ({
            ...r,
            startMs: r.start && r.start.getTime ? r.start.getTime() : 0
        }));
        list.sort((a, b) => a.startMs - b.startMs);
        return list;
    }, [rawIntervals]);

    const byLine = useMemo(() => {
        const map = new Map();
        sorted.forEach((r) => {
            if (!map.has(r.lineName)) map.set(r.lineName, []);
            map.get(r.lineName).push(r);
        });
        return map;
    }, [sorted]);

    const lineNames = useMemo(() => Array.from(byLine.keys()).sort(), [byLine]);

    const filteredByLineEntries = useMemo(() => {
        const entries = Array.from(byLine.entries());
        if (selectedLineNames.size === 0) return entries;
        return entries.filter(([name]) => selectedLineNames.has(name));
    }, [byLine, selectedLineNames]);

    const toggleLine = useCallback((name) => {
        setSelectedLineNames((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }, []);

    const showAll = useCallback(() => setSelectedLineNames(new Set()), []);

    const countBySource = useMemo(() => {
        const c = { demand: 0, production: 0, plan: 0 };
        rawIntervals.forEach((r) => {
            if (r.source === 'demand') c.demand++;
            else if (r.source === 'production') c.production++;
            else if (r.source === 'plan') c.plan++;
        });
        return c;
    }, [rawIntervals]);

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <List size={22} className="text-slate-600" />
                        <h2 className="text-lg font-bold text-slate-800">Сырые данные: события на линиях</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 text-sm text-slate-600 space-y-1">
                    <div>Всего интервалов: {rawIntervals.length}. По линиям: {byLine.size}.</div>
                    <div className="flex flex-wrap gap-3">
                        <span>Расписание по сменам: {countBySource.demand}</span>
                        <span>Сменные отчёты: {countBySource.production}</span>
                        <span className={countBySource.plan > 0 ? 'font-medium text-emerald-700' : ''}>План (листы линий): {countBySource.plan}</span>
                    </div>
                    {lineNames.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                            <span className="text-slate-500">Показать линии:</span>
                            <button
                                type="button"
                                onClick={showAll}
                                className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors ${selectedLineNames.size === 0 ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                            >
                                Все
                            </button>
                            {lineNames.map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={() => toggleLine(name)}
                                    className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors ${selectedLineNames.size === 0 || selectedLineNames.has(name) ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                    {sorted.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">Нет данных. Загрузите «Расписание по сменам» и/или отчёты по производству.</div>
                    ) : filteredByLineEntries.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">Выберите линии для отображения (кнопка «Все» или отдельные линии выше).</div>
                    ) : (
                        <div className="space-y-6">
                            {filteredByLineEntries.map(([lineName, events]) => (
                                <div key={lineName} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="px-4 py-2 bg-slate-100 font-semibold text-slate-800 border-b border-slate-200">
                                        {lineName} — {events.length} интервал(ов)
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 text-slate-600 text-left">
                                                    <th className="px-3 py-2 font-medium">№</th>
                                                    <th className="px-3 py-2 font-medium">Источник</th>
                                                    <th className="px-3 py-2 font-medium">Дата</th>
                                                    <th className="px-3 py-2 font-medium">Смена</th>
                                                    <th className="px-3 py-2 font-medium">Начало</th>
                                                    <th className="px-3 py-2 font-medium">Конец</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {events.map((ev, idx) => (
                                                    <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50">
                                                        <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                                                        <td className="px-3 py-2">
                                                            {ev.source === 'demand' ? 'Расписание по сменам' : ev.source === 'production' ? 'Сменные отчёты' : ev.source === 'plan' ? 'План (листы линий)' : ev.source || '—'}
                                                        </td>
                                                        <td className="px-3 py-2">{ev.date || '—'}</td>
                                                        <td className="px-3 py-2">{ev.shiftType || '—'}</td>
                                                        <td className="px-3 py-2 font-mono text-slate-700">{formatDateTime(ev.start)}</td>
                                                        <td className="px-3 py-2 font-mono text-slate-700">{formatDateTime(ev.end)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-slate-700 hover:bg-slate-800 text-white font-medium py-2 px-5 rounded-lg transition-colors"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
};

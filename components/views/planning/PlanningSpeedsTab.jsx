import React from 'react';
import { Plus, Zap } from 'lucide-react';

export default function PlanningSpeedsTab({
    speedLines,
    addSpeedLine,
    updateSpeedLineName,
    addSpeedEntry,
    updateSpeedEntry,
    removeSpeedEntry
}) {
    return (
        <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
            <div className="flex items-center justify-between border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                        <Zap size={18} strokeWidth={2} />
                    </div>
                    <div>
                        <h2 className="text-sm font-medium text-slate-700">Справочник скоростей</h2>
                        <p className="text-xs text-slate-400">Объёмы и скорости по линиям</p>
                    </div>
                </div>
                <button
                    onClick={addSpeedLine}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                >
                    <Plus size={16} />
                    Добавить линию
                </button>
            </div>
            <div className="p-5">
                {speedLines.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200/60 bg-slate-50/40 py-12 text-center text-sm text-slate-500">
                        Нет линий. Добавьте линию и укажите объёмы и скорости.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {speedLines.map((line) => (
                            <div key={line.id} className="rounded-xl border border-slate-200/40 bg-slate-50/30 overflow-hidden">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between border-b border-slate-200/50 px-4 py-3 bg-white/60">
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <span className="text-xs font-medium text-slate-500">Линия</span>
                                        <input
                                            type="text"
                                            value={line.name}
                                            onChange={(e) => updateSpeedLineName(line.id, e.target.value)}
                                            className="h-9 flex-1 min-w-0 max-w-xs rounded-md border border-slate-200/80 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                            placeholder="Напр. Линия 1"
                                        />
                                    </div>
                                    <button
                                        onClick={() => addSpeedEntry(line.id)}
                                        className="inline-flex items-center gap-2 rounded-md border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50/80 transition-colors"
                                    >
                                        <Plus size={14} />
                                        Добавить объём
                                    </button>
                                </div>
                                <div className="p-4 space-y-3">
                                    {line.entries.map((entry) => (
                                        <div key={entry.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                            <div className="md:col-span-3">
                                                <label className="mb-1 block text-xs font-medium text-slate-500">Формат / Объём</label>
                                                <input
                                                    type="text"
                                                    value={entry.format}
                                                    onChange={(e) => updateSpeedEntry(line.id, entry.id, 'format', e.target.value)}
                                                    className="h-9 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                    placeholder="Напр. 0,75 л / 1,0 л"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-slate-500">Скорость (ед/час)</label>
                                                <input
                                                    type="number"
                                                    value={entry.speed}
                                                    onChange={(e) => updateSpeedEntry(line.id, entry.id, 'speed', e.target.value)}
                                                    className="h-9 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                    placeholder="6500"
                                                    min="0"
                                                />
                                            </div>
                                            <div className="flex items-end">
                                                <button
                                                    onClick={() => removeSpeedEntry(line.id, entry.id)}
                                                    className="h-9 px-3 rounded-md text-sm font-medium text-red-600 bg-red-50/80 hover:bg-red-100/80 transition-colors"
                                                >
                                                    Удалить
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

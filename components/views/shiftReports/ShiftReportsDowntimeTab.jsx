import React from 'react';
import { DOWNTIME_CATEGORIES } from './shiftReportsViewConstants';
import { formatDuration } from './shiftReportsViewUtils';

export default function ShiftReportsDowntimeTab({
    downtimeFiltered,
    downtimeCatalog,
    downtimeFilterDescription,
    setDowntimeFilterDescription,
    downtimeFilterCategoriesSelected,
    toggleDowntimeCategory,
    setDowntimeFilterCategoriesSelected
}) {
    return (
        <div className="flex-1 min-h-0 bg-white border border-t-0 border-slate-200 rounded-b-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-4">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Фильтры</span>
                    <input
                        type="text"
                        value={downtimeFilterDescription}
                        onChange={(e) => setDowntimeFilterDescription(e.target.value)}
                        placeholder="Описание"
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400/30 outline-none min-w-[200px]"
                    />
                    <button
                        type="button"
                        onClick={() => { setDowntimeFilterCategoriesSelected(new Set(DOWNTIME_CATEGORIES)); setDowntimeFilterDescription(''); }}
                        className="text-xs text-slate-500 hover:text-slate-700 underline"
                    >
                        Сбросить
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="text-xs font-medium text-slate-600 w-full sm:w-auto">Категории</span>
                    {DOWNTIME_CATEGORIES.map((cat) => (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={downtimeFilterCategoriesSelected.has(cat)}
                                onChange={() => toggleDowntimeCategory(cat)}
                                className="rounded border-slate-300 text-slate-700 focus:ring-slate-400"
                            />
                            {cat}
                        </label>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200">
                        <tr className="text-slate-600 text-xs font-semibold tracking-wide">
                            <th className="px-4 py-3 text-left border-r border-slate-200 w-48">Категория</th>
                            <th className="px-4 py-3 text-left border-r border-slate-200">Описание</th>
                            <th className="px-4 py-3 text-left w-28">Длительность</th>
                        </tr>
                    </thead>
                    <tbody>
                        {downtimeFiltered.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-slate-500 text-sm">
                                    {downtimeCatalog.length === 0
                                        ? 'Каталог простоев пуст. Добавьте записи.'
                                        : 'Нет записей по выбранным фильтрам.'}
                                </td>
                            </tr>
                        ) : (
                            downtimeFiltered.map((item) => (
                                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="px-4 py-3 border-r border-slate-100 font-medium text-slate-800">{item.category || '—'}</td>
                                    <td className="px-4 py-3 border-r border-slate-100 text-slate-700">{item.description || '—'}</td>
                                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDuration(item.durationMinutes)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

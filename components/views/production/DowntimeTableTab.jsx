import React from 'react';

export default function DowntimeTableTab({ filteredDowntimeRows }) {
    return (
        <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10">
                <tr>
                    <th className="px-4 py-3 border-b">Дата</th>
                    <th className="px-4 py-3 border-b">Файл</th>
                    <th className="px-4 py-3 border-b">Линия</th>
                    <th className="px-4 py-3 border-b">Категория (F-G)</th>
                    <th className="px-4 py-3 border-b">Вид (H)</th>
                    <th className="px-4 py-3 border-b">Время начала (I)</th>
                    <th className="px-4 py-3 border-b">Время конца (J)</th>
                    <th className="px-4 py-3 border-b">Описание (L-N)</th>
                    <th className="px-4 py-3 border-b text-center">Длительность (мин)</th>
                    <th className="px-4 py-3 border-b text-center">Смена</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredDowntimeRows.length === 0 ? (
                    <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-slate-400">Нет данных для отображения</td>
                    </tr>
                ) : (
                    filteredDowntimeRows.map((row, idx) => (
                        <tr key={`${row.date}_${row.shift}_${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-slate-700 font-medium">{row.date}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{row.fileName}</td>
                            <td className="px-4 py-3 text-slate-700">{row.line}</td>
                            <td className="px-4 py-3 text-slate-800 font-medium">{row.category || '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{row.type || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{row.start || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{row.end || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{row.description || '—'}</td>
                            <td className="px-4 py-3 text-center text-slate-700">
                                {row.durationMinutes != null ? <span className="font-semibold">{Math.round(row.durationMinutes)}</span> : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${row.shift === 'День' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {row.shift}
                                </span>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    );
}

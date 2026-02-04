import React from 'react';

export default function ProductionTableTab({ filteredRows }) {
    return (
        <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10">
                <tr>
                    <th className="px-4 py-3 border-b">Дата</th>
                    <th className="px-4 py-3 border-b">Файл</th>
                    <th className="px-4 py-3 border-b">Линия</th>
                    <th className="px-4 py-3 border-b">Продукт</th>
                    <th className="px-4 py-3 border-b">Время начала</th>
                    <th className="px-4 py-3 border-b">Время конца</th>
                    <th className="px-4 py-3 border-b text-center">Количество</th>
                    <th className="px-4 py-3 border-b text-center">Доступное время (мин)</th>
                    <th className="px-4 py-3 border-b text-center">Время простоев (мин)</th>
                    <th className="px-4 py-3 border-b text-center">План</th>
                    <th className="px-4 py-3 border-b text-center">Смена</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                    <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-slate-400">Нет данных для отображения</td>
                    </tr>
                ) : (
                    filteredRows.map((row, idx) => (
                        <tr key={`${row.date}_${row.shift}_${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-slate-700 font-medium">{row.date}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{row.fileName}</td>
                            <td className="px-4 py-3 text-slate-700">{row.line}</td>
                            <td className="px-4 py-3 text-slate-800 font-medium">{row.product}</td>
                            <td className="px-4 py-3 text-slate-600">{row.start || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{row.end || '—'}</td>
                            <td className="px-4 py-3 text-center text-slate-700 font-semibold">{typeof row.qty === 'number' ? Math.round(row.qty) : row.qty}</td>
                            <td className="px-4 py-3 text-center text-slate-600">
                                {row.availableMinutes != null ? <span>{Math.round(row.availableMinutes)}</span> : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-600">
                                {row.downtimeMinutes != null ? <span>{Math.round(row.downtimeMinutes)}</span> : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-700">
                                {row.plan != null ? <span className="font-semibold">{Math.round(row.plan)}</span> : <span className="text-slate-400">—</span>}
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

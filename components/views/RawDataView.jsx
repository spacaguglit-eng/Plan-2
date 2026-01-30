import React, { useState } from 'react';
import { Database, Table, ChevronRight, ChevronDown } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { formatDateLocal } from '../../utils';

export default function RawDataView() {
    const { rawTables } = useData();
    const [activeTable, setActiveTable] = useState('demand');
    const [expandedRows, setExpandedRows] = useState(new Set());

    if (!rawTables || (!rawTables.demand && !rawTables.roster)) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center text-slate-500">
                    <Database size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Нет исходных данных</p>
                    <p className="text-sm mt-2">Загрузите Excel файл для просмотра исходных данных</p>
                </div>
            </div>
        );
    }

    const toggleRow = (rowIndex) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(rowIndex)) {
            newExpanded.delete(rowIndex);
        } else {
            newExpanded.add(rowIndex);
        }
        setExpandedRows(newExpanded);
    };

    const renderTable = (tableName, data) => {
        if (!data || !Array.isArray(data) || data.length === 0) {
            return (
                <div className="p-8 text-center text-slate-400">
                    <Table size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Таблица "{tableName}" пуста</p>
                </div>
            );
        }

        const headers = data[0] || [];
        const rows = data.slice(1);

        return (
            <div className="overflow-auto max-h-[calc(100vh-200px)]">
                <table className="min-w-full border-collapse bg-white">
                    <thead className="bg-slate-100 sticky top-0 z-10">
                        <tr>
                            <th className="border border-slate-300 px-2 py-2 text-left text-xs font-bold text-slate-700 w-12">#</th>
                            {headers.map((header, idx) => (
                                <th key={idx} className="border border-slate-300 px-3 py-2 text-left text-xs font-bold text-slate-700 min-w-[100px]">
                                    {String(header || `Колонка ${idx + 1}`)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIdx) => (
                            <React.Fragment key={rowIdx}>
                                <tr 
                                    className={`hover:bg-slate-50 cursor-pointer ${expandedRows.has(rowIdx) ? 'bg-blue-50' : ''}`}
                                    onClick={() => toggleRow(rowIdx)}
                                >
                                    <td className="border border-slate-200 px-2 py-1 text-xs text-slate-600 text-center">
                                        {expandedRows.has(rowIdx) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </td>
                                    {headers.slice(0, 5).map((_, colIdx) => (
                                        <td key={colIdx} className="border border-slate-200 px-2 py-1 text-xs text-slate-700">
                                            {row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]) : ''}
                                        </td>
                                    ))}
                                    <td className="border border-slate-200 px-2 py-1 text-xs text-slate-500 italic">
                                        {headers.length > 5 ? `... еще ${headers.length - 5} колонок` : ''}
                                    </td>
                                </tr>
                                {expandedRows.has(rowIdx) && (
                                    <tr>
                                        <td colSpan={headers.length + 1} className="border border-slate-200 bg-blue-50 p-4">
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                                                {headers.map((header, colIdx) => (
                                                    <div key={colIdx} className="break-words">
                                                        <span className="font-semibold text-slate-600">{String(header || `Колонка ${colIdx + 1}`)}:</span>
                                                        <span className="ml-1 text-slate-800">
                                                            {row[colIdx] !== undefined && row[colIdx] !== null 
                                                                ? (row[colIdx] instanceof Date 
                                                                    ? formatDateLocal(row[colIdx])
                                                                    : String(row[colIdx]))
                                                                : '(пусто)'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 p-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
                <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                        <Database size={20} className="text-blue-600" />
                        Исходные данные
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setActiveTable('demand')}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                activeTable === 'demand'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-600'
                            }`}
                        >
                            Расписание по сменам ({rawTables.demand ? rawTables.demand.length - 1 : 0} строк)
                        </button>
                        <button
                            onClick={() => setActiveTable('roster')}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                activeTable === 'roster'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                        >
                            Справочник ({rawTables.roster ? rawTables.roster.length - 1 : 0} строк)
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-hidden p-4">
                    {activeTable === 'demand' && renderTable('Расписание по сменам', rawTables.demand)}
                    {activeTable === 'roster' && renderTable('Справочник', rawTables.roster)}
                </div>
            </div>
        </div>
    );
}

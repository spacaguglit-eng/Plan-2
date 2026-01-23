import React, { useState } from 'react';
import { LayoutGrid, Search, Edit3, GraduationCap } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { MatrixAssignmentModal } from '../../UIComponents';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';

const DistributionView = () => {
    const {
        lineTemplates,
        workerRegistry,
        floaters,
        handleMatrixAssignment,
        viewMode
    } = useData();

    useRenderTime('employees_roster', logPerformanceMetric, viewMode === 'employees_roster');

    const [filter, setFilter] = useState('');
    const [editingCell, setEditingCell] = useState(null);

    const handleCellClick = (lineName, pIdx, shiftId, currentNames, role) => {
        setEditingCell({ lineName, pIdx, shiftId, currentNames, role });
    };

    const handleModalSave = (newNamesList) => {
        if (editingCell) {
            handleMatrixAssignment(editingCell.lineName, editingCell.pIdx, editingCell.shiftId, newNamesList);
        }
        setEditingCell(null);
    };

    const renderCellContent = (namesStr) => {
        if (!namesStr) return <span className="text-slate-300 italic text-[10px]">Пусто</span>;
        const names = namesStr.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1);

        return (
            <div className="flex flex-col gap-1">
                {names.map((name, i) => {
                    const reg = workerRegistry[name];
                    const status = reg?.status;
                    let statusColor = 'bg-slate-50 border-slate-200 text-slate-700';
                    if (status) {
                        if (status.type === 'vacation') statusColor = 'bg-emerald-50 border-emerald-200 text-emerald-700';
                        else if (status.type === 'sick') statusColor = 'bg-amber-50 border-amber-200 text-amber-700';
                        else if (status.type === 'fired') statusColor = 'bg-red-50 border-red-200 text-red-700 line-through decoration-red-400';
                    }

                    return (
                        <div key={i} className={`text-xs px-2 py-1.5 rounded border ${statusColor} flex flex-col`}>
                            <div className="font-semibold flex justify-between items-center">
                                {name}
                                {reg?.competencies.size > 0 && <GraduationCap size={12} className="text-blue-400" />}
                            </div>
                            {status && !status.permanent && (
                                <div className="text-[10px] opacity-75">{status.raw}</div>
                            )}
                            {reg?.competencies.size > 0 && (
                                <div className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[150px]">
                                    {Array.from(reg.competencies).join(', ')}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
            <MatrixAssignmentModal
                isOpen={!!editingCell}
                onClose={() => setEditingCell(null)}
                context={editingCell}
                currentNames={editingCell?.currentNames}
                workerRegistry={workerRegistry}
                lineTemplates={lineTemplates}
                onSave={handleModalSave}
            />

            <div className="p-4 border-b bg-slate-50 flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-2 font-bold text-slate-700">
                    <LayoutGrid size={20} className="text-blue-600" />
                    Матрица распределения (Люд)
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-xs text-slate-400 italic flex items-center gap-1">
                        <Edit3 size={12} /> Кликните на ячейку для редактирования
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="text" placeholder="Поиск..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none w-64" />
                    </div>
                </div>
            </div>
            <div className="overflow-auto flex-1 p-0">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-4 py-3 border-r border-b border-slate-200 w-40">Линия</th>
                            <th className="px-4 py-3 border-r border-b border-slate-200 w-48">Должность</th>
                            <th className="px-2 py-3 border-r border-b border-slate-200 w-16 text-center">Норма</th>
                            <th className="px-4 py-3 border-r border-b border-slate-200 min-w-[200px] bg-blue-50/50">Смена 1</th>
                            <th className="px-4 py-3 border-r border-b border-slate-200 min-w-[200px] bg-indigo-50/50">Смена 2</th>
                            <th className="px-4 py-3 border-r border-b border-slate-200 min-w-[200px] bg-blue-50/50">Смена 3</th>
                            <th className="px-4 py-3 border-b border-slate-200 min-w-[200px] bg-indigo-50/50">Смена 4</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {Object.entries(lineTemplates).map(([lineName, positions], idx) => {
                            if (filter && !lineName.toLowerCase().includes(filter.toLowerCase()) && !positions.some(p => Object.values(p.roster).some(n => n.toLowerCase().includes(filter.toLowerCase())))) return null;

                            return positions.map((pos, pIdx) => (
                                <tr key={`${idx}-${pIdx}`} className="hover:bg-slate-50 transition-colors">
                                    {pIdx === 0 && (
                                        <td rowSpan={positions.length} className="px-4 py-3 font-bold text-slate-700 border-r border-slate-200 bg-white align-top sticky left-0">{lineName}</td>
                                    )}
                                    <td className="px-4 py-3 text-slate-600 border-r border-slate-200 font-medium">{pos.role}</td>
                                    <td className="px-2 py-3 text-center text-slate-500 border-r border-slate-200">{pos.count}</td>
                                    {['1', '2', '3', '4'].map(shiftId => (
                                        <td
                                            key={shiftId}
                                            onClick={() => handleCellClick(lineName, pIdx, shiftId, pos.roster[shiftId], pos.role)}
                                            className={`px-2 py-2 border-r border-slate-200 align-top cursor-pointer hover:bg-black/5 transition-colors group relative ${shiftId % 2 !== 0 ? 'bg-blue-50/10' : 'bg-indigo-50/10'}`}
                                        >
                                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                <Edit3 size={12} className="text-slate-400" />
                                            </div>
                                            {renderCellContent(pos.roster[shiftId])}
                                        </td>
                                    ))}
                                </tr>
                            ));
                        })}
                        <tr className="bg-yellow-50/50 border-t-2 border-slate-200">
                            <td colSpan={7} className="px-4 py-2 font-bold text-slate-700 text-center uppercase tracking-wide text-xs">Плавающий состав (Резерв)</td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 font-bold text-slate-700 border-r border-slate-200 align-top">Резерв День</td>
                            <td className="px-4 py-3 text-slate-600 border-r border-slate-200">Подсобник</td>
                            <td className="px-2 py-3 text-center text-slate-500 border-r border-slate-200">-</td>
                            <td colSpan={4} className="px-2 py-2 align-top">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {floaters.day.map((f, i) => (
                                        <div key={i} className="bg-white border border-yellow-200 rounded p-2 text-xs shadow-sm">
                                            <div className="font-bold text-slate-700">{f.name}</div>
                                            {workerRegistry[f.name]?.status && <div className="text-[10px] text-red-500">{workerRegistry[f.name].status.raw}</div>}
                                        </div>
                                    ))}
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 font-bold text-slate-700 border-r border-slate-200 align-top">Резерв Ночь</td>
                            <td className="px-4 py-3 text-slate-600 border-r border-slate-200">Подсобник</td>
                            <td className="px-2 py-3 text-center text-slate-500 border-r border-slate-200">-</td>
                            <td colSpan={4} className="px-2 py-2 align-top">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {floaters.night.map((f, i) => (
                                        <div key={i} className="bg-slate-800 border border-slate-700 rounded p-2 text-xs shadow-sm">
                                            <div className="font-bold text-slate-200">{f.name}</div>
                                            {workerRegistry[f.name]?.status && <div className="text-[10px] text-red-300">{workerRegistry[f.name].status.raw}</div>}
                                        </div>
                                    ))}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default React.memo(DistributionView);

import React, { useState } from 'react';
import { LayoutGrid, Search, Edit3, GraduationCap, Plus, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { MatrixAssignmentModal } from '../modals/MatrixAssignmentModal';

const DistributionView = () => {
    const {
        lineTemplates,
        workerRegistry,
        floaters,
        handleMatrixAssignment,
        setEditingWorker,
        setFloaters,
        setLineTemplates,
        persistStateKey
    } = useData();

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

    const handleAddFloater = (context) => {
        const name = window.prompt(`Добавить резервиста (${context === 'day' ? 'день' : 'ночь'}): введите ФИО`);
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        setFloaters((prev) => {
            const next = { day: [...(prev.day || [])], night: [...(prev.night || [])] };
            const arr = context === 'day' ? next.day : next.night;
            if (!arr.some((f) => f.name === trimmed)) {
                arr.push({
                    id: `floater_${context}_${Date.now()}`,
                    name: trimmed,
                    role: 'Подсобник',
                    type: 'floater',
                    shiftContext: context
                });
            }
            return next;
        });
    };

    const handleRemoveFloater = (context, name) => {
        const ok = window.confirm(`Убрать ${name} из резерва (${context === 'day' ? 'день' : 'ночь'})?`);
        if (!ok) return;
        setFloaters((prev) => ({
            day: (prev.day || []).filter((f) => !(context === 'day' && f.name === name)),
            night: (prev.night || []).filter((f) => !(context === 'night' && f.name === name))
        }));
    };

    const handleChangeNorm = (lineName, posIndex) => {
        const current = lineTemplates?.[lineName]?.[posIndex];
        const initial = current?.count != null ? String(current.count) : '';
        const input = window.prompt('Новая норма (кол-во людей на должности):', initial);
        if (input == null) return;
        const n = parseInt(input.trim(), 10);
        if (!Number.isFinite(n) || n <= 0) return;
        setLineTemplates((prev) => {
            const src = prev || {};
            const positions = src[lineName];
            if (!positions || !positions[posIndex]) return src;
            const nextPositions = [...positions];
            nextPositions[posIndex] = { ...nextPositions[posIndex], count: n };
            const next = { ...src, [lineName]: nextPositions };
            try {
                persistStateKey?.('plan_line_templates', next);
            } catch {}
            return next;
        });
    };

    const handleRenameRole = (lineName, posIndex) => {
        const current = lineTemplates?.[lineName]?.[posIndex];
        const initial = current?.role || '';
        const input = window.prompt('Новое название должности:', initial);
        if (input == null) return;
        const title = input.trim();
        if (!title) return;
        setLineTemplates((prev) => {
            const src = prev || {};
            const positions = src[lineName];
            if (!positions || !positions[posIndex]) return src;
            const nextPositions = [...positions];
            nextPositions[posIndex] = { ...nextPositions[posIndex], role: title };
            const next = { ...src, [lineName]: nextPositions };
            try {
                persistStateKey?.('plan_line_templates', next);
            } catch {}
            return next;
        });
    };

    const handleAddPosition = (lineName) => {
        const role = window.prompt(`Новая должность для линии "${lineName}": название роли`);
        if (!role || !role.trim()) return;
        const countStr = window.prompt('Норма (кол-во людей на должности):', '1');
        if (countStr == null) return;
        const n = parseInt(countStr.trim(), 10);
        if (!Number.isFinite(n) || n <= 0) return;
        const cleanRole = role.trim();
        setLineTemplates((prev) => {
            const src = prev || {};
            const positions = src[lineName] || [];
            const newPos = {
                role: cleanRole,
                count: n,
                roster: { '1': '', '2': '', '3': '', '4': '' }
            };
            const nextPositions = [...positions, newPos];
            const next = { ...src, [lineName]: nextPositions };
            try {
                persistStateKey?.('plan_line_templates', next);
            } catch {}
            return next;
        });
    };

    const handleRemovePosition = (lineName, posIndex) => {
        const positions = lineTemplates?.[lineName];
        const pos = positions?.[posIndex];
        if (!positions || !pos) return;
        const ok = window.confirm(`Удалить должность "${pos.role}" на линии "${lineName}"? Это уберёт её из справочника, но не затронет историю планов.`);
        if (!ok) return;
        setLineTemplates((prev) => {
            const src = prev || {};
            const current = src[lineName];
            if (!current) return src;
            const nextPositions = current.filter((_, idx) => idx !== posIndex);
            const next = { ...src, [lineName]: nextPositions };
            try {
                persistStateKey?.('plan_line_templates', next);
            } catch {}
            return next;
        });
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
                            {reg?.fiveDay && (
                                <div className="text-[10px] text-blue-600 font-medium mt-0.5">Пятидневка</div>
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
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                        <LayoutGrid size={20} className="text-blue-600" />
                        Матрица распределения (Люд)
                    </div>
                    <div className="text-[11px] text-slate-400" title="Лист «Люд» (Справочник): колонки Линия, Должность, Норма, Смена 1–4 (ФИО, компетенции, статус). Повторная загрузка файла обновляет шаблоны.">
                        Чтобы добавить линию — допишите строки в листе «Люд» в Excel и загрузите файл заново.
                    </div>
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
                                    <td className="px-4 py-3 text-slate-600 border-r border-slate-200 font-medium">
                                        <div className="flex items-center justify-between gap-1">
                                            <span>{pos.role}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRenameRole(lineName, pIdx)}
                                                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                                                title="Переименовать должность"
                                            >
                                                <Edit3 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-2 py-3 text-center text-slate-500 border-r border-slate-200">
                                        <button
                                            type="button"
                                            onClick={() => handleChangeNorm(lineName, pIdx)}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white text-xs hover:bg-slate-50"
                                            title="Изменить норму"
                                        >
                                            {pos.count}
                                        </button>
                                    </td>
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
                        <tr>
                            <td colSpan={7} className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
                                Чтобы добавить должность на линию, воспользуйтесь меню строки линии (правым кликом по названию линии или через Excel-справочник).
                            </td>
                        </tr>
                        <tr className="bg-yellow-50/50 border-t-2 border-slate-200">
                            <td colSpan={7} className="px-4 py-2 font-bold text-slate-700 text-center uppercase tracking-wide text-xs">Плавающий состав (Резерв)</td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 font-bold text-slate-700 border-r border-slate-200 align-top">Резерв День</td>
                            <td className="px-4 py-3 text-slate-600 border-r border-slate-200">Подсобник</td>
                            <td className="px-2 py-3 text-center text-slate-500 border-r border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => handleAddFloater('day')}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
                                >
                                    <Plus size={10} /> Добавить
                                </button>
                            </td>
                            <td colSpan={4} className="px-2 py-2 align-top">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {floaters.day.map((f, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setEditingWorker(f.name)}
                                            className="w-full text-left bg-white border border-yellow-200 rounded p-2 text-xs shadow-sm hover:border-yellow-300 hover:bg-yellow-50 transition-colors cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="font-bold text-slate-700 truncate">{f.name}</div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveFloater('day', f.name);
                                                    }}
                                                    className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                                    title="Убрать из резерва"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                            {workerRegistry[f.name]?.status && (
                                                <div className="text-[10px] text-red-500">
                                                    {workerRegistry[f.name].status.raw}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 font-bold text-slate-700 border-r border-slate-200 align-top">Резерв Ночь</td>
                            <td className="px-4 py-3 text-slate-600 border-r border-slate-200">Подсобник</td>
                            <td className="px-2 py-3 text-center text-slate-500 border-r border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => handleAddFloater('night')}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700"
                                >
                                    <Plus size={10} /> Добавить
                                </button>
                            </td>
                            <td colSpan={4} className="px-2 py-2 align-top">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {floaters.night.map((f, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setEditingWorker(f.name)}
                                            className="w-full text-left bg-slate-800 border border-slate-700 rounded p-2 text-xs shadow-sm hover:border-slate-500 hover:bg-slate-700 transition-colors cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="font-bold text-slate-200 truncate">{f.name}</div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveFloater('night', f.name);
                                                    }}
                                                    className="p-0.5 rounded hover:bg-slate-600 text-slate-300 hover:text-white"
                                                    title="Убрать из резерва"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                            {workerRegistry[f.name]?.status && (
                                                <div className="text-[10px] text-red-300">
                                                    {workerRegistry[f.name].status.raw}
                                                </div>
                                            )}
                                        </button>
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

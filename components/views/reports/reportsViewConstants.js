import { LayoutGrid, Users } from 'lucide-react';

export const reportOptions = [
    { id: 'lineDetail', label: 'Детальный анализ по расстановке', icon: LayoutGrid, description: 'Сравнение плановых и фактических сотрудников по линиям и сменам.', iconClasses: 'bg-indigo-100 text-indigo-600', activeClasses: 'bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-200 border-indigo-100', inactiveClasses: 'text-slate-500 hover:text-slate-700 hover:bg-slate-50' },
    { id: 'employeeAnalysis', label: 'Анализ по сотрудникам', icon: Users, description: 'Отличия между основным и оперативным планом в разрезе конкретных сотрудников.', iconClasses: 'bg-emerald-100 text-emerald-600', activeClasses: 'bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-200 border-emerald-100', inactiveClasses: 'text-slate-500 hover:text-slate-700 hover:bg-slate-50' }
];

export const changeLabels = {
    added: 'Добавление',
    lost: 'Удаление',
    replaced: 'Замена',
    moved: 'Перемещение',
    matched: 'Совпадает',
    skud_only: 'Выход вне графика'
};

export const changeColors = {
    added: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    lost: 'bg-rose-50 text-rose-700 border-rose-100',
    replaced: 'bg-amber-50 text-amber-700 border-amber-100',
    moved: 'bg-blue-50 text-blue-700 border-blue-100',
    matched: 'bg-slate-50 text-slate-600 border-slate-100',
    skud_only: 'bg-violet-50 text-violet-700 border-violet-100'
};

export const emptySummary = () => ({ added: 0, lost: 0, replaced: 0, moved: 0 });

export const slotMeta = (slot) => slot ? { slotId: slot.slotId || null, assignmentType: slot.assignmentType || null, source: slot.source || null } : { slotId: null, assignmentType: null, source: null };

export const isRvAssignment = (row) => row?.changeType === 'added' && (row?.assignmentType === 'external' || row?.factAssignmentType === 'external' || row?.factSlotMeta?.assignmentType === 'external');

export const getChangeLabel = (row) => {
    if (isRvAssignment(row)) return 'Выход по РВ';
    if (row?.changeType === 'skud_only') return 'Выход вне графика';
    return changeLabels[row?.changeType] || row?.changeType || '';
};

export const getChangeColor = (row) => {
    if (isRvAssignment(row)) return 'bg-orange-50 text-orange-700 border-orange-100';
    return changeColors[row?.changeType] || 'bg-slate-100 text-slate-500 border-slate-200';
};

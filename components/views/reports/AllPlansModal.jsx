import React from 'react';
import { LayoutGrid, X } from 'lucide-react';

const planColors = [
    { bg: 'bg-indigo-50', border: 'border-indigo-200', header: 'bg-indigo-100 border-indigo-200 text-indigo-800' },
    { bg: 'bg-emerald-50', border: 'border-emerald-200', header: 'bg-emerald-100 border-emerald-200 text-emerald-800' },
    { bg: 'bg-amber-50', border: 'border-amber-200', header: 'bg-amber-100 border-amber-200 text-amber-800' },
    { bg: 'bg-rose-50', border: 'border-rose-200', header: 'bg-rose-100 border-rose-200 text-rose-800' },
    { bg: 'bg-violet-50', border: 'border-violet-200', header: 'bg-violet-100 border-violet-200 text-violet-800' },
    { bg: 'bg-cyan-50', border: 'border-cyan-200', header: 'bg-cyan-100 border-cyan-200 text-cyan-800' },
];

function renderPlanSlots(plan, buildPlanSlots) {
    if (!plan?.data || !buildPlanSlots) return null;
    const { slots } = buildPlanSlots(plan.data);
    const byDate = {};
    slots.forEach(s => {
        if (!byDate[s.date]) byDate[s.date] = {};
        const sk = `${s.shiftId}`;
        if (!byDate[s.date][sk]) byDate[s.date][sk] = [];
        byDate[s.date][sk].push(s);
    });
    const dates = Object.keys(byDate).sort();
    const autoReassign = plan.data?.autoReassignEnabled;
    const autoLabel = autoReassign === true ? 'вкл' : autoReassign === false ? 'выкл' : 'не сохранено (по умолч. вкл)';
    return (
        <div className="space-y-3">
            <div className="text-xs text-slate-500 font-medium">
                autoReassignEnabled: {autoLabel} · слотов: {slots.length} · заполнено: {slots.filter(s => s.assignedName).length}
            </div>
            <div className="space-y-2 max-h-64 overflow-auto custom-scrollbar">
                {dates.slice(0, 7).map(date => (
                    <details key={date} className="border border-slate-200 rounded-lg overflow-hidden">
                        <summary className="px-3 py-2 bg-slate-100 cursor-pointer font-semibold text-slate-700 text-sm hover:bg-slate-200">
                            {date} — {Object.values(byDate[date]).flat().length} слотов
                        </summary>
                        <div className="p-2 bg-white border-t border-slate-100 space-y-2">
                            {Object.keys(byDate[date]).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(shiftId => {
                                const shiftSlots = byDate[date][shiftId] || [];
                                const byLine = {};
                                shiftSlots.forEach(s => {
                                    const ln = s.lineName || '—';
                                    if (!byLine[ln]) byLine[ln] = [];
                                    byLine[ln].push(s);
                                });
                                return (
                                    <div key={`${date}-${shiftId}`} className="border-l-2 border-slate-200 pl-2">
                                        <div className="font-bold text-slate-600 text-xs mb-1">Смена {shiftId}</div>
                                        {Object.entries(byLine).sort((a, b) => (a[0] || '').localeCompare(b[0] || '')).map(([lineName, lineSlots]) => (
                                            <div key={lineName} className="mb-1">
                                                <div className="font-semibold text-slate-700 text-xs">{lineName}</div>
                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                    {lineSlots.map((s, idx) => (
                                                        <span key={s.slotId || idx} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${s.assignedName ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`} title={s.source || ''}>
                                                            {s.assignedName || '(вак)'} <span className="text-[9px] opacity-70">{s.source || '—'}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                ))}
                {dates.length > 7 && <div className="text-xs text-slate-400">… ещё {dates.length - 7} дат</div>}
            </div>
        </div>
    );
}

export default function AllPlansModal({ open, onClose, savedPlans, buildPlanSlots }) {
    if (!open || !savedPlans?.length || !buildPlanSlots) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-rose-50 rounded-t-2xl">
                    <h3 className="font-bold text-lg text-rose-900 flex items-center gap-2">
                        <LayoutGrid size={20} className="text-rose-600" />
                        Состояние ВСЕХ сохранённых планов ({savedPlans.length} шт.)
                    </h3>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-auto flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {savedPlans.map((plan, idx) => {
                        const colors = planColors[idx % planColors.length];
                        const typeLabel = plan.type === 'Master' ? 'Основной' : plan.type === 'Operational' ? 'Оперативный' : '—';
                        return (
                            <div key={plan.id} className={`border ${colors.border} rounded-xl overflow-hidden ${colors.bg}`}>
                                <div className={`px-4 py-2 border-b ${colors.header} font-semibold text-sm flex items-center justify-between`}>
                                    <span className="truncate" title={plan.name}>{plan.name || plan.id}</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/60">{typeLabel}</span>
                                </div>
                                <div className="p-3 text-sm">
                                    {plan.data ? renderPlanSlots(plan, buildPlanSlots) : <div className="text-slate-500 italic">Нет данных</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl text-xs text-slate-600">
                    Каждая карточка — buildPlanSlots(plan.data). source: roster = из матрицы, manual = ручное, vacancy/вак = вакансия.
                </div>
            </div>
        </div>
    );
}

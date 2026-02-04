import React from 'react';
import { LayoutGrid, X } from 'lucide-react';

export default function MasterPlanModal({ open, onClose, masterPlan, buildPlanSlots }) {
    if (!open || !masterPlan?.data || !buildPlanSlots) return null;
    const { slots } = buildPlanSlots(masterPlan.data);
    const byDate = {};
    slots.forEach(s => {
        if (!byDate[s.date]) byDate[s.date] = {};
        const sk = `${s.shiftId}`;
        if (!byDate[s.date][sk]) byDate[s.date][sk] = [];
        byDate[s.date][sk].push(s);
    });
    const dates = Object.keys(byDate).sort();
    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-indigo-50 rounded-t-2xl">
                    <h3 className="font-bold text-lg text-indigo-900 flex items-center gap-2">
                        <LayoutGrid size={20} className="text-indigo-600" />
                        Основной план — как его видит система ({masterPlan.name || 'Master'})
                    </h3>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-auto flex-1">
                    <div className="text-sm text-slate-600 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <strong>buildPlanSlots(masterPlan.data)</strong> — слоты по дате/смене/линии. source: roster = из матрицы, manual = ручное назначение, vacancy = вакансия.
                    </div>
                    <div className="space-y-4 max-h-[60vh] overflow-auto custom-scrollbar">
                        {dates.map(date => (
                            <details key={date} className="border border-slate-200 rounded-xl overflow-hidden" open={dates.length <= 3}>
                                <summary className="px-4 py-3 bg-slate-100 cursor-pointer font-semibold text-slate-700 hover:bg-slate-200">
                                    {date} — смен: {Object.keys(byDate[date]).length}, слотов: {Object.values(byDate[date]).flat().length}
                                </summary>
                                <div className="p-4 bg-white border-t border-slate-100 space-y-4">
                                    {Object.keys(byDate[date]).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(shiftId => {
                                        const shiftSlots = byDate[date][shiftId] || [];
                                        const byLine = {};
                                        shiftSlots.forEach(s => {
                                            const ln = s.lineName || '—';
                                            if (!byLine[ln]) byLine[ln] = [];
                                            byLine[ln].push(s);
                                        });
                                        return (
                                            <div key={`${date}-${shiftId}`} className="border border-slate-100 rounded-lg overflow-hidden">
                                                <div className="px-3 py-2 bg-indigo-50 font-semibold text-indigo-800 text-sm">Смена {shiftId} — {shiftSlots.length} слотов</div>
                                                <div className="p-3 space-y-2">
                                                    {Object.entries(byLine).sort((a, b) => (a[0] || '').localeCompare(b[0] || '')).map(([lineName, lineSlots]) => (
                                                        <div key={lineName} className="border-l-4 border-indigo-200 pl-3">
                                                            <div className="font-bold text-slate-700 text-sm mb-1">{lineName}</div>
                                                            <div className="space-y-1">
                                                                {lineSlots.map((s, idx) => (
                                                                    <div key={s.slotId || idx} className="flex items-center gap-3 text-xs">
                                                                        <span className="font-mono text-slate-500 min-w-[160px] truncate">{s.role}</span>
                                                                        <span className={`font-semibold ${s.assignedName ? 'text-slate-800' : 'text-slate-400 italic'}`}>{s.assignedName || '(вакансия)'}</span>
                                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.source === 'roster' ? 'bg-emerald-100 text-emerald-700' : s.source === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{s.source || '—'}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </details>
                        ))}
                    </div>
                    <div className="mt-4 text-xs text-slate-500">Всего слотов: {slots.length}</div>
                </div>
            </div>
        </div>
    );
}

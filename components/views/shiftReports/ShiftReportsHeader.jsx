import React from 'react';
import { Calendar, RotateCcw } from 'lucide-react';

export default function ShiftReportsHeader({ activePlan, factRowsCount, hasFacts, onReloadInitialPlan }) {
    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl">
                    <Calendar size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800 leading-tight">Оперативный план (отчёты по сменам)</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                        План: {activePlan?.name} • {factRowsCount} событий
                        {hasFacts && <span className="ml-2 text-indigo-600">• введён факт</span>}
                    </p>
                </div>
            </div>
            {hasFacts && (
                <button
                    type="button"
                    onClick={onReloadInitialPlan}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    title="Сбросить все введённые факты и отобразить изначальный план"
                >
                    <RotateCcw size={18} />
                    Загрузить изначальный план заново
                </button>
            )}
        </div>
    );
}

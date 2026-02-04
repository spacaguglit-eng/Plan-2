import React from 'react';
import { FileText, Filter, Clock, LayoutGrid, CheckCircle2 } from 'lucide-react';
import { reportOptions } from './reportsViewConstants';

export default function ReportsHeader({
    reportType,
    setReportType,
    showOnlyDiffs,
    setShowOnlyDiffs,
    onShowSkudModal,
    onShowMasterPlanModal,
    onShowAllPlansModal,
    hasMasterPlan,
    hasSavedPlans
}) {
    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl">
                    <FileText size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800 leading-tight">Отчёты и анализ</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{reportOptions.find(o => o.id === reportType)?.description}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {reportOptions.map(option => {
                        const Icon = option.icon;
                        const isActive = reportType === option.id;
                        return (
                            <button
                                key={option.id}
                                onClick={() => setReportType(option.id)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all border border-transparent ${isActive ? option.activeClasses : option.inactiveClasses}`}
                            >
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${option.iconClasses}`}>
                                    <Icon size={14} />
                                </span>
                                {option.label}
                            </button>
                        );
                    })}
                </div>
                <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${showOnlyDiffs ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                        {showOnlyDiffs && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                    <input type="checkbox" checked={showOnlyDiffs} onChange={(e) => setShowOnlyDiffs(e.target.checked)} className="hidden" />
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                        <Filter size={14} className="text-slate-400" />
                        Показывать только отклонения
                    </span>
                </label>
                <button type="button" onClick={onShowSkudModal} className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors text-slate-700 text-sm font-medium" title="Что загружено из СКУД">
                    <Clock size={16} className="text-slate-500" />
                    Данные СКУД
                </button>
                {hasMasterPlan && (
                    <button type="button" onClick={onShowMasterPlanModal} className="flex items-center gap-2 px-4 py-2 bg-indigo-100 border border-indigo-200 rounded-xl hover:bg-indigo-200 transition-colors text-indigo-800 text-sm font-medium" title="Основной план">
                        <LayoutGrid size={16} className="text-indigo-600" />
                        Основной план
                    </button>
                )}
                {hasSavedPlans && (
                    <button type="button" onClick={onShowAllPlansModal} className="flex items-center gap-2 px-4 py-2 bg-rose-100 border border-rose-200 rounded-xl hover:bg-rose-200 transition-colors text-rose-800 text-sm font-medium" title="Все планы">
                        <LayoutGrid size={16} className="text-rose-600" />
                        Все копии планов
                    </button>
                )}
            </div>
        </div>
    );
}

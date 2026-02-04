import React from 'react';
import { Search, X } from 'lucide-react';

export default function ReportsToolbar({
    reportType,
    hasPlansForDiff,
    searchQuery,
    setSearchQuery,
    onShowDiagnostics,
    filterByPlan,
    setFilterByPlan,
    filterOffPlan,
    setFilterOffPlan,
    filterRv,
    setFilterRv,
    filterOvertime,
    setFilterOvertime,
    factData
}) {
    return (
        <div className="bg-white border-b border-slate-200 p-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={reportType === 'lineDetail' ? 'Поиск по названию линии...' : 'Поиск по ФИО...'}
                    className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none transition-all"
                />
                {searchQuery && (
                    <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
            {reportType === 'lineDetail' && (
                <button
                    type="button"
                    onClick={onShowDiagnostics}
                    className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                    title="Состав основного и оперативного планов для сравнения"
                >
                    Состав планов
                </button>
            )}
            {reportType === 'employeeAnalysis' && (
                <div className="flex flex-wrap items-center gap-2 border-l border-slate-200 pl-3 sm:pl-4">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Тип смен:</span>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input type="checkbox" checked={filterByPlan} onChange={(e) => setFilterByPlan(e.target.checked)} className="rounded border-slate-300" />
                        <span className="text-xs font-medium text-slate-700">По плану</span>
                    </label>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input type="checkbox" checked={filterOffPlan} onChange={(e) => setFilterOffPlan(e.target.checked)} className="rounded border-slate-300" />
                        <span className="text-xs font-medium text-slate-700">Вне плана</span>
                    </label>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50/50 cursor-pointer hover:bg-orange-50 transition-colors">
                        <input type="checkbox" checked={filterRv} onChange={(e) => setFilterRv(e.target.checked)} className="rounded border-orange-300" />
                        <span className="text-xs font-medium text-orange-800">РВ</span>
                    </label>
                    <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 ${factData ? 'bg-amber-50/50 cursor-pointer hover:bg-amber-50' : 'bg-slate-50 text-slate-400 cursor-not-allowed'} transition-colors`}>
                        <input
                            type="checkbox"
                            checked={filterOvertime}
                            onChange={(e) => setFilterOvertime(e.target.checked)}
                            disabled={!factData}
                            className="rounded border-amber-300"
                        />
                        <span className="text-xs font-medium">Переработки</span>
                    </label>
                </div>
            )}
        </div>
    );
}

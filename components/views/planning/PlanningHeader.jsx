import React from 'react';
import { Calendar } from 'lucide-react';
import { tabItems } from './planningViewConstants';

export default function PlanningHeader({
    activeTab,
    setActiveTab,
    setVisitedTabs,
    loadPlanQueue,
    currentPlanId,
    activePlanHasQueue,
    savedPlans,
    loadPlan,
    setCurrentPlanId,
    lineOptions,
    selectedPlanLine,
    setSelectedPlanLine,
    eventCountByLine,
    getPlanOptionLabel
}) {
    return (
        <>
            <header className="bg-white/95 backdrop-blur-sm border border-slate-200/80 rounded-xl shadow-sm px-6 py-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 shrink-0">
                        <Calendar size={22} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-semibold text-slate-800 tracking-tight leading-tight">Планирование очередности розлива</h1>
                        <div className="flex items-center gap-3 mt-0.5">
                            <p className="text-sm text-slate-500">Настройка графика и справочников для линии</p>
                            {activePlanHasQueue && (
                                <>
                                    <div className="h-3 w-px bg-slate-200" />
                                    <button
                                        type="button"
                                        onClick={() => loadPlanQueue?.(currentPlanId)}
                                        className="text-xs text-indigo-600 font-semibold hover:text-indigo-800 hover:underline transition-colors"
                                        title="Загрузить очередь плана для редактирования"
                                    >
                                        Загрузить очередь плана →
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <nav className="flex items-center gap-1 p-1 bg-slate-200/50 rounded-2xl ring-1 ring-slate-200/40" aria-label="Вкладки планирования">
                    {tabItems.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => {
                                setActiveTab(id);
                                setVisitedTabs(prev => ({ ...prev, [id]: true }));
                            }}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                activeTab === id
                                    ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                            }`}
                        >
                            <Icon size={18} strokeWidth={2} className={activeTab === id ? 'text-indigo-500' : 'text-slate-400'} />
                            {label}
                        </button>
                    ))}
                </nav>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 pl-3 pr-2 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">План</span>
                        <select
                            value={currentPlanId || ''}
                            onChange={(e) => {
                                const id = e.target.value || null;
                                if (id) {
                                    loadPlan?.(id, { switchToDashboard: false });
                                } else {
                                    setCurrentPlanId?.(null);
                                }
                            }}
                            className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer pr-1 min-w-[140px]"
                        >
                            <option value="">— не выбран —</option>
                            {savedPlans?.map((plan) => (
                                <option key={plan.id} value={plan.id}>
                                    {getPlanOptionLabel ? getPlanOptionLabel(plan) : (plan.name || plan.id)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 pl-3 pr-2 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">Линия</span>
                        <select
                            value={selectedPlanLine}
                            onChange={(e) => setSelectedPlanLine(e.target.value)}
                            className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer pr-1"
                        >
                            {lineOptions.map(option => (
                                <option key={option} value={option}>
                                    {option} ({eventCountByLine[option] ?? 0})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </>
    );
}

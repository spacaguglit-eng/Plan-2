import React from 'react';
import {
    Users, ChevronRight, ArrowRightLeft, Plus, Minus, CheckCircle2, Calendar, Search
} from 'lucide-react';
import { getChangeLabel, getChangeColor } from './reportsViewConstants';

export default function ReportsEmployeeAnalysisContent({
    searchFilteredEmployeeHierarchy,
    filteredEmployeeHierarchy,
    employeeDisplayList,
    employeeDisplayLimit,
    setEmployeeDisplayLimit,
    factData,
    getEmployeeReportCounts,
    getEmployeeSkudCounts,
    getSkudForWorkerDate
}) {
    return (
        <div className="p-5 space-y-4">
            {searchFilteredEmployeeHierarchy.length === 0 && filteredEmployeeHierarchy.length > 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm">
                    <Search size={40} className="opacity-30 mb-3" />
                    Ничего не найдено. Измените поиск или фильтры.
                </div>
            )}
            {employeeDisplayList.map(worker => {
                const counts = getEmployeeReportCounts(worker);
                return (
                    <details key={worker.name} className="group rounded-2xl border border-slate-200 bg-white overflow-hidden open:ring-2 open:ring-indigo-100 transition-all shadow-sm">
                        <summary className="flex items-center justify-between cursor-pointer gap-4 px-5 py-4 hover:bg-slate-50 transition-colors list-none">
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="bg-indigo-50 p-2 rounded-full text-indigo-600 flex-shrink-0">
                                    <Users size={20} />
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold text-slate-800 text-base">{worker.name}</div>
                                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                            {worker.dates.length} дат активности
                                        </span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100" title="Смен по плану">
                                            По плану: {counts.byPlan}
                                        </span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100" title="Смен вне плана">
                                            Вне плана: {counts.offPlan}
                                        </span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-100" title="Выход по РВ">
                                            РВ: {counts.rv}
                                        </span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200" title="Всего смен">
                                            Всего: {counts.total}
                                        </span>
                                        {factData && (() => {
                                            const skud = getEmployeeSkudCounts(worker);
                                            return (
                                                <>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100" title="Выходов по СКУД">
                                                        СКУД выход: {skud.exits}
                                                    </span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100" title="Невыходов по СКУД">
                                                        Невыход: {skud.noShow}
                                                    </span>
                                                    {(skud.overtimeDays > 0 || skud.totalOvertimeHours > 0) && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100" title="Переработки по СКУД">
                                                            Переработки: {skud.overtimeDays} дн. / {skud.totalOvertimeHours.toFixed(1)} ч
                                                        </span>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-slate-400 group-open:rotate-90 transition-transform mr-2 flex-shrink-0" />
                        </summary>

                        <div className="px-5 pb-5 pt-1">
                            <div className="rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                                <table className="w-full text-xs text-left border-separate border-spacing-0">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                                            <th className="px-4 py-3 border-b border-slate-100">Дата / Смена</th>
                                            <th className="px-4 py-3 border-b border-slate-100">Линия / Роль</th>
                                            <th className="px-4 py-3 border-b border-slate-100">План</th>
                                            <th className="px-4 py-3 border-b border-slate-100 text-center">
                                                <ArrowRightLeft size={14} className="mx-auto text-slate-300" />
                                            </th>
                                            <th className="px-4 py-3 border-b border-slate-100">Факт</th>
                                            <th className="px-4 py-3 border-b border-slate-100">Изменение</th>
                                            {factData && <th className="px-4 py-3 border-b border-slate-100">СКУД</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {worker.dates.flatMap(dateNode =>
                                            dateNode.shifts.flatMap(shift =>
                                                shift.rows.map((row, idx) => (
                                                    <tr key={`${row.date}-${shift.shiftId}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2 font-bold text-slate-700">
                                                                <Calendar size={12} className="text-slate-400" />
                                                                {row.date}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-medium ml-5">{row.shiftLabel || shift.shiftName}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="font-bold text-slate-700">{row.lineName}</div>
                                                            <div className="text-[10px] text-slate-400 font-medium uppercase">{row.roleTitle}</div>
                                                        </td>
                                                        <td className={`px-4 py-3 font-semibold ${row.changeType === 'added' ? 'text-slate-300 italic' : 'text-slate-600'}`}>
                                                            {row.planName || '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${
                                                                (row.changeType === 'added' && row.assignmentType === 'external') ? 'bg-orange-100 border-orange-200 text-orange-600' : getChangeColor(row)
                                                            }`}>
                                                                {row.changeType === 'added' && <Plus size={12} strokeWidth={3} />}
                                                                {row.changeType === 'lost' && <Minus size={12} strokeWidth={3} />}
                                                                {row.changeType === 'replaced' && <ArrowRightLeft size={12} strokeWidth={3} />}
                                                                {row.changeType === 'moved' && <ArrowRightLeft size={12} strokeWidth={3} className="rotate-90" />}
                                                                {row.changeType === 'matched' && <CheckCircle2 size={12} strokeWidth={3} />}
                                                            </div>
                                                        </td>
                                                        <td className={`px-4 py-3 font-semibold ${row.changeType === 'lost' ? 'text-slate-300 italic' : 'text-slate-800'}`}>
                                                            {row.factName || '—'}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-col gap-1">
                                                                <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border ${getChangeColor(row)}`}>
                                                                    {getChangeLabel(row)}
                                                                </span>
                                                                {row.note && <div className="text-[10px] text-slate-400 font-medium leading-tight">{row.note}</div>}
                                                            </div>
                                                        </td>
                                                        {factData && (() => {
                                                            const skud = getSkudForWorkerDate(worker.name, row.date);
                                                            const statusLabel = skud.status === 'ok' ? 'Выход' : skud.status === 'missing' ? 'Невыход' : '—';
                                                            const statusClass = skud.status === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : skud.status === 'missing' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-100';
                                                            return (
                                                                <td className="px-4 py-3">
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-md text-[9px] font-bold border ${statusClass}`}>
                                                                            {statusLabel}
                                                                        </span>
                                                                        <span className="text-[10px] text-slate-600 font-medium">{skud.timeDisplay}</span>
                                                                        {skud.overtimeHours > 0 && (
                                                                            <span className="text-[10px] text-amber-600 font-semibold">+{skud.overtimeHours.toFixed(1)} ч</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })()}
                                                    </tr>
                                                ))
                                            )
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </details>
                );
            })}
            {searchFilteredEmployeeHierarchy.length > employeeDisplayLimit && (
                <div className="flex justify-center py-4">
                    <button
                        type="button"
                        onClick={() => setEmployeeDisplayLimit(prev => prev + 20)}
                        className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                    >
                        Показать ещё 20 (осталось {searchFilteredEmployeeHierarchy.length - employeeDisplayLimit})
                    </button>
                </div>
            )}
        </div>
    );
}

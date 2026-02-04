import React from 'react';
import {
    Users, Clock, ChevronRight, ArrowRightLeft, Plus, Minus, CheckCircle2,
    Calendar, UserCircle2, Search
} from 'lucide-react';
import { changeLabels, getChangeLabel, getChangeColor } from './reportsViewConstants';

export default function ReportsLineDetailContent({
    searchQuery,
    searchFilteredLineHierarchy,
    filteredLineHierarchy,
    showOnlyDiffs,
    filterRows,
    buildSummaryFromRows,
    aggregateLineMetrics,
    aggregateDateMetrics,
    getShiftMetrics
}) {
    return (
        <div className="p-5 space-y-4">
            {searchFilteredLineHierarchy.length === 0 && filteredLineHierarchy.length > 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm">
                    <Search size={40} className="opacity-30 mb-3" />
                    Ничего не найдено по запросу «{searchQuery}»
                </div>
            )}
            {searchFilteredLineHierarchy.map(line => {
                const lineMetrics = aggregateLineMetrics(line);
                const hasLineMetrics = lineMetrics.headcount > 0;
                const shiftCount = line.dates.reduce((acc, dateNode) => acc + dateNode.shifts.length, 0);

                return (
                    <details key={line.displayName} className="group rounded-2xl border border-slate-200 bg-white overflow-hidden open:ring-2 open:ring-indigo-100 transition-all shadow-sm">
                        <summary className="flex items-center justify-between cursor-pointer gap-4 px-5 py-4 hover:bg-slate-50 transition-colors list-none">
                            <div className="flex items-center gap-4 flex-1">
                                <div className="bg-slate-100 p-2 rounded-lg text-slate-500 group-open:bg-indigo-100 group-open:text-indigo-600 transition-colors">
                                    <ChevronRight size={18} className="group-open:rotate-90 transition-transform" />
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 text-base">{line.displayName}</div>
                                    <div className="text-xs font-medium text-slate-400 mt-0.5 uppercase tracking-wider">
                                        {line.dates.length} дат • {shiftCount} смен
                                    </div>
                                </div>
                                {hasLineMetrics && (
                                    <div className="flex flex-wrap items-center gap-2 ml-4 border-l border-slate-200 pl-4">
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                                            <Clock size={12} /> Аутсорс: {lineMetrics.outsourcedHours}ч
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                            <Users size={12} /> Штат: {lineMetrics.ownHours}ч
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                                            <UserCircle2 size={12} /> {lineMetrics.headcount} чел.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </summary>

                        <div className="px-5 pb-5 pt-1 space-y-4 bg-slate-50/50">
                            {line.dates.map(dateNode => {
                                const dateMetrics = aggregateDateMetrics(dateNode.shifts);
                                const hasDateMetrics = dateMetrics.headcount > 0;
                                return (
                                    <details key={`${line.displayName}-${dateNode.date}`} className="group/date border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                        <summary className="flex items-center justify-between cursor-pointer px-4 py-3 hover:bg-slate-50 list-none">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-3">
                                                    <Calendar size={16} className="text-indigo-500" />
                                                    <span className="font-bold text-slate-700">{dateNode.date}</span>
                                                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                                        {dateNode.shifts.length} смен
                                                    </span>
                                                </div>
                                                {hasDateMetrics && (
                                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                                        <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 font-semibold">
                                                            <Clock size={12} className="text-amber-500" />
                                                            <span>Аутсорс: {dateMetrics.outsourcedHours}ч</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 font-semibold">
                                                            <Users size={12} className="text-emerald-500" />
                                                            <span>Штат: {dateMetrics.ownHours}ч</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 font-semibold">
                                                            <UserCircle2 size={12} className="text-indigo-600" />
                                                            <span>{dateMetrics.headcount} чел.</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <ChevronRight size={16} className="text-slate-400 group-open/date:rotate-90 transition-transform" />
                                        </summary>

                                        <div className="p-3 space-y-3">
                                            {dateNode.shifts.map(shift => {
                                                const displayedShiftRows = showOnlyDiffs ? filterRows(shift.rows) : shift.rows;
                                                if (!displayedShiftRows.length) return null;
                                                const shiftMetrics = getShiftMetrics(displayedShiftRows);
                                                const hasMetrics = shiftMetrics.headcount > 0;
                                                const changeSummary = showOnlyDiffs ? buildSummaryFromRows(displayedShiftRows) : shift.summary;
                                                return (
                                                    <div
                                                        key={`${line.displayName}-${dateNode.date}-${shift.shiftId}`}
                                                        className="border border-slate-100 rounded-lg overflow-hidden shadow-sm bg-white"
                                                    >
                                                        <div className="bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-sm shadow-indigo-200">
                                                                    {shift.shiftId}
                                                                </div>
                                                                <div className="font-bold text-slate-800 leading-tight">
                                                                    {shift.shiftName}
                                                                    <div className="text-[10px] font-medium text-slate-400 mt-0.5 uppercase tracking-wide">
                                                                        {Object.entries(changeSummary || {})
                                                                            .filter(([, v]) => v > 0)
                                                                            .map(([k, c]) => `${c} ${changeLabels[k] || k}`)
                                                                            .join(', ') || 'Без изменений'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {hasMetrics && (
                                                                <div className="flex items-center gap-2">
                                                                    <div title="Аутсорс" className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                                                                        <Clock size={10} /> {shiftMetrics.outsourcedHours}ч
                                                                    </div>
                                                                    <div title="Штат" className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                                                                        <Users size={10} /> {shiftMetrics.ownHours}ч
                                                                    </div>
                                                                    <div title="Человек" className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">
                                                                        <UserCircle2 size={10} /> {shiftMetrics.headcount}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-xs text-left border-separate border-spacing-0">
                                                                <thead>
                                                                    <tr className="bg-slate-50/50 text-slate-500 uppercase text-[10px] tracking-wider">
                                                                        <th className="px-4 py-2 border-b border-slate-100 font-bold">Роль</th>
                                                                        <th className="px-4 py-2 border-b border-slate-100 font-bold">План (основной)</th>
                                                                        <th className="px-4 py-2 border-b border-slate-100 font-bold text-center">
                                                                            <ArrowRightLeft size={14} className="mx-auto text-slate-300" />
                                                                        </th>
                                                                        <th className="px-4 py-2 border-b border-slate-100 font-bold">Факт (оперативный)</th>
                                                                        <th className="px-4 py-2 border-b border-slate-100 font-bold">Примечание</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-50">
                                                                    {displayedShiftRows.map((row, idx) => (
                                                                        <tr key={`${row.roleTitle}-${idx}`} className="hover:bg-slate-50/50 transition-colors group/row">
                                                                            <td className="px-4 py-2.5">
                                                                                <div className="font-bold text-slate-700">{row.roleTitle}</div>
                                                                                <div className="text-[10px] text-slate-400 font-medium uppercase">{row.lineName}</div>
                                                                            </td>
                                                                            <td className={`px-4 py-2.5 font-semibold ${row.changeType === 'added' ? 'text-slate-300 italic' : 'text-slate-600'}`}>
                                                                                {row.planName || '—'}
                                                                            </td>
                                                                            <td className="px-4 py-2.5 text-center">
                                                                                <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-all ${
                                                                                    getChangeColor(row)
                                                                                }`}>
                                                                                    {row.changeType === 'added' && <Plus size={12} strokeWidth={3} />}
                                                                                    {row.changeType === 'lost' && <Minus size={12} strokeWidth={3} />}
                                                                                    {row.changeType === 'replaced' && <ArrowRightLeft size={12} strokeWidth={3} />}
                                                                                    {row.changeType === 'moved' && <ArrowRightLeft size={12} strokeWidth={3} className="rotate-90" />}
                                                                                    {row.changeType === 'matched' && <CheckCircle2 size={12} strokeWidth={3} />}
                                                                                </div>
                                                                            </td>
                                                                            <td className={`px-4 py-2.5 font-semibold ${row.changeType === 'lost' ? 'text-slate-300 italic' : 'text-slate-800'}`}>
                                                                                {row.factName || '—'}
                                                                            </td>
                                                                            <td className="px-4 py-2.5">
                                                                                <div className="flex flex-col gap-1">
                                                                                    <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border ${
                                                                                        getChangeColor(row)
                                                                                    }`}>
                                                                                        {getChangeLabel(row)}
                                                                                    </span>
                                                                                    {row.note && <div className="text-[10px] text-slate-400 font-medium leading-tight">{row.note}</div>}
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </details>
                                );
                            })}
                        </div>
                    </details>
                );
            })}
        </div>
    );
}

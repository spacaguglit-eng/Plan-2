import React from 'react';
import { dateToInputValue, normalizeInputDate, parseNumeric } from './shiftReportsViewUtils';

export default function ShiftReportsReportsTab({
    factRows,
    operationalFacts,
    updateFact,
    resetFactField
}) {
    const factCellBase = 'px-3 py-1.5 border-b border-slate-100';
    const factCellChanged = 'bg-amber-50 border-l-2 border-l-amber-400';

    return (
        <div className="flex-1 min-h-0 bg-white border border-t-0 border-slate-200 rounded-b-xl overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200">
                        <tr className="text-slate-600 text-xs font-semibold tracking-wide">
                            <th className="px-3 py-2.5 text-left border-r border-slate-200 w-40">Продукт / Событие</th>
                            <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-slate-50/80">План: дата</th>
                            <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-slate-50/80">начало</th>
                            <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-slate-50/80">конец</th>
                            <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-slate-50/80">кол-во</th>
                            <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-emerald-50/80">Факт: дата</th>
                            <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-emerald-50/80">начало</th>
                            <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-emerald-50/80">конец</th>
                            <th className="px-3 py-2.5 text-left bg-emerald-50/80">кол-во</th>
                        </tr>
                    </thead>
                    <tbody>
                        {factRows.map((row, idx) => {
                            const plan = row.planEvent;
                            const prevShiftKey = idx > 0 ? factRows[idx - 1].shiftKey : null;
                            const isNewShift = row.shiftKey !== prevShiftKey;
                            const isDayShift = row.shiftKey != null && String(row.shiftKey).endsWith('_day');
                            const overrides = row.kind === 'product' ? operationalFacts?.[row.segmentKey] : null;
                            const changedDate = !!(overrides?.factStartDate || overrides?.factEndDate);
                            const changedStart = !!(overrides?.factStartDate || overrides?.factStartTime);
                            const changedEnd = !!(overrides?.factEndDate || overrides?.factEndTime);
                            const changedQty = !!(overrides && 'factQty' in overrides);
                            const startDateVal = overrides?.factStartDate ?? row.date ?? '';
                            const endDateVal = overrides?.factEndDate ?? (row.endDate ?? row.date) ?? '';
                            const startTimeVal = overrides?.factStartTime ?? row.start ?? '';
                            const endTimeVal = overrides?.factEndTime ?? row.end ?? '';
                            const qtyVal = overrides && 'factQty' in overrides ? overrides.factQty : (row.kind === 'product' ? row.displayQty : '');
                            return (
                                <React.Fragment key={row.id || idx}>
                                    {isNewShift && (
                                        <tr className="bg-slate-100 border-b border-slate-200">
                                            <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-slate-600">
                                                {row.shiftLabel}
                                            </td>
                                        </tr>
                                    )}
                                    <tr
                                        className={`border-b border-slate-100 ${row.isService ? 'bg-slate-50/50 text-slate-500' : ''} ${isDayShift ? 'bg-amber-50/20' : ''}`}
                                    >
                                        <td className={`px-3 py-2 border-r border-slate-100 ${row.isService ? 'italic' : 'font-medium text-slate-800'}`}>
                                            {row.displayName}
                                        </td>
                                        <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/50 text-slate-700">{plan ? (plan.date || '—') : '—'}</td>
                                        <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/50 text-slate-700">{plan ? (plan.start || '—') : '—'}</td>
                                        <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/50 text-slate-700">{plan ? (plan.end || '—') : '—'}</td>
                                        <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/50 text-slate-700">{plan && plan.kind === 'product' ? (plan.qty ?? '—') : '—'}</td>
                                        <td className={`${factCellBase} border-r border-slate-100 ${changedDate ? factCellChanged : 'bg-white'}`}>
                                            {row.kind === 'product' ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <input
                                                        type="date"
                                                        value={dateToInputValue(startDateVal)}
                                                        onChange={(e) => updateFact(row.segmentKey, { factStartDate: normalizeInputDate(e.target.value) })}
                                                        className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                        title="Дата начала"
                                                    />
                                                    <input
                                                        type="date"
                                                        value={dateToInputValue(endDateVal)}
                                                        onChange={(e) => updateFact(row.segmentKey, { factEndDate: normalizeInputDate(e.target.value) })}
                                                        className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                        title="Дата конца"
                                                    />
                                                    {changedDate && (
                                                        <button type="button" onClick={(ev) => { ev.stopPropagation(); resetFactField(row.segmentKey, 'date'); }} className="text-amber-600 hover:text-amber-800 text-xs self-start" title="Вернуть плановые даты">×</button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-500">{row.date || '—'}</span>
                                            )}
                                        </td>
                                        <td className={`${factCellBase} border-r border-slate-100 ${changedStart ? factCellChanged : 'bg-white'}`}>
                                            {row.kind === 'product' ? (
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="time"
                                                        value={startTimeVal}
                                                        onChange={(e) => updateFact(row.segmentKey, { factStartTime: e.target.value })}
                                                        className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                    />
                                                    {changedStart && (
                                                        <button type="button" onClick={(ev) => { ev.stopPropagation(); resetFactField(row.segmentKey, 'start'); }} className="text-amber-600 hover:text-amber-800 text-xs shrink-0" title="Вернуть плановое начало">×</button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-500">{row.start || '—'}</span>
                                            )}
                                        </td>
                                        <td className={`${factCellBase} border-r border-slate-100 ${changedEnd ? factCellChanged : 'bg-white'}`}>
                                            {row.kind === 'product' ? (
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="time"
                                                        value={endTimeVal}
                                                        onChange={(e) => updateFact(row.segmentKey, { factEndTime: e.target.value })}
                                                        className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                    />
                                                    {changedEnd && (
                                                        <button type="button" onClick={(ev) => { ev.stopPropagation(); resetFactField(row.segmentKey, 'end'); }} className="text-amber-600 hover:text-amber-800 text-xs shrink-0" title="Вернуть плановое окончание">×</button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-500">{row.end || '—'}</span>
                                            )}
                                        </td>
                                        <td className={`${factCellBase} ${changedQty ? factCellChanged : 'bg-white'}`}>
                                            {row.kind === 'product' ? (
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="text"
                                                        value={qtyVal != null && qtyVal !== '' ? String(Math.round(parseNumeric(qtyVal))) : ''}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            updateFact(row.segmentKey, { factQty: v === '' ? '' : String(Math.round(parseNumeric(v))) });
                                                        }}
                                                        placeholder="—"
                                                        className="w-16 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                    />
                                                    {changedQty && (
                                                        <button type="button" onClick={(ev) => { ev.stopPropagation(); resetFactField(row.segmentKey, 'qty'); }} className="text-amber-600 hover:text-amber-800 text-xs shrink-0" title="Вернуть плановое количество">×</button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-500">—</span>
                                            )}
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

import React, { useMemo } from 'react';
import { CalendarDays, Clock, Info, Sun, Moon } from 'lucide-react';

const ROW_HEIGHT = 36;
const LABEL_WIDTH = 160;
const HOUR_WIDTH = 28;
const MIN_BAR_WIDTH = 4;

const formatAbsMinutesToLabel = (absMin) => {
    const dayIndex = Math.floor(absMin / 1440);
    const day = new Date(dayIndex * 86400000);
    const d = String(day.getUTCDate()).padStart(2, '0');
    const m = String(day.getUTCMonth() + 1).padStart(2, '0');
    const mins = Math.floor((absMin % 1440 + 1440) % 1440);
    const h = Math.floor(mins / 60);
    const min = mins % 60;
    return {
        date: `${d}.${m}`,
        time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        hour: h
    };
};

const CalendarTab = ({ ganttSections = [] }) => {
    const { minAbs, maxAbs, totalMinutes, shiftBoundaries, dayBoundaries } = useMemo(() => {
        let minAbs = Infinity;
        let maxAbs = -Infinity;
        ganttSections.forEach(({ rows }) => {
            rows.forEach((r) => {
                if (r.absStart != null && Number.isFinite(r.absStart)) minAbs = Math.min(minAbs, r.absStart);
                if (r.absEnd != null && Number.isFinite(r.absEnd)) maxAbs = Math.max(maxAbs, r.absEnd);
            });
        });
        
        if (minAbs === Infinity) minAbs = Math.floor(Date.now() / 60000);
        if (maxAbs === -Infinity) maxAbs = minAbs + 1440;
        
        // Округляем до ближайшей границы смены (08:00 или 20:00)
        const startDay = Math.floor(minAbs / 1440);
        const s8 = startDay * 1440 + 480;
        const s20 = startDay * 1440 + 1200;
        
        if (minAbs < s8) minAbs = s8 - 720; // 20:00 предыдущего дня
        else if (minAbs < s20) minAbs = s8;
        else minAbs = s20;

        maxAbs = Math.ceil(maxAbs / 60) * 60 + 60;
        
        const totalMinutes = Math.max(maxAbs - minAbs, 60);
        
        const shifts = [];
        const days = [];
        const startTotalDay = Math.floor(minAbs / 1440);
        const endTotalDay = Math.ceil(maxAbs / 1440);
        
        for (let d = startTotalDay - 1; d <= endTotalDay + 1; d += 1) {
            const dayStart = d * 1440;
            days.push({ abs: dayStart, ...formatAbsMinutesToLabel(dayStart) });
            
            const t8 = d * 1440 + 480;
            const t20 = d * 1440 + 1200;
            
            if (t8 >= minAbs && t8 <= maxAbs) shifts.push({ abs: t8, ...formatAbsMinutesToLabel(t8), type: 'day' });
            if (t20 >= minAbs && t20 <= maxAbs) shifts.push({ abs: t20, ...formatAbsMinutesToLabel(t20), type: 'night' });
        }
        
        return { minAbs, maxAbs, totalMinutes, shiftBoundaries: shifts, dayBoundaries: days };
    }, [ganttSections]);

    const chartWidth = Math.max((totalMinutes / 60) * HOUR_WIDTH, 800);

    const hasData = ganttSections.some((s) => s.rows.length > 0);

    return (
        <div className="space-y-3">
            <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3">
                    <div className="flex items-center gap-2.5">
                        <CalendarDays size={18} className="text-slate-500" />
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-tight">График по сменам</h2>
                        </div>
                    </div>
                    
                    {hasData && (
                        <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600">
                            <div className="flex items-center gap-3 mr-2 border-r border-slate-200 pr-4">
                                <div className="flex items-center gap-1">
                                    <Sun size={12} className="text-amber-500" />
                                    <span>08:00 - 20:00</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Moon size={12} className="text-indigo-400" />
                                    <span>20:00 - 08:00</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                <div className="h-2 w-2 rounded-full bg-indigo-500" />
                                <span>Продукция</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                                <div className="h-2 w-2 rounded-full bg-amber-400" />
                                <span>Переходы / CIP</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="overflow-hidden">
                    {!hasData ? (
                        <div className="py-16 flex flex-col items-center justify-center text-center px-6">
                            <Clock className="text-slate-300 mb-3" size={28} />
                            <h3 className="text-slate-900 text-sm font-medium mb-1">Нет данных для построения графика</h3>
                            <p className="max-w-xs text-xs text-slate-500 leading-relaxed">
                                Для визуализации временной шкалы добавьте данные на вкладке планирования.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="min-w-max p-4">
                                <div
                                    className="grid border border-slate-200 bg-slate-200"
                                    style={{
                                        gridTemplateColumns: `${LABEL_WIDTH}px ${chartWidth}px`,
                                        gap: '1px'
                                    }}
                                >
                                    {/* Timeline Header */}
                                    <div className="bg-slate-100 flex items-center px-3 py-2 sticky left-0 z-20 shadow-[1px_0_0_0_#e2e8f0]">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Линия</span>
                                    </div>
                                    <div className="relative bg-slate-100 h-12 overflow-hidden">
                                        {/* Shift Backgrounds */}
                                        {shiftBoundaries.map((shift, idx) => {
                                            const nextAbs = shiftBoundaries[idx+1]?.abs || maxAbs;
                                            const left = ((shift.abs - minAbs) / totalMinutes) * 100;
                                            const width = ((nextAbs - shift.abs) / totalMinutes) * 100;
                                            if (left >= 100) return null;
                                            
                                            return (
                                                <div 
                                                    key={`bg-${shift.abs}`}
                                                    className={`absolute top-0 bottom-0 flex items-start pt-1.5 justify-center border-l border-slate-300/50
                                                        ${shift.type === 'day' ? 'bg-amber-50/20' : 'bg-indigo-50/20'}`}
                                                    style={{ left: `${Math.max(0, left)}%`, width: `${width}%` }}
                                                >
                                                    <div className="flex items-center gap-1 opacity-40">
                                                        {shift.type === 'day' ? <Sun size={10} /> : <Moon size={10} />}
                                                        <span className="text-[9px] font-bold uppercase">{shift.type === 'day' ? 'День' : 'Ночь'}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {shiftBoundaries.map(({ abs, date, time }) => (
                                            <div
                                                key={`label-${abs}`}
                                                className="absolute border-l border-slate-400 z-10 h-full flex flex-col justify-center pl-1.5"
                                                style={{
                                                    left: `${((abs - minAbs) / totalMinutes) * 100}%`
                                                }}
                                            >
                                                <span className="text-[9px] font-bold text-slate-400">{date}</span>
                                                <span className="text-[10px] font-black text-slate-800 tabular-nums leading-tight">{time}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Rows */}
                                    {ganttSections.map(({ line, rows }) => (
                                        <React.Fragment key={line}>
                                            <div className="bg-white flex items-center px-3 py-1.5 sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]">
                                                <span className="text-[11px] font-semibold text-slate-700 leading-tight">{line}</span>
                                            </div>
                                            <div
                                                className="bg-white relative group/row hover:bg-slate-50/50 transition-colors"
                                                style={{ height: ROW_HEIGHT, width: chartWidth }}
                                            >
                                                {/* Shift Grid Lines */}
                                                {shiftBoundaries.map(({ abs, type }) => (
                                                    <div 
                                                        key={`grid-${abs}`}
                                                        className={`absolute top-0 bottom-0 border-l pointer-events-none z-0
                                                            ${type === 'day' ? 'border-slate-300' : 'border-slate-300 dashed opacity-50'}`}
                                                        style={{ left: `${((abs - minAbs) / totalMinutes) * 100}%` }}
                                                    />
                                                ))}

                                                {/* Bars */}
                                                {rows.map((row, idx) => {
                                                    const duration = (row.absEnd ?? 0) - (row.absStart ?? 0);
                                                    if (duration <= 0 || !Number.isFinite(row.absStart)) return null;
                                                    const left = ((row.absStart - minAbs) / totalMinutes) * 100;
                                                    const width = Math.max(
                                                        (duration / totalMinutes) * 100,
                                                        (MIN_BAR_WIDTH / chartWidth) * 100
                                                    );
                                                    const isProduct = row.kind === 'product';
                                                    
                                                    return (
                                                        <div
                                                            key={`${idx}-${row.absStart}`}
                                                            className={`absolute top-1.5 bottom-1.5 border transition-all cursor-help hover:z-30 hover:brightness-110 shadow-sm rounded-sm
                                                                ${isProduct 
                                                                    ? 'bg-indigo-500 border-indigo-600' 
                                                                    : 'bg-amber-400 border-amber-500'
                                                                }`}
                                                            style={{
                                                                left: `${left}%`,
                                                                width: `${width}%`,
                                                                minWidth: MIN_BAR_WIDTH
                                                            }}
                                                            title={`${row.label}\n${row.start} — ${row.end}\n${row.durationMinutes} мин`}
                                                        >
                                                            <div className="h-full px-1.5 flex items-center overflow-hidden">
                                                                <span className={`text-[9px] font-bold truncate leading-none ${isProduct ? 'text-white' : 'text-amber-950'}`}>
                                                                    {width > 12 ? row.label : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>
            
            {hasData && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 border border-blue-100 rounded text-blue-700">
                    <Info size={12} className="shrink-0" />
                    <p className="text-[10px] font-medium leading-none">
                        График разделен по сменам: Дневная (08:00 - 20:00) и Ночная (20:00 - 08:00). 
                        Вертикальные линии обозначают границы смен.
                    </p>
                </div>
            )}
        </div>
    );
};

export default React.memo(CalendarTab);

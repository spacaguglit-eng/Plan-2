import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { FolderOpen, ShieldCheck, Star, AlertCircle, RefreshCw } from 'lucide-react';

const sortSlots = (slots) => {
    const parseDate = (dateStr) => {
        const parts = String(dateStr || '').split('.');
        if (parts.length !== 3) return 0;
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d).getTime() || 0;
    };
    return [...slots].sort((a, b) => {
        const t = parseDate(a.date) - parseDate(b.date);
        if (t !== 0) return t;
        const sA = String(a.shiftId);
        const sB = String(b.shiftId);
        if (sA !== sB) return sA.localeCompare(sB);
        return (a.lineName || '').localeCompare(b.lineName || '') || (a.role || '').localeCompare(b.role || '');
    });
};

const PlanTable = ({ title, icon: Icon, slots, emptyMessage = 'Нет слотов' }) => {
    const sorted = useMemo(() => sortSlots(slots), [slots]);
    return (
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2 font-semibold text-slate-800">
                <Icon size={18} className="shrink-0" />
                {title}
                <span className="text-slate-500 font-normal text-sm">({sorted.length} слотов)</span>
            </div>
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                {sorted.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-400 text-sm">{emptyMessage}</div>
                ) : (
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-600 font-medium sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 border-b border-slate-200 whitespace-nowrap">Дата</th>
                                <th className="px-3 py-2 border-b border-slate-200 whitespace-nowrap">Смена</th>
                                <th className="px-3 py-2 border-b border-slate-200 whitespace-nowrap">Линия</th>
                                <th className="px-3 py-2 border-b border-slate-200 whitespace-nowrap">Роль</th>
                                <th className="px-3 py-2 border-b border-slate-200 whitespace-nowrap">Сотрудник</th>
                                <th className="px-3 py-2 border-b border-slate-200 whitespace-nowrap">Источник</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sorted.map((slot) => (
                                <tr key={slot.slotId} className="hover:bg-slate-50/50">
                                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{slot.date}</td>
                                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{slot.shiftId}</td>
                                    <td className="px-3 py-2 text-slate-700">{slot.lineName || '—'}</td>
                                    <td className="px-3 py-2 text-slate-700">{slot.role || '—'}</td>
                                    <td className="px-3 py-2 font-medium text-slate-800">{slot.assignedName || '—'}</td>
                                    <td className="px-3 py-2 text-slate-500 text-xs">
                                        {slot.source === 'roster' && 'матрица'}
                                        {slot.source === 'manual' && 'ручное'}
                                        {slot.source === 'manualVacancy' && 'вакансия'}
                                        {slot.source === 'vacancy' && 'вакансия'}
                                        {slot.source === 'auto' && 'авто'}
                                        {slot.source === 'outsourced' && 'аутсорс'}
                                        {!['roster', 'manual', 'manualVacancy', 'vacancy', 'auto', 'outsourced'].includes(slot.source) && (slot.source || '—')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// Снимок текущего состояния (те же данные, что питают вкладку «Смены»)
const buildCurrentStateSnapshot = (state) => ({
    rawTables: state.rawTables || {},
    scheduleDates: state.scheduleDates || [],
    lineTemplates: state.lineTemplates || {},
    manualAssignments: state.manualAssignments || {},
    manualLines: state.manualLines || {},
    autoReassignEnabled: state.autoReassignEnabled,
    rosterFillEnabled: state.rosterFillEnabled
});

// Глубокое копирование снимка, чтобы синхронизация не затирала наши данные
const cloneSnapshot = (snap) => snap && JSON.parse(JSON.stringify(snap));

export default function BothPlansTableView() {
    const {
        savedPlans,
        buildPlanSlots,
        rawTables,
        scheduleDates,
        lineTemplates,
        manualAssignments,
        manualLines,
        autoReassignEnabled,
        rosterFillEnabled
    } = useData();

    // Кэш снимка «Смен»: обновляем только при валидных данных, чтобы синхронизация/loadPlan не затирала таблицу
    const [shiftsSnapshot, setShiftsSnapshot] = useState(null);
    const lastSnapshotKeyRef = useRef('');

    useEffect(() => {
        const hasValid =
            Array.isArray(scheduleDates) &&
            scheduleDates.length > 0 &&
            rawTables?.demand &&
            Array.isArray(rawTables.demand) &&
            rawTables.demand.length > 0;
        const manualCount = typeof manualAssignments === 'object' && manualAssignments !== null ? Object.keys(manualAssignments).length : 0;
        if (!hasValid) return;
        const key = `${scheduleDates.length}_${(rawTables.demand?.length ?? 0)}_${manualCount}_${JSON.stringify(scheduleDates?.slice(0, 2))}`;
        if (key === lastSnapshotKeyRef.current) {
            return;
        }
        lastSnapshotKeyRef.current = key;
        const snap = buildCurrentStateSnapshot({
            rawTables,
            scheduleDates,
            lineTemplates,
            manualAssignments,
            manualLines,
            autoReassignEnabled,
            rosterFillEnabled
        });
        setShiftsSnapshot(cloneSnapshot(snap));
    }, [rawTables, scheduleDates, lineTemplates, manualAssignments, manualLines, autoReassignEnabled, rosterFillEnabled]);

    const masterPlan = useMemo(() => savedPlans.find((p) => p.type === 'Master'), [savedPlans]);

    // Основной план — из сохранённого Master
    const masterSlots = useMemo(() => {
        if (!masterPlan?.data || !buildPlanSlots) return [];
        const { slots } = buildPlanSlots(masterPlan.data);
        return slots;
    }, [masterPlan?.id, masterPlan?.data, buildPlanSlots]);

    // Правая таблица — из кэша снимка «Смены» (не из живого контекста), чтобы синхронизация не затирала
    const operationalSlots = useMemo(() => {
        if (!buildPlanSlots) return [];
        const snap = shiftsSnapshot || buildCurrentStateSnapshot({
            rawTables,
            scheduleDates,
            lineTemplates,
            manualAssignments,
            manualLines,
            autoReassignEnabled,
            rosterFillEnabled
        });
        const { slots } = buildPlanSlots(snap);
        return slots;
    }, [buildPlanSlots, shiftsSnapshot, rawTables, scheduleDates, lineTemplates, manualAssignments, manualLines, autoReassignEnabled, rosterFillEnabled]);

    const hasMaster = Boolean(masterPlan?.data);
    const hasShiftsData = Boolean(shiftsSnapshot) || Boolean(scheduleDates?.length && rawTables?.demand?.length);
    const noPlans = !hasMaster && !hasShiftsData;

    const refreshFromContext = () => {
        const hasValid =
            Array.isArray(scheduleDates) &&
            scheduleDates.length > 0 &&
            rawTables?.demand?.length > 0;
        if (hasValid) {
            const snap = buildCurrentStateSnapshot({
                rawTables,
                scheduleDates,
                lineTemplates,
                manualAssignments,
                manualLines,
                autoReassignEnabled,
                rosterFillEnabled
            });
            lastSnapshotKeyRef.current = '';
            setShiftsSnapshot(cloneSnapshot(snap));
        }
    };

    if (noPlans) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 bg-slate-50 rounded-xl border border-slate-200 p-8">
                <div className="flex items-center gap-3 text-slate-500">
                    <FolderOpen size={32} />
                    <span className="text-lg font-medium">Нет данных для таблиц</span>
                </div>
                <p className="text-sm text-slate-500 text-center max-w-md">
                    Для левой таблицы назначьте план как <strong>Основной</strong> на вкладке «Планы». Правая таблица заполняется из текущего состояния вкладки <strong>Смены</strong> (загрузите план или загрузите файл).
                </p>
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                    <AlertCircle size={18} />
                    Нужны данные: основной план и/или загруженные смены
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-4 w-full">
                    <div className="flex items-center gap-3">
                        <div className="bg-amber-100 text-amber-700 p-2 rounded-lg">
                            <FolderOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Оба плана таблицей</h2>
                            <p className="text-sm text-slate-500">
                                Слева: сохранённый <strong>Основной план</strong> ({masterPlan?.name || '—'}). Справа: снимок с вкладки <strong>Смены</strong>
                                {shiftsSnapshot && !(scheduleDates?.length && rawTables?.demand?.length) && (
                                    <span className="text-amber-600 font-medium"> (показан сохранённый снимок)</span>
                                )}.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={refreshFromContext}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        title="Взять текущие данные из Смен заново"
                    >
                        <RefreshCw size={16} />
                        Обновить справа
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-[1600px] mx-auto">
                    <PlanTable
                        title="Основной план"
                        icon={ShieldCheck}
                        slots={masterSlots}
                        emptyMessage="Основной план не задан или без слотов"
                    />
                    <PlanTable
                        title="Текущее состояние (Смены)"
                        icon={Star}
                        slots={operationalSlots}
                        emptyMessage="Нет данных с вкладки Смены — загрузите план или файл"
                    />
                </div>
            </div>
        </div>
    );
}

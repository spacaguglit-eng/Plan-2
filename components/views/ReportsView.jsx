import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { normalizeName } from '../../utils';
import { 
    Users, 
    Clock, 
    FileText, 
    Filter, 
    ChevronRight, 
    ArrowRightLeft, 
    Plus, 
    Minus, 
    AlertCircle, 
    CheckCircle2,
    Calendar,
    LayoutGrid,
    UserCircle2,
    Search,
    X
} from 'lucide-react';

const reportOptions = [
    {
        id: 'lineDetail',
        label: 'Детальный анализ по расстановке',
        icon: LayoutGrid,
        description: 'Сравнение плановых и фактических сотрудников по линиям и сменам.',
        iconClasses: 'bg-indigo-100 text-indigo-600',
        activeClasses: 'bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-200 border-indigo-100',
        inactiveClasses: 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    },
    {
        id: 'employeeAnalysis',
        label: 'Анализ по сотрудникам',
        icon: Users,
        description: 'Отличия между основным и оперативным планом в разрезе конкретных сотрудников.',
        iconClasses: 'bg-emerald-100 text-emerald-600',
        activeClasses: 'bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-200 border-emerald-100',
        inactiveClasses: 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    }
];

const changeLabels = {
    added: 'Добавление',
    lost: 'Удаление',
    replaced: 'Замена',
    moved: 'Перемещение',
    matched: 'Совпадает'
};

const isRvAssignment = (row) => row?.changeType === 'added' && (row?.assignmentType === 'external' || row?.factAssignmentType === 'external' || row?.factSlotMeta?.assignmentType === 'external');

const getChangeLabel = (row) => {
    if (isRvAssignment(row)) return 'Выход по РВ';
    return changeLabels[row?.changeType] || row?.changeType || '';
};

const getChangeColor = (row) => {
    if (isRvAssignment(row)) return 'bg-orange-50 text-orange-700 border-orange-100';
    return changeColors[row?.changeType] || 'bg-slate-100 text-slate-500 border-slate-200';
};

const changeColors = {
    added: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    lost: 'bg-rose-50 text-rose-700 border-rose-100',
    replaced: 'bg-amber-50 text-amber-700 border-amber-100',
    moved: 'bg-blue-50 text-blue-700 border-blue-100',
    matched: 'bg-slate-50 text-slate-600 border-slate-100'
};

const emptySummary = () => ({ added: 0, lost: 0, replaced: 0, moved: 0 });

const slotMeta = (slot) => slot ? {
    slotId: slot.slotId || null,
    assignmentType: slot.assignmentType || null,
    source: slot.source || null
} : { slotId: null, assignmentType: null, source: null };

const buildSummaryFromRows = (rows) => {
    const summary = emptySummary();
    (rows || []).forEach(row => {
        if (!row?.changeType) return;
        summary[row.changeType] = (summary[row.changeType] || 0) + 1;
    });
    return summary;
};

export default function ReportsView() {
    const { scheduleDates = [], getShiftsForDate, savedPlans, comparePlanSnapshots } = useData();
    const [reportType, setReportType] = useState('lineDetail');
    const [showOnlyDiffs, setShowOnlyDiffs] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterByPlan, setFilterByPlan] = useState(true);
    const [filterOffPlan, setFilterOffPlan] = useState(true);
    const [filterRv, setFilterRv] = useState(true);

    const masterPlan = useMemo(() => savedPlans.find(plan => plan.type === 'Master'), [savedPlans]);
    const operationalPlan = useMemo(() => savedPlans.find(plan => plan.type === 'Operational'), [savedPlans]);

    const buildLineHierarchy = useMemo(() => {
        if (reportType !== 'lineDetail') return [];
        const diffChanges = (masterPlan?.data && operationalPlan?.data)
            ? (comparePlanSnapshots(masterPlan.data, operationalPlan.data)?.changes || {})
            : {};
        const lineMap = new Map();

        const ensureLine = (name) => {
            const key = name || 'Линия';
            if (!lineMap.has(key)) lineMap.set(key, { displayName: key, dates: new Map() });
            return lineMap.get(key);
        };

        const ensureDate = (lineEntry, date) => {
            const key = date || '—';
            if (!lineEntry.dates.has(key)) lineEntry.dates.set(key, { date: key, shifts: new Map() });
            return lineEntry.dates.get(key);
        };

        const ensureShift = (dateEntry, shiftId, shiftName) => {
            const key = shiftId || '—';
            if (!dateEntry.shifts.has(key)) {
                dateEntry.shifts.set(key, { shiftId: key, shiftName: shiftName || `Смена ${key}`, rows: [], summary: emptySummary() });
            }
            return dateEntry.shifts.get(key);
        };

        const collectRows = (slot, changeType, note, planSlot = slot, factSlot = slot) => {
            const baseSlot = slot || planSlot || factSlot || {};
            const lineName = baseSlot.lineName || baseSlot.line || 'Линия';
            const date = baseSlot.date || baseSlot.dateFrom || '—';
            const shiftId = baseSlot.shiftId || baseSlot.shift || '—';
            const shiftName = baseSlot.shiftName || baseSlot.shiftType || `Смена ${shiftId}`;
            const roleTitle = baseSlot.role || baseSlot.roleTitle || 'Роль';
            const lineEntry = ensureLine(lineName);
            const dateEntry = ensureDate(lineEntry, date);
            const shiftEntry = ensureShift(dateEntry, shiftId, shiftName);
            if (changeType !== 'matched') {
                shiftEntry.summary[changeType] = (shiftEntry.summary[changeType] || 0) + 1;
            }
            const planDisplayName = (changeType === 'added' || !planSlot) ? '' : (planSlot.assignedName || '');
            const factDisplayName = (changeType === 'lost' || !factSlot) ? '' : (factSlot.assignedName || '');
            const planSlotMeta = slotMeta(planSlot);
            const factSlotMeta = slotMeta(factSlot);
            shiftEntry.rows.push({
                lineName,
                roleTitle,
                planName: planDisplayName,
                factName: factDisplayName,
                changeType,
                note,
                planSlotId: planSlot?.slotId || null,
                planAssignmentType: planSlot?.assignmentType || null,
                planSource: planSlot?.source || null,
                factSlotId: factSlot?.slotId || null,
                factAssignmentType: factSlot?.assignmentType || null,
                factSource: factSlot?.source || null,
                planSlotMeta,
                factSlotMeta
            });
        };

        const addChange = (slot, changeType, planSlot, factSlot, note) => {
            collectRows(slot, changeType, note, planSlot, factSlot);
        };

        (diffChanges.added || []).forEach(slot => addChange(slot, 'added', null, slot, 'Появился в оперативном плане'));
        (diffChanges.lost || []).forEach(slot => addChange(slot, 'lost', slot, null, 'Ушёл из оперативного плана'));
        (diffChanges.replaced || []).forEach(slot => {
            const factSlot = slot.toSlot || slot;
            const planSlot = slot.fromSlot || null;
            addChange(factSlot, 'replaced', planSlot, factSlot, 'Поменялся сотрудник');
        });
        (diffChanges.moved || []).forEach(slot => {
            const factSlot = slot.to || slot.from || slot;
            const planSlot = slot.from || null;
            addChange(factSlot, 'moved', planSlot, factSlot, 'Переместился внутри смены');
        });
        const pushMatchRow = (match) => {
            const operationalSlot = match?.operational;
            const masterSlot = match?.master;
            if (!operationalSlot && !masterSlot) return;
            const factSlot = operationalSlot || masterSlot;
            const planSlot = masterSlot || null;
            addChange(factSlot, 'matched', planSlot, factSlot, 'Совпадает');
        };

        (diffChanges.matched || []).forEach(pushMatchRow);

        return Array.from(lineMap.values())
            .map(line => ({
                displayName: line.displayName,
                dates: Array.from(line.dates.values())
                    .map(dateEntry => ({
                        date: dateEntry.date,
                        shifts: Array.from(dateEntry.shifts.values())
                            .map(shiftEntry => ({
                                shiftId: shiftEntry.shiftId,
                                shiftName: shiftEntry.shiftName,
                                summary: shiftEntry.summary,
                                rows: shiftEntry.rows
                            }))
                    }))
            }))
            .filter(line => line.dates.some(dateNode => dateNode.shifts.some(shift => shift.rows.length > 0)));
    }, [reportType, masterPlan?.id, operationalPlan?.id, comparePlanSnapshots]);

    const employeeHierarchy = useMemo(() => {
        if (reportType !== 'employeeAnalysis' || !masterPlan?.data || !operationalPlan?.data) return [];
        const diff = comparePlanSnapshots(masterPlan.data, operationalPlan.data);
        const changes = diff?.changes || {};
        const workerMap = new Map();

        const ensureWorker = (name) => {
            const key = normalizeName(name || '');
            if (!key) return null;
            if (!workerMap.has(key)) workerMap.set(key, { name, dates: new Map() });
            return workerMap.get(key);
        };

        const ensureDate = (workerEntry, date) => {
            if (!workerEntry.dates.has(date)) workerEntry.dates.set(date, { date, shifts: new Map() });
            return workerEntry.dates.get(date);
        };

        const ensureShift = (dateEntry, shiftId, shiftName) => {
            if (!dateEntry.shifts.has(shiftId)) dateEntry.shifts.set(shiftId, { shiftId, shiftName, rows: [] });
            return dateEntry.shifts.get(shiftId);
        };

        const addRow = (workerName, slot, planName, factName, changeType, note) => {
            if (!workerName) return;
            const entry = ensureWorker(workerName);
            if (!entry) return;
            const dateEntry = ensureDate(entry, slot.date || '—');
            const shiftEntry = ensureShift(dateEntry, slot.shiftId || slot.shift || '—', slot.shiftName || slot.shiftType || `Смена ${slot.shiftId || slot.shift || '—'}`);
            shiftEntry.rows.push({
                lineName: slot.lineName || slot.line || 'Линия',
                roleTitle: slot.role || slot.roleTitle || 'Роль',
                planName,
                factName,
                changeType,
                assignmentType: slot?.assignmentType ?? null,
                date: slot.date || slot.dateFrom || '—',
                shiftLabel: slot.shiftName || slot.shiftType || `Смена ${slot.shiftId || slot.shift || '—'}`,
                note
            });
        };

        const pushDetailedRow = (slot, planName, factName, changeType, note) => {
            if (changeType === 'added') {
                addRow(factName, slot, '', factName, changeType, note);
            } else if (changeType === 'lost') {
                addRow(planName, slot, planName, '', changeType, note);
            } else if (changeType === 'replaced') {
                addRow(planName, slot, planName, '', changeType, 'Плановая замена');
                addRow(factName, slot, '', factName, changeType, 'Заменил по факту');
            } else if (changeType === 'moved') {
                addRow(planName, slot.from, planName, '', changeType, 'Перемещение');
                addRow(factName, slot.to, '', factName, changeType, 'Перемещение');
            }
        };
        const pushMatchRow = (match) => {
            const masterSlot = match?.master;
            const operationalSlot = match?.operational;
            const workerName = masterSlot?.assignedName || operationalSlot?.assignedName;
            const slot = masterSlot || operationalSlot;
            if (!slot || !workerName) return;
            addRow(workerName, slot, workerName, workerName, 'matched', 'Совпадает');
        };

        (changes.added || []).forEach(slot => pushDetailedRow(slot, '', slot.name || slot.assignedName, 'added', ''));
        (changes.lost || []).forEach(slot => pushDetailedRow(slot, slot.name || slot.assignedName, '', 'lost', ''));
        (changes.replaced || []).forEach(slot => pushDetailedRow(slot, slot.fromName, slot.toName, 'replaced', ''));
        (changes.moved || []).forEach(slot => pushDetailedRow(slot, slot.from?.name, slot.to?.name, 'moved', ''));
        (changes.matched || []).forEach(match => pushMatchRow(match));

        return Array.from(workerMap.values())
            .map(worker => ({
                name: worker.name,
                dates: Array.from(worker.dates.values())
                    .map(dateEntry => ({
                        date: dateEntry.date,
                        shifts: Array.from(dateEntry.shifts.values())
                    }))
            }))
            .filter(worker => worker.dates.some(dateNode => dateNode.shifts.some(shift => shift.rows.length > 0)))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [reportType, masterPlan?.id, operationalPlan?.id, comparePlanSnapshots]);

    const rowPredicate = (row) => row.changeType !== 'matched';
    const filterRows = (rows) => {
        return showOnlyDiffs ? rows.filter(rowPredicate) : rows;
    };

    const getEmployeeReportCounts = (worker) => {
        const counts = { byPlan: 0, offPlan: 0, rv: 0, total: 0 };
        (worker?.dates || []).forEach(dateNode => {
            (dateNode?.shifts || []).forEach(shift => {
                (shift?.rows || []).forEach(row => {
                    counts.total += 1;
                    if (row.changeType === 'matched') counts.byPlan += 1;
                    else counts.offPlan += 1;
                    if (row.changeType === 'added' && (row.assignmentType === 'external' || row.factAssignmentType === 'external')) counts.rv += 1;
                });
            });
        });
        return counts;
    };
    const getShiftMetrics = (rows) => {
        const metrics = { headcount: 0, outsourcedHours: 0, ownHours: 0 };
        (rows || []).forEach(row => {
            const factSlotId = row.factSlotId || row.factSlotMeta?.slotId;
            if (!factSlotId) return;
            metrics.headcount += 1;
            const assignmentType = row.factAssignmentType || row.factSlotMeta?.assignmentType;
            const source = row.factSource || row.factSlotMeta?.source;
            const isOutsourced = assignmentType === 'outsourced' || source === 'outsourced';
            if (isOutsourced) {
                metrics.outsourcedHours += 12;
            } else {
                metrics.ownHours += 12;
            }
        });
        return metrics;
    };
    const aggregateDateMetrics = (shifts = []) => {
        return (shifts || []).reduce((acc, shift) => {
            const shiftMetrics = getShiftMetrics(shift.rows);
            acc.headcount += shiftMetrics.headcount;
            acc.outsourcedHours += shiftMetrics.outsourcedHours;
            acc.ownHours += shiftMetrics.ownHours;
            return acc;
        }, { headcount: 0, outsourcedHours: 0, ownHours: 0 });
    };
    const aggregateLineMetrics = (line) => {
        const metrics = { headcount: 0, outsourcedHours: 0, ownHours: 0 };
        line.dates.forEach(dateNode => {
            dateNode.shifts.forEach(shift => {
                const shiftMetrics = getShiftMetrics(shift.rows);
                metrics.headcount += shiftMetrics.headcount;
                metrics.outsourcedHours += shiftMetrics.outsourcedHours;
                metrics.ownHours += shiftMetrics.ownHours;
            });
        });
        return metrics;
    };

    const filteredLineHierarchy = useMemo(() => {
        if (!showOnlyDiffs) return buildLineHierarchy;
        return buildLineHierarchy
            .map(line => {
                const dates = line.dates
                    .map(dateNode => {
                        const shifts = dateNode.shifts
                            .map(shift => {
                                const rows = filterRows(shift.rows);
                                if (!rows.length) return null;
                                return { ...shift, rows };
                            })
                            .filter(Boolean);
                        if (!shifts.length) return null;
                        return { ...dateNode, shifts };
                    })
                    .filter(Boolean);
                if (!dates.length) return null;
                return { ...line, dates };
            })
            .filter(Boolean);
    }, [buildLineHierarchy, showOnlyDiffs]);

    const filteredEmployeeHierarchy = useMemo(() => {
        if (!showOnlyDiffs) return employeeHierarchy;
        return employeeHierarchy
            .map(worker => {
                const dates = worker.dates
                    .map(dateNode => {
                        const shifts = dateNode.shifts
                            .map(shift => {
                                const rows = filterRows(shift.rows);
                                if (!rows.length) return null;
                                return { ...shift, rows };
                            })
                            .filter(Boolean);
                        if (!shifts.length) return null;
                        return { ...dateNode, shifts };
                    })
                    .filter(Boolean);
                if (!dates.length) return null;
                return { ...worker, dates };
            })
            .filter(Boolean);
    }, [employeeHierarchy, showOnlyDiffs]);

    const searchNorm = useMemo(() => normalizeName(searchQuery), [searchQuery]);

    const searchFilteredLineHierarchy = useMemo(() => {
        if (!searchNorm) return filteredLineHierarchy;
        return filteredLineHierarchy.filter(line =>
            normalizeName(line.displayName || '').includes(searchNorm)
        );
    }, [filteredLineHierarchy, searchNorm]);

    const searchFilteredEmployeeHierarchy = useMemo(() => {
        let list = filteredEmployeeHierarchy;
        if (searchNorm) {
            list = list.filter(w => normalizeName(w.name || '').includes(searchNorm));
        }
        const anyFilterOn = filterByPlan || filterOffPlan || filterRv;
        if (!anyFilterOn) return list;
        return list.filter(worker => {
            const c = getEmployeeReportCounts(worker);
            return (filterByPlan && c.byPlan > 0) || (filterOffPlan && c.offPlan > 0) || (filterRv && c.rv > 0);
        });
    }, [filteredEmployeeHierarchy, searchNorm, filterByPlan, filterOffPlan, filterRv]);

    const originalHierarchy = reportType === 'lineDetail' ? buildLineHierarchy : employeeHierarchy;
    const showFallback = scheduleDates.length === 0 || originalHierarchy.length === 0;
    const hasPlansForDiff = Boolean(masterPlan?.data && operationalPlan?.data);
    const fallbackText = reportType === 'lineDetail'
        ? 'Нет данных по линиям — загрузите план.'
        : 'Нет данных для сравнения — назначьте основной и оперативный план.';

    return (
        <div className="h-full w-full flex flex-col gap-4">
            {/* Header Section */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 leading-tight">Отчёты и анализ</h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {reportOptions.find(o => o.id === reportType)?.description}
                        </p>
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
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all border border-transparent ${
                                    isActive 
                                        ? `${option.activeClasses}` 
                                        : `${option.inactiveClasses}`
                                }`}
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
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        showOnlyDiffs ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'
                    }`}>
                        {showOnlyDiffs && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                    <input
                        type="checkbox"
                        checked={showOnlyDiffs}
                        onChange={(event) => setShowOnlyDiffs(event.target.checked)}
                        className="hidden"
                    />
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                        <Filter size={14} className="text-slate-400" />
                        Показывать только отклонения
                    </span>
                </label>
                </div>
            </div>

            {/* Поиск и фильтры */}
            {!showFallback && hasPlansForDiff && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
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
                        </div>
                    )}
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 min-h-0 bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
                {reportType === 'employeeAnalysis' && !hasPlansForDiff && (
                    <div className="m-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-700">
                        <AlertCircle size={20} />
                        <p className="text-sm font-medium">
                            Задайте основной и оперативный планы на вкладке «Планы», чтобы сравнение работало.
                        </p>
                    </div>
                )}

                {showFallback ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                        <div className="bg-slate-50 p-6 rounded-full mb-4">
                            <LayoutGrid size={48} className="opacity-20" />
                        </div>
                        <p className="text-lg font-medium text-slate-600">{fallbackText}</p>
                        <p className="text-sm mt-1 max-w-xs">Попробуйте загрузить данные или изменить параметры фильтрации.</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto p-5 space-y-4 custom-scrollbar">
                        {reportType === 'lineDetail' && searchFilteredLineHierarchy.length === 0 && filteredLineHierarchy.length > 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm">
                                <Search size={40} className="opacity-30 mb-3" />
                                Ничего не найдено по запросу «{searchQuery}»
                            </div>
                        )}
                        {reportType === 'lineDetail' && searchFilteredLineHierarchy.map(line => {
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
                                                            <div key={`${line.displayName}-${dateNode.date}-${shift.shiftId}`} className="border border-slate-100 rounded-lg overflow-hidden shadow-sm bg-white">
                                                                <div className="bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-sm shadow-indigo-200">
                                                                            {shift.shiftId}
                                                                        </div>
                                                                        <div className="font-bold text-slate-800 leading-tight">
                                                                            {shift.shiftName}
                                                                            <div className="text-[10px] font-medium text-slate-400 mt-0.5 uppercase tracking-wide">
                                                                                {Object.entries(changeSummary || {})
                                                                                    .filter(([_, v]) => v > 0)
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
                                                                                            changeColors[row.changeType] || 'bg-slate-100 border-slate-200 text-slate-400'
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

                        {reportType === 'employeeAnalysis' && searchFilteredEmployeeHierarchy.length === 0 && filteredEmployeeHierarchy.length > 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm">
                                <Search size={40} className="opacity-30 mb-3" />
                                Ничего не найдено. Измените поиск или фильтры.
                            </div>
                        )}
                        {reportType === 'employeeAnalysis' && searchFilteredEmployeeHierarchy.map(worker => {
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
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {worker.dates.flatMap(dateNode =>
                                                    dateNode.shifts.flatMap(shift =>
                                                        shift.rows.map((row, idx) => (
                                                            <tr key={`${shift.shiftId}-${idx}`} className="hover:bg-slate-50 transition-colors">
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
                                                                        (row.changeType === 'added' && row.assignmentType === 'external') ? 'bg-orange-100 border-orange-200 text-orange-600' : (changeColors[row.changeType] || 'bg-slate-100 border-slate-200 text-slate-400')
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
                                                                        <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border ${
                                                                            getChangeColor(row)
                                                                        }`}>
                                                                            {getChangeLabel(row)}
                                                                        </span>
                                                                        {row.note && <div className="text-[10px] text-slate-400 font-medium leading-tight">{row.note}</div>}
                                                                    </div>
                                                                </td>
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
                    </div>
                )}
            </div>
        </div>
    );
}

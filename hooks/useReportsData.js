import { useState, useRef, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { normalizeName } from '../utils';
import { emptySummary, slotMeta } from '../components/views/reports/reportsViewConstants';
import { buildFactMap, buildSummaryFromRows } from '../components/views/reports/reportsViewUtils';

export function useReportsData() {
    const { scheduleDates = [], savedPlans, comparePlanSnapshots, buildPlanSlots, factData, factDates } = useData();

    const [reportType, setReportType] = useState('lineDetail');
    const [showOnlyDiffs, setShowOnlyDiffs] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterByPlan, setFilterByPlan] = useState(false);
    const [filterOffPlan, setFilterOffPlan] = useState(false);
    const [filterRv, setFilterRv] = useState(false);
    const [filterOvertime, setFilterOvertime] = useState(false);
    const [showSkudModal, setShowSkudModal] = useState(false);
    const [showMasterPlanModal, setShowMasterPlanModal] = useState(false);
    const [showAllPlansModal, setShowAllPlansModal] = useState(false);
    const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
    const [employeeDisplayLimit, setEmployeeDisplayLimit] = useState(20);
    const [employeeAnalysisWorkerStatus, setEmployeeAnalysisWorkerStatus] = useState({ status: 'idle', error: null, requestId: 0 });
    const [employeeAnalysisWorkerResult, setEmployeeAnalysisWorkerResult] = useState(null);
    const employeeAnalysisWorkerRef = useRef(null);
    const employeeAnalysisWorkerReqIdRef = useRef(0);

    const masterPlan = useMemo(() => savedPlans?.find(p => p.type === 'Master'), [savedPlans]);
    const operationalPlan = useMemo(() => savedPlans?.find(p => p.type === 'Operational'), [savedPlans]);

    const buildLineHierarchy = useMemo(() => {
        if (reportType !== 'lineDetail') return [];
        const diffChanges = (masterPlan?.data && operationalPlan?.data) ? (comparePlanSnapshots(masterPlan.data, operationalPlan.data)?.changes || {}) : {};
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
            if (!dateEntry.shifts.has(key)) dateEntry.shifts.set(key, { shiftId: key, shiftName: shiftName || `Смена ${key}`, rows: [], summary: emptySummary() });
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
            if (changeType !== 'matched') shiftEntry.summary[changeType] = (shiftEntry.summary[changeType] || 0) + 1;
            const planDisplayName = (changeType === 'added' || !planSlot) ? '' : (planSlot.assignedName || '');
            const factDisplayName = (changeType === 'lost' || !factSlot) ? '' : (factSlot.assignedName || '');
            shiftEntry.rows.push({
                lineName, roleTitle, planName: planDisplayName, factName: factDisplayName, changeType, note,
                planSlotId: planSlot?.slotId || null, planAssignmentType: planSlot?.assignmentType || null, planSource: planSlot?.source || null,
                factSlotId: factSlot?.slotId || null, factAssignmentType: factSlot?.assignmentType || null, factSource: factSlot?.source || null,
                planSlotMeta: slotMeta(planSlot), factSlotMeta: slotMeta(factSlot)
            });
        };
        const addChange = (slot, changeType, planSlot, factSlot, note) => collectRows(slot, changeType, note, planSlot, factSlot);
        (diffChanges.added || []).forEach(slot => addChange(slot, 'added', null, slot, 'Появился в оперативном плане'));
        (diffChanges.lost || []).forEach(slot => addChange(slot, 'lost', slot, null, 'Ушёл из оперативного плана'));
        (diffChanges.replaced || []).forEach(slot => addChange(slot.toSlot || slot, 'replaced', slot.fromSlot || null, slot.toSlot || slot, 'Поменялся сотрудник'));
        (diffChanges.moved || []).forEach(slot => addChange(slot.to || slot.from || slot, 'moved', slot.from || null, slot.to || slot.from || slot, 'Переместился внутри смены'));
        const pushMatchRow = (match) => {
            const operationalSlot = match?.operational;
            const masterSlot = match?.master;
            if (!operationalSlot && !masterSlot) return;
            addChange(operationalSlot || masterSlot, 'matched', masterSlot || null, operationalSlot || masterSlot, 'Совпадает');
        };
        (diffChanges.matched || []).forEach(pushMatchRow);
        return Array.from(lineMap.values())
            .map(line => ({
                displayName: line.displayName,
                dates: Array.from(line.dates.values()).map(dateEntry => ({
                    date: dateEntry.date,
                    shifts: Array.from(dateEntry.shifts.values()).map(shiftEntry => ({
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
                planName, factName, changeType,
                assignmentType: slot?.assignmentType ?? null,
                date: slot.date || slot.dateFrom || '—',
                shiftLabel: slot.shiftName || slot.shiftType || `Смена ${slot.shiftId || slot.shift || '—'}`,
                note
            });
        };
        const pushDetailedRow = (slot, planName, factName, changeType, note) => {
            if (changeType === 'added') addRow(factName, slot, '', factName, changeType, note);
            else if (changeType === 'lost') addRow(planName, slot, planName, '', changeType, note);
            else if (changeType === 'replaced') {
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
            .map(worker => ({ name: worker.name, dates: Array.from(worker.dates.values()).map(dateEntry => ({ date: dateEntry.date, shifts: Array.from(dateEntry.shifts.values()) })) }))
            .filter(worker => worker.dates.some(dateNode => dateNode.shifts.some(shift => shift.rows.length > 0)))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [reportType, masterPlan?.id, operationalPlan?.id, comparePlanSnapshots]);

    useEffect(() => {
        if (employeeAnalysisWorkerRef.current) return;
        const worker = new Worker(new URL('../workers/reportsEmployeeAnalysis.worker.js', import.meta.url), { type: 'module' });
        employeeAnalysisWorkerRef.current = worker;
        worker.onmessage = (e) => {
            const { requestId, extendedEmployeeHierarchy, skudCacheArray, error } = e.data || {};
            if (requestId !== employeeAnalysisWorkerReqIdRef.current) return;
            if (error) { setEmployeeAnalysisWorkerStatus({ status: 'error', error: String(error), requestId }); return; }
            setEmployeeAnalysisWorkerResult({ extendedEmployeeHierarchy: extendedEmployeeHierarchy || [], skudCacheArray: skudCacheArray || [] });
            setEmployeeAnalysisWorkerStatus({ status: 'ready', error: null, requestId });
        };
        worker.onerror = (err) => setEmployeeAnalysisWorkerStatus(prev => ({ ...prev, status: 'error', error: err?.message || 'Worker error' }));
        return () => { try { employeeAnalysisWorkerRef.current?.terminate(); } catch (_) {} employeeAnalysisWorkerRef.current = null; };
    }, []);

    useEffect(() => {
        if (reportType !== 'employeeAnalysis' || !factData || typeof factData !== 'object') return;
        const worker = employeeAnalysisWorkerRef.current;
        if (!worker) return;
        const requestId = ++employeeAnalysisWorkerReqIdRef.current;
        setEmployeeAnalysisWorkerStatus({ status: 'calculating', error: null, requestId });
        setEmployeeAnalysisWorkerResult(null);
        worker.postMessage({ requestId, employeeHierarchy, factData, factDates: factDates || Object.keys(factData) });
    }, [reportType, factData, factDates, employeeHierarchy]);

    const factMapsByDate = useMemo(() => {
        const m = {};
        if (!factData) return m;
        (factDates || Object.keys(factData)).forEach(d => { if (factData[d]) m[d] = buildFactMap(factData[d]); });
        return m;
    }, [factData, factDates]);

    const useWorkerForAnalysis = reportType === 'employeeAnalysis' && factData && typeof factData === 'object';
    const workerReady = useWorkerForAnalysis && employeeAnalysisWorkerStatus.status === 'ready' && employeeAnalysisWorkerResult;
    const employeeHierarchyForReport = useMemo(() => {
        if (!useWorkerForAnalysis) return employeeHierarchy;
        if (workerReady) return employeeAnalysisWorkerResult?.extendedEmployeeHierarchy || employeeHierarchy;
        return employeeHierarchy;
    }, [useWorkerForAnalysis, workerReady, employeeAnalysisWorkerResult, employeeHierarchy]);

    const skudCache = useMemo(() => {
        const map = new Map();
        if (reportType !== 'employeeAnalysis' || !factData) return map;
        if (workerReady && Array.isArray(employeeAnalysisWorkerResult?.skudCacheArray)) {
            employeeAnalysisWorkerResult.skudCacheArray.forEach(({ key, status, timeDisplay, overtimeHours }) => map.set(key, { status, timeDisplay, overtimeHours }));
        }
        return map;
    }, [reportType, factData, workerReady, employeeAnalysisWorkerResult]);

    const getSkudForWorkerDate = (workerName, date) => {
        if (!workerName || !date) return { status: 'unassigned', timeDisplay: '—', overtimeHours: 0 };
        return skudCache.get(`${normalizeName(workerName)}__${date}`) || { status: 'unassigned', timeDisplay: '—', overtimeHours: 0 };
    };

    const getEmployeeSkudCounts = (worker) => {
        const counts = { exits: 0, noShow: 0, overtimeDays: 0, totalOvertimeHours: 0 };
        (worker?.dates || []).forEach(dateNode => {
            const skud = getSkudForWorkerDate(worker.name, dateNode.date);
            if (skud.status === 'ok') counts.exits += 1;
            if (skud.status === 'missing') counts.noShow += 1;
            if (skud.overtimeHours > 0) { counts.overtimeDays += 1; counts.totalOvertimeHours += skud.overtimeHours; }
        });
        return counts;
    };

    const rowPredicate = (row) => row.changeType !== 'matched';
    const filterRows = (rows) => showOnlyDiffs ? (rows || []).filter(rowPredicate) : (rows || []);

    const getEmployeeReportCounts = (worker) => {
        const counts = { byPlan: 0, offPlan: 0, rv: 0, total: 0 };
        (worker?.dates || []).forEach(dateNode => {
            (dateNode?.shifts || []).forEach(shift => {
                (shift?.rows || []).forEach(row => {
                    counts.total += 1;
                    if (row.changeType === 'matched') counts.byPlan += 1; else counts.offPlan += 1;
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
            if (isOutsourced) metrics.outsourcedHours += 12; else metrics.ownHours += 12;
        });
        return metrics;
    };

    const aggregateDateMetrics = (shifts = []) => (shifts || []).reduce((acc, shift) => {
        const m = getShiftMetrics(shift.rows);
        acc.headcount += m.headcount; acc.outsourcedHours += m.outsourcedHours; acc.ownHours += m.ownHours;
        return acc;
    }, { headcount: 0, outsourcedHours: 0, ownHours: 0 });

    const aggregateLineMetrics = (line) => {
        const metrics = { headcount: 0, outsourcedHours: 0, ownHours: 0 };
        (line.dates || []).forEach(dateNode => {
            (dateNode.shifts || []).forEach(shift => {
                const m = getShiftMetrics(shift.rows);
                metrics.headcount += m.headcount; metrics.outsourcedHours += m.outsourcedHours; metrics.ownHours += m.ownHours;
            });
        });
        return metrics;
    };

    const filteredLineHierarchy = useMemo(() => {
        if (!showOnlyDiffs) return buildLineHierarchy;
        return buildLineHierarchy.map(line => {
            const dates = line.dates.map(dateNode => {
                const shifts = dateNode.shifts.map(shift => { const rows = filterRows(shift.rows); if (!rows.length) return null; return { ...shift, rows }; }).filter(Boolean);
                if (!shifts.length) return null;
                return { ...dateNode, shifts };
            }).filter(Boolean);
            if (!dates.length) return null;
            return { ...line, dates };
        }).filter(Boolean);
    }, [buildLineHierarchy, showOnlyDiffs]);

    const filteredEmployeeHierarchy = useMemo(() => {
        if (!showOnlyDiffs) return employeeHierarchyForReport;
        return employeeHierarchyForReport.map(worker => {
            const dates = worker.dates.map(dateNode => {
                const shifts = dateNode.shifts.map(shift => { const rows = filterRows(shift.rows); if (!rows.length) return null; return { ...shift, rows }; }).filter(Boolean);
                if (!shifts.length) return null;
                return { ...dateNode, shifts };
            }).filter(Boolean);
            if (!dates.length) return null;
            return { ...worker, dates };
        }).filter(Boolean);
    }, [employeeHierarchyForReport, showOnlyDiffs]);

    const searchNorm = useMemo(() => normalizeName(searchQuery), [searchQuery]);

    const searchFilteredLineHierarchy = useMemo(() => {
        if (!searchNorm) return filteredLineHierarchy;
        return filteredLineHierarchy.filter(line => normalizeName(line.displayName || '').includes(searchNorm));
    }, [filteredLineHierarchy, searchNorm]);

    const searchFilteredEmployeeHierarchy = useMemo(() => {
        let list = filteredEmployeeHierarchy;
        if (searchNorm) list = list.filter(w => normalizeName(w.name || '').includes(searchNorm));
        const anyFilterOn = filterByPlan || filterOffPlan || filterRv || filterOvertime;
        if (!anyFilterOn) return list;
        return list.filter(worker => {
            const c = getEmployeeReportCounts(worker);
            const skud = filterOvertime ? getEmployeeSkudCounts(worker) : null;
            const hasOvertime = filterOvertime && factData && skud?.overtimeDays > 0;
            if (filterByPlan && c.byPlan <= 0) return false;
            if (filterOffPlan && c.offPlan <= 0) return false;
            if (filterRv && c.rv <= 0) return false;
            if (filterOvertime && !hasOvertime) return false;
            return true;
        });
    }, [filteredEmployeeHierarchy, searchNorm, filterByPlan, filterOffPlan, filterRv, filterOvertime, factData]);

    const employeeDisplayList = useMemo(() => {
        if (reportType !== 'employeeAnalysis') return [];
        return searchFilteredEmployeeHierarchy.slice(0, employeeDisplayLimit);
    }, [reportType, searchFilteredEmployeeHierarchy, employeeDisplayLimit]);

    useEffect(() => { setEmployeeDisplayLimit(20); }, [searchNorm, filterByPlan, filterOffPlan, filterRv, filterOvertime, reportType]);

    const originalHierarchy = reportType === 'lineDetail' ? buildLineHierarchy : employeeHierarchyForReport;
    const showFallback = scheduleDates.length === 0 || originalHierarchy.length === 0;
    const hasPlansForDiff = Boolean(masterPlan?.data && operationalPlan?.data);
    const fallbackText = reportType === 'lineDetail' ? 'Нет данных по линиям — загрузите план.' : 'Нет данных для сравнения — назначьте основной и оперативный план.';

    return {
        reportType, setReportType,
        showOnlyDiffs, setShowOnlyDiffs,
        searchQuery, setSearchQuery,
        filterByPlan, setFilterByPlan,
        filterOffPlan, setFilterOffPlan,
        filterRv, setFilterRv,
        filterOvertime, setFilterOvertime,
        showSkudModal, setShowSkudModal,
        showMasterPlanModal, setShowMasterPlanModal,
        showAllPlansModal, setShowAllPlansModal,
        showDiagnosticsModal, setShowDiagnosticsModal,
        employeeDisplayLimit, setEmployeeDisplayLimit,
        employeeAnalysisWorkerStatus,
        savedPlans, buildPlanSlots, factData, factDates,
        masterPlan, operationalPlan,
        buildLineHierarchy,
        filteredLineHierarchy, searchFilteredLineHierarchy,
        employeeHierarchyForReport, filteredEmployeeHierarchy, searchFilteredEmployeeHierarchy,
        employeeDisplayList,
        showFallback, hasPlansForDiff, fallbackText,
        filterRows, getShiftMetrics, buildSummaryFromRows,
        aggregateDateMetrics, aggregateLineMetrics,
        getSkudForWorkerDate, getEmployeeSkudCounts, getEmployeeReportCounts
    };
}

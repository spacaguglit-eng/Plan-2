import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { normalizeName, matchNames, cleanVal, extractShiftNumber, isLineMatch, normalizeExcelDate, formatDateLocal, expandCompositeLineKey } from '../../utils';
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
    matched: 'Совпадает',
    skud_only: 'Выход вне графика'
};

const isRvAssignment = (row) => row?.changeType === 'added' && (row?.assignmentType === 'external' || row?.factAssignmentType === 'external' || row?.factSlotMeta?.assignmentType === 'external');

const getChangeLabel = (row) => {
    if (isRvAssignment(row)) return 'Выход по РВ';
    if (row?.changeType === 'skud_only') return 'Выход вне графика';
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
    matched: 'bg-slate-50 text-slate-600 border-slate-100',
    skud_only: 'bg-violet-50 text-violet-700 border-violet-100'
};

const emptySummary = () => ({ added: 0, lost: 0, replaced: 0, moved: 0 });

const slotMeta = (slot) => slot ? {
    slotId: slot.slotId || null,
    assignmentType: slot.assignmentType || null,
    source: slot.source || null
} : { slotId: null, assignmentType: null, source: null };

const normalizeManualRoleForId = (roleTitle) => {
    return String(roleTitle || 'role').replace(/\s+/g, '_');
};

const createManualSlotId = (date, shiftId, lineId, roleTitle, index) => {
    const roleKey = normalizeManualRoleForId(roleTitle);
    return `${date}_${shiftId}_manual_${lineId}_${roleKey}_${index}`;
};

const buildPlanLineDailyCounts = (planData) => {
    const demandData = planData?.rawTables?.demand;
    const templates = planData?.lineTemplates || {};
    const assignments = planData?.manualAssignments || {};
    const manualLines = planData?.manualLines || {};
    const useRosterAsFill = planData?.autoReassignEnabled !== false;
    if (!Array.isArray(demandData) || demandData.length === 0) return {};

    const headers = Array.isArray(demandData[0]) ? demandData[0] : [];
    const result = new Map();

    const rowAt = (row, idx) => {
        if (row == null) return undefined;
        if (Array.isArray(row)) return row[idx];
        if (typeof row === 'object') return row[idx] ?? row[String(idx)];
        return undefined;
    };

    const splitNames = (val) => {
        if (!val) return [];
        return String(val)
            .split(/[,;\n/]+/)
            .map(s => s.trim())
            .filter(s => s.length > 1);
    };

    const getRosterNames = (pos, shiftNum) => {
        const roster = pos?.roster;
        if (!roster) return [];
        const val = roster[shiftNum] ?? roster[String(shiftNum)] ?? roster[Number(shiftNum)];
        return splitNames(val);
    };

    const ensureLine = (dateStr, lineName) => {
        if (!result.has(dateStr)) result.set(dateStr, new Map());
        const dateMap = result.get(dateStr);
        if (!dateMap.has(lineName)) dateMap.set(lineName, { filled: 0, unique: new Set() });
        return dateMap.get(lineName);
    };

    demandData.slice(1).forEach(row => {
        if (!row) return;
        const dateVal = rowAt(row, 11);
        const normalizedDate = normalizeExcelDate(dateVal);
        if (!normalizedDate) return;
        const dateStr = formatDateLocal(normalizedDate);
        if (!dateStr || dateStr.length < 5) return;

        const shiftRaw = cleanVal(rowAt(row, 14));
        const shiftNum = extractShiftNumber(shiftRaw);
        if (!shiftNum) return;

        const activeLines = new Set();
        for (let i = 15; i <= 26; i++) {
            if ((parseInt(rowAt(row, i), 10) || 0) > 0) {
                const headerName = cleanVal(rowAt(headers, i));
                if (headerName) {
                    expandCompositeLineKey(headerName).forEach(lineKey => {
                        if (lineKey) activeLines.add(lineKey);
                    });
                }
            }
        }

        Array.from(activeLines).forEach(activeLineName => {
            const lineBucket = ensureLine(dateStr, activeLineName);
            const templateName = Object.keys(templates).find(t => isLineMatch(activeLineName, t));
            const positions = templateName ? templates[templateName] : [];
            positions.forEach(pos => {
                const assignedNamesList = getRosterNames(pos, shiftNum);
                const totalSlots = Math.max(parseInt(pos?.count) || 1, assignedNamesList.length);
                for (let i = 0; i < totalSlots; i++) {
                    const slotId = `${dateStr}_${shiftNum}_${activeLineName}_${pos.role}_${i}`;
                    const baseName = useRosterAsFill ? (assignedNamesList[i] || null) : null;
                    const manual = assignments[slotId];
                    let name = baseName;
                    if (manual) {
                        if (manual.type === 'vacancy') {
                            name = null;
                        } else {
                            name = manual.name || baseName;
                        }
                    }
                    if (name) {
                        lineBucket.filled += 1;
                        lineBucket.unique.add(name);
                    }
                }
            });
        });

        const manualLineDefs = manualLines?.[`${dateStr}_${shiftNum}`] || [];
        manualLineDefs.forEach(manualLine => {
            const lineBucket = ensureLine(dateStr, manualLine.displayName || manualLine.id);
            (manualLine.positions || []).forEach(pos => {
                const count = Math.max(1, parseInt(pos.count, 10) || 1);
                for (let idx = 0; idx < count; idx++) {
                    const slotId = createManualSlotId(dateStr, shiftNum, manualLine.id, pos.roleTitle || pos.role, idx);
                    const manual = assignments[slotId];
                    const name = manual?.type === 'vacancy' ? null : (manual?.name || null);
                    if (name) {
                        lineBucket.filled += 1;
                        lineBucket.unique.add(name);
                    }
                }
            });
        });
    });

    const output = {};
    result.forEach((lineMap, dateStr) => {
        output[dateStr] = {};
        lineMap.forEach((value, lineName) => {
            output[dateStr][lineName] = { filled: value.filled, unique: value.unique.size };
        });
    });
    return output;
};
const buildSummaryFromRows = (rows) => {
    const summary = emptySummary();
    (rows || []).forEach(row => {
        if (!row?.changeType) return;
        summary[row.changeType] = (summary[row.changeType] || 0) + 1;
    });
    return summary;
};

const getSurnameNorm = (fullName) => {
    const first = String(fullName || '').trim().split(/\s+/)[0] || '';
    return normalizeName(first);
};

const buildFactMap = (dayFact) => {
    if (!dayFact) return { byNormKey: new Map(), byNormRawName: new Map(), bySurname: new Map() };
    const byNormKey = new Map();
    const byNormRawName = new Map();
    const bySurname = new Map();
    Object.entries(dayFact).forEach(([key, value]) => {
        if (!value) return;
        const normKey = normalizeName(key);
        byNormKey.set(normKey, value);
        if (value.rawName) {
            const normRawName = normalizeName(value.rawName);
            byNormRawName.set(normRawName, value);
            const surname = getSurnameNorm(value.rawName);
            if (!bySurname.has(surname)) bySurname.set(surname, []);
            bySurname.get(surname).push(value);
        }
    });
    return { byNormKey, byNormRawName, bySurname };
};

const resolveFactEntry = (planName, factMap) => {
    if (!planName || !factMap) return null;
    const normName = normalizeName(planName);
    let factEntry = factMap.byNormKey.get(normName) || factMap.byNormRawName.get(normName);
    if (factEntry) return factEntry;
    const surname = getSurnameNorm(planName);
    const candidates = factMap.bySurname.get(surname) || [];
    for (const candidate of candidates) {
        if (candidate?.rawName && matchNames(planName, candidate.rawName)) return candidate;
    }
    return null;
};

const formatFactTime = (factEntry) => {
    if (!factEntry) return '—';
    if (factEntry.hasOvernightShift && factEntry.nextDayExit) return `${factEntry.entryTime} → ${factEntry.nextDayExit} (+1)`;
    if (factEntry.hasOvernightShift) return `Вход: ${factEntry.entryTime} (ночная)`;
    if (factEntry.entryTime && !factEntry.exitTime) return `Вход: ${factEntry.entryTime}`;
    if (factEntry.entryTime && factEntry.exitTime) return `${factEntry.entryTime} → ${factEntry.exitTime}`;
    return factEntry.time || '—';
};

const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

const STANDARD_SHIFT_HOURS = 12;

const computeOvertimeHours = (factEntry) => {
    if (!factEntry) return 0;
    const entryM = parseTimeToMinutes(factEntry.entryTime);
    const exitM = parseTimeToMinutes(factEntry.exitTime);
    const nextExitM = parseTimeToMinutes(factEntry.nextDayExit);
    if (factEntry.hasOvernightShift && nextExitM != null) {
        if (entryM == null) return 0;
        const durationM = (24 * 60 - entryM) + nextExitM;
        const durationH = durationM / 60;
        return Math.max(0, durationH - STANDARD_SHIFT_HOURS);
    }
    if (entryM != null && exitM != null) {
        let durationM = exitM - entryM;
        if (durationM < 0) durationM += 24 * 60;
        const durationH = durationM / 60;
        return Math.max(0, durationH - STANDARD_SHIFT_HOURS);
    }
    return 0;
};

export default function ReportsView() {
    const { scheduleDates = [], getShiftsForDate, savedPlans, comparePlanSnapshots, buildPlanSlots, currentPlanId, autoReassignEnabled, factData, factDates } = useData();
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
    const [employeeDisplayLimit, setEmployeeDisplayLimit] = useState(20);
    const [employeeAnalysisWorkerStatus, setEmployeeAnalysisWorkerStatus] = useState({ status: 'idle', error: null, requestId: 0 });
    const [employeeAnalysisWorkerResult, setEmployeeAnalysisWorkerResult] = useState(null);
    const employeeAnalysisWorkerRef = useRef(null);
    const employeeAnalysisWorkerReqIdRef = useRef(0);

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

    useEffect(() => {
        if (employeeAnalysisWorkerRef.current) return;
        const worker = new Worker(new URL('../../workers/reportsEmployeeAnalysis.worker.js', import.meta.url), { type: 'module' });
        employeeAnalysisWorkerRef.current = worker;
        worker.onmessage = (e) => {
            const { requestId, extendedEmployeeHierarchy, skudCacheArray, error } = e.data || {};
            if (requestId !== employeeAnalysisWorkerReqIdRef.current) return;
            if (error) {
                setEmployeeAnalysisWorkerStatus({ status: 'error', error: String(error), requestId });
                return;
            }
            setEmployeeAnalysisWorkerResult({ extendedEmployeeHierarchy: extendedEmployeeHierarchy || [], skudCacheArray: skudCacheArray || [] });
            setEmployeeAnalysisWorkerStatus({ status: 'ready', error: null, requestId });
        };
        worker.onerror = (err) => {
            setEmployeeAnalysisWorkerStatus((prev) => ({ ...prev, status: 'error', error: err?.message || 'Worker error' }));
        };
        return () => {
            try { worker.terminate(); } catch (_) {}
            employeeAnalysisWorkerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (reportType !== 'employeeAnalysis' || !factData || typeof factData !== 'object') return;
        const worker = employeeAnalysisWorkerRef.current;
        if (!worker) return;
        const requestId = ++employeeAnalysisWorkerReqIdRef.current;
        setEmployeeAnalysisWorkerStatus({ status: 'calculating', error: null, requestId });
        setEmployeeAnalysisWorkerResult(null);
        worker.postMessage({
            requestId,
            employeeHierarchy,
            factData,
            factDates: factDates || Object.keys(factData)
        });
    }, [reportType, factData, factDates, employeeHierarchy]);

    const factMapsByDate = useMemo(() => {
        const m = {};
        if (!factData) return m;
        (factDates || Object.keys(factData)).forEach(d => {
            if (factData[d]) m[d] = buildFactMap(factData[d]);
        });
        return m;
    }, [factData, factDates]);

    const useWorkerForAnalysis = reportType === 'employeeAnalysis' && factData && typeof factData === 'object';
    const workerReady = useWorkerForAnalysis && employeeAnalysisWorkerStatus.status === 'ready' && employeeAnalysisWorkerResult;

    const employeeHierarchyForReport = useMemo(() => {
        if (!useWorkerForAnalysis) return employeeHierarchy;
        if (workerReady) return employeeAnalysisWorkerResult.extendedEmployeeHierarchy || employeeHierarchy;
        return employeeHierarchy;
    }, [useWorkerForAnalysis, workerReady, employeeAnalysisWorkerResult, employeeHierarchy]);

    const skudCache = useMemo(() => {
        const map = new Map();
        if (reportType !== 'employeeAnalysis' || !factData) return map;
        if (workerReady && Array.isArray(employeeAnalysisWorkerResult.skudCacheArray)) {
            employeeAnalysisWorkerResult.skudCacheArray.forEach(({ key, status, timeDisplay, overtimeHours }) => {
                map.set(key, { status, timeDisplay, overtimeHours });
            });
        }
        return map;
    }, [reportType, factData, workerReady, employeeAnalysisWorkerResult]);

    const getSkudForWorkerDate = (workerName, date) => {
        if (!workerName || !date) return { status: 'unassigned', timeDisplay: '—', overtimeHours: 0 };
        const key = `${normalizeName(workerName)}__${date}`;
        return skudCache.get(key) || { status: 'unassigned', timeDisplay: '—', overtimeHours: 0 };
    };

    const getEmployeeSkudCounts = (worker) => {
        const counts = { exits: 0, noShow: 0, overtimeDays: 0, totalOvertimeHours: 0 };
        (worker?.dates || []).forEach(dateNode => {
            const skud = getSkudForWorkerDate(worker.name, dateNode.date);
            if (skud.status === 'ok') counts.exits += 1;
            if (skud.status === 'missing') counts.noShow += 1;
            if (skud.overtimeHours > 0) {
                counts.overtimeDays += 1;
                counts.totalOvertimeHours += skud.overtimeHours;
            }
        });
        return counts;
    };

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
        if (!showOnlyDiffs) return employeeHierarchyForReport;
        return employeeHierarchyForReport
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
    }, [employeeHierarchyForReport, showOnlyDiffs]);

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

    useEffect(() => {
        setEmployeeDisplayLimit(20);
    }, [searchNorm, filterByPlan, filterOffPlan, filterRv, filterOvertime, reportType]);

    const originalHierarchy = reportType === 'lineDetail' ? buildLineHierarchy : employeeHierarchyForReport;
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

                <button
                    type="button"
                    onClick={() => setShowSkudModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors text-slate-700 text-sm font-medium"
                    title="Что загружено из СКУД и как это читается"
                >
                    <Clock size={16} className="text-slate-500" />
                    Данные СКУД
                </button>
                {masterPlan?.data && buildPlanSlots && (
                    <button
                        type="button"
                        onClick={() => setShowMasterPlanModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-100 border border-indigo-200 rounded-xl hover:bg-indigo-200 transition-colors text-indigo-800 text-sm font-medium"
                        title="Вывести основной план как он виден системе"
                    >
                        <LayoutGrid size={16} className="text-indigo-600" />
                        Основной план
                    </button>
                )}
                {savedPlans?.length > 0 && buildPlanSlots && (
                    <button
                        type="button"
                        onClick={() => setShowAllPlansModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-100 border border-rose-200 rounded-xl hover:bg-rose-200 transition-colors text-rose-800 text-sm font-medium"
                        title="Состояние ВСЕХ сохранённых планов"
                    >
                        <LayoutGrid size={16} className="text-rose-600" />
                        Все копии планов
                    </button>
                )}
                </div>
            </div>

            {showMasterPlanModal && masterPlan?.data && buildPlanSlots && (() => {
                const { slots } = buildPlanSlots(masterPlan.data);
                const byDate = {};
                slots.forEach(s => {
                    if (!byDate[s.date]) byDate[s.date] = {};
                    const dk = s.date;
                    const sk = `${s.shiftId}`;
                    if (!byDate[dk][sk]) byDate[dk][sk] = [];
                    byDate[dk][sk].push(s);
                });
                const dates = Object.keys(byDate).sort();
                return (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowMasterPlanModal(false)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-indigo-50 rounded-t-2xl">
                                <h3 className="font-bold text-lg text-indigo-900 flex items-center gap-2">
                                    <LayoutGrid size={20} className="text-indigo-600" />
                                    Основной план — как его видит система ({masterPlan.name || 'Master'})
                                </h3>
                                <button type="button" onClick={() => setShowMasterPlanModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6 overflow-auto flex-1">
                                <div className="text-sm text-slate-600 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <strong>buildPlanSlots(masterPlan.data)</strong> — слоты по дате/смене/линии. source: roster = из матрицы (roster), manual = ручное назначение, vacancy = вакансия.
                                </div>
                                <div className="space-y-4 max-h-[60vh] overflow-auto custom-scrollbar">
                                    {dates.map(date => (
                                        <details key={date} className="border border-slate-200 rounded-xl overflow-hidden" open={dates.length <= 3}>
                                            <summary className="px-4 py-3 bg-slate-100 cursor-pointer font-semibold text-slate-700 hover:bg-slate-200">
                                                {date} — смен: {Object.keys(byDate[date]).length}, слотов: {Object.values(byDate[date]).flat().length}
                                            </summary>
                                            <div className="p-4 bg-white border-t border-slate-100 space-y-4">
                                                {Object.keys(byDate[date]).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(shiftId => {
                                                    const shiftSlots = byDate[date][shiftId] || [];
                                                    const byLine = {};
                                                    shiftSlots.forEach(s => {
                                                        const ln = s.lineName || '—';
                                                        if (!byLine[ln]) byLine[ln] = [];
                                                        byLine[ln].push(s);
                                                    });
                                                    return (
                                                        <div key={`${date}-${shiftId}`} className="border border-slate-100 rounded-lg overflow-hidden">
                                                            <div className="px-3 py-2 bg-indigo-50 font-semibold text-indigo-800 text-sm">
                                                                Смена {shiftId} — {shiftSlots.length} слотов
                                                            </div>
                                                            <div className="p-3 space-y-2">
                                                                {Object.entries(byLine).sort((a, b) => (a[0] || '').localeCompare(b[0] || '')).map(([lineName, lineSlots]) => (
                                                                    <div key={lineName} className="border-l-4 border-indigo-200 pl-3">
                                                                        <div className="font-bold text-slate-700 text-sm mb-1">{lineName}</div>
                                                                        <div className="space-y-1">
                                                                            {lineSlots.map((s, idx) => (
                                                                                <div key={s.slotId || idx} className="flex items-center gap-3 text-xs">
                                                                                    <span className="font-mono text-slate-500 min-w-[160px] truncate">{s.role}</span>
                                                                                    <span className={`font-semibold ${s.assignedName ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                                                                                        {s.assignedName || '(вакансия)'}
                                                                                    </span>
                                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.source === 'roster' ? 'bg-emerald-100 text-emerald-700' : s.source === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                                        {s.source || '—'}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </details>
                                    ))}
                                </div>
                                <div className="mt-4 text-xs text-slate-500">
                                    Всего слотов: {slots.length}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showAllPlansModal && savedPlans?.length > 0 && buildPlanSlots && (() => {
                const planColors = [
                    { bg: 'bg-indigo-50', border: 'border-indigo-200', header: 'bg-indigo-100 border-indigo-200 text-indigo-800' },
                    { bg: 'bg-emerald-50', border: 'border-emerald-200', header: 'bg-emerald-100 border-emerald-200 text-emerald-800' },
                    { bg: 'bg-amber-50', border: 'border-amber-200', header: 'bg-amber-100 border-amber-200 text-amber-800' },
                    { bg: 'bg-rose-50', border: 'border-rose-200', header: 'bg-rose-100 border-rose-200 text-rose-800' },
                    { bg: 'bg-violet-50', border: 'border-violet-200', header: 'bg-violet-100 border-violet-200 text-violet-800' },
                    { bg: 'bg-cyan-50', border: 'border-cyan-200', header: 'bg-cyan-100 border-cyan-200 text-cyan-800' },
                ];
                const renderPlanSlots = (plan) => {
                    const { slots } = buildPlanSlots(plan.data);
                    const byDate = {};
                    slots.forEach(s => {
                        if (!byDate[s.date]) byDate[s.date] = {};
                        const sk = `${s.shiftId}`;
                        if (!byDate[s.date][sk]) byDate[s.date][sk] = [];
                        byDate[s.date][sk].push(s);
                    });
                    const dates = Object.keys(byDate).sort();
                    const autoReassign = plan.data?.autoReassignEnabled;
                    const autoLabel = autoReassign === true ? 'вкл' : autoReassign === false ? 'выкл' : 'не сохранено (по умолч. вкл)';
                    return (
                        <div key={plan.id} className="space-y-3">
                            <div className="text-xs text-slate-500 font-medium">
                                autoReassignEnabled: {autoLabel} · слотов: {slots.length} · заполнено: {slots.filter(s => s.assignedName).length}
                            </div>
                            <div className="space-y-2 max-h-64 overflow-auto custom-scrollbar">
                                {dates.slice(0, 7).map(date => (
                                    <details key={date} className="border border-slate-200 rounded-lg overflow-hidden">
                                        <summary className="px-3 py-2 bg-slate-100 cursor-pointer font-semibold text-slate-700 text-sm hover:bg-slate-200">
                                            {date} — {Object.values(byDate[date]).flat().length} слотов
                                        </summary>
                                        <div className="p-2 bg-white border-t border-slate-100 space-y-2">
                                            {Object.keys(byDate[date]).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(shiftId => {
                                                const shiftSlots = byDate[date][shiftId] || [];
                                                const byLine = {};
                                                shiftSlots.forEach(s => {
                                                    const ln = s.lineName || '—';
                                                    if (!byLine[ln]) byLine[ln] = [];
                                                    byLine[ln].push(s);
                                                });
                                                return (
                                                    <div key={`${date}-${shiftId}`} className="border-l-2 border-slate-200 pl-2">
                                                        <div className="font-bold text-slate-600 text-xs mb-1">Смена {shiftId}</div>
                                                        {Object.entries(byLine).sort((a, b) => (a[0] || '').localeCompare(b[0] || '')).map(([lineName, lineSlots]) => (
                                                            <div key={lineName} className="mb-1">
                                                                <div className="font-semibold text-slate-700 text-xs">{lineName}</div>
                                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                                    {lineSlots.map((s, idx) => (
                                                                        <span key={s.slotId || idx} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${s.assignedName ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`} title={s.source || ''}>
                                                                            {s.assignedName || '(вак)'} <span className="text-[9px] opacity-70">{s.source || '—'}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </details>
                                ))}
                                {dates.length > 7 && <div className="text-xs text-slate-400">… ещё {dates.length - 7} дат</div>}
                            </div>
                        </div>
                    );
                };
                return (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAllPlansModal(false)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-rose-50 rounded-t-2xl">
                                <h3 className="font-bold text-lg text-rose-900 flex items-center gap-2">
                                    <LayoutGrid size={20} className="text-rose-600" />
                                    Состояние ВСЕХ сохранённых планов ({savedPlans.length} шт.)
                                </h3>
                                <button type="button" onClick={() => setShowAllPlansModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6 overflow-auto flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {savedPlans.map((plan, idx) => {
                                    const colors = planColors[idx % planColors.length];
                                    const typeLabel = plan.type === 'Master' ? 'Основной' : plan.type === 'Operational' ? 'Оперативный' : '—';
                                    return (
                                        <div key={plan.id} className={`border ${colors.border} rounded-xl overflow-hidden ${colors.bg}`}>
                                            <div className={`px-4 py-2 border-b ${colors.header} font-semibold text-sm flex items-center justify-between`}>
                                                <span className="truncate" title={plan.name}>{plan.name || plan.id}</span>
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/60">{typeLabel}</span>
                                            </div>
                                            <div className="p-3 text-sm">
                                                {plan.data ? renderPlanSlots(plan) : <div className="text-slate-500 italic">Нет данных</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl text-xs text-slate-600">
                                Каждая карточка — buildPlanSlots(plan.data). source: roster = из матрицы, manual = ручное, vacancy/вак = вакансия.
                                autoReassignEnabled влияет на roster: при вкл слоты заполняются из матрицы, при выкл — пусто.
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showSkudModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSkudModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Clock size={20} className="text-slate-500" />
                                Данные СКУД — что загружено и как читается
                            </h3>
                            <button type="button" onClick={() => setShowSkudModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-auto flex-1 space-y-6">
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 font-semibold text-slate-700 text-sm">
                                    factDates (список дат из СКУД)
                                </div>
                                <div className="p-4 text-sm font-mono">
                                    {!factDates || factDates.length === 0 ? (
                                        <span className="text-amber-600">Нет данных — массив пуст или не загружен.</span>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {factDates.map(d => <span key={d} className="px-2 py-1 bg-slate-100 rounded text-slate-700">{d}</span>)}
                                        </div>
                                    )}
                                    <div className="mt-2 text-slate-400 text-xs">Всего дат: {Array.isArray(factDates) ? factDates.length : 0}</div>
                                </div>
                            </div>
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 font-semibold text-slate-700 text-sm">
                                    factData (по датам: ключ даты → записи по сотрудникам)
                                </div>
                                <div className="p-4 text-sm">
                                    {!factData || typeof factData !== 'object' ? (
                                        <span className="text-amber-600">Нет данных — factData не загружен (null или не объект).</span>
                                    ) : (
                                        <div className="space-y-4">
                                            {Object.keys(factData).length === 0 ? (
                                                <span className="text-amber-600">Объект пуст — нет ни одной даты.</span>
                                            ) : (
                                                Object.entries(factData).slice(0, 5).map(([date, dayFact]) => (
                                                    <details key={date} className="border border-slate-100 rounded-lg overflow-hidden">
                                                        <summary className="px-3 py-2 bg-slate-50 cursor-pointer font-medium text-slate-700">
                                                            {date} — записей: {dayFact && typeof dayFact === 'object' ? Object.keys(dayFact).length : 0}
                                                        </summary>
                                                        <div className="p-3 bg-white border-t border-slate-100">
                                                            {dayFact && typeof dayFact === 'object' ? (
                                                                <ul className="space-y-2 text-xs font-mono">
                                                                    {Object.entries(dayFact).slice(0, 20).map(([key, value]) => (
                                                                        <li key={key} className="border-b border-slate-50 pb-2 last:border-0">
                                                                            <span className="text-slate-500">Ключ:</span> {String(key)}
                                                                            {value && typeof value === 'object' && (
                                                                                <div className="mt-1 text-slate-600 grid grid-cols-2 gap-x-4 gap-y-0.5">
                                                                                    {['rawName', 'entryTime', 'exitTime', 'cleanTime', 'time', 'hasOvernightShift', 'nextDayExit'].map(f => (
                                                                                        <span key={f}><span className="text-slate-400">{f}:</span> {value[f] != null ? String(value[f]) : '—'}</span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </li>
                                                                    ))}
                                                                    {Object.keys(dayFact).length > 20 && (
                                                                        <li className="text-slate-400">… и ещё {Object.keys(dayFact).length - 20} записей</li>
                                                                    )}
                                                                </ul>
                                                            ) : (
                                                                <span className="text-slate-500">Не объект: {typeof dayFact}</span>
                                                            )}
                                                        </div>
                                                    </details>
                                                ))
                                            )}
                                            {Object.keys(factData).length > 5 && (
                                                <p className="text-slate-400 text-xs">… и ещё {Object.keys(factData).length - 5} дат</p>
                                            )}
                                        </div>
                                    )}
                                    <div className="mt-2 text-slate-400 text-xs">
                                        Ожидаемая структура: factData[дата] = объект, ключи — идентификатор/ФИО, значение: rawName, entryTime, exitTime, cleanTime, time, hasOvernightShift, nextDayExit.
                                    </div>
                                </div>
                            </div>
                            <div className="border border-indigo-200 rounded-xl bg-indigo-50/30 overflow-hidden">
                                <div className="px-4 py-2 bg-indigo-100 border-b border-indigo-200 font-semibold text-indigo-800 text-sm">
                                    Как читается в отчёте «Анализ по сотрудникам»
                                </div>
                                <div className="p-4 text-sm text-slate-700 space-y-2">
                                    <p>1. Для каждой даты из factData строится индекс (factMap): по нормализованному ФИО (byNormKey, byNormRawName) и по фамилии (bySurname).</p>
                                    <p>2. Для сотрудника из плана ищем запись СКУД: сначала точное совпадение нормализованного имени, иначе — по фамилии и matchNames(имя из плана, rawName из СКУД).</p>
                                    <p>3. Статус: если найдена запись и есть cleanTime — «Выход», иначе при найденной записи — «Невыход», если запись не найдена — «—».</p>
                                    <p>4. Переработки: по entryTime/exitTime (или nextDayExit для ночной) считается длительность смены; если больше 12 ч — разница считается переработкой.</p>
                                    <p className="text-amber-700 font-medium mt-2">Если данные не подтягиваются — проверьте, что на вкладке «Верификация» загружен файл СКУД и factDates/factData заполняются в состоянии приложения.</p>
                                </div>
                            </div>
                        </div>
                    </div>
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
                {reportType === 'employeeAnalysis' && factData && employeeAnalysisWorkerStatus.status === 'calculating' && (
                    <div className="m-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 text-indigo-700 text-sm">
                        <Clock size={18} className="animate-pulse" />
                        <span>Идёт расчёт с учётом СКУД…</span>
                    </div>
                )}
                {reportType === 'employeeAnalysis' && factData && employeeAnalysisWorkerStatus.status === 'error' && (
                    <div className="m-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-sm">
                        <AlertCircle size={18} />
                        <span>Ошибка расчёта СКУД: {employeeAnalysisWorkerStatus.error}</span>
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
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        {!showFallback && hasPlansForDiff && (
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
                                        onClick={() => setShowDiagnosticsModal(true)}
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
                        )}
                        <div className="p-5 space-y-4">
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
                                                            <div key={`${line.displayName}-${dateNode.date}-${shift.shiftId}`}                                                                     className="border border-slate-100 rounded-lg overflow-hidden shadow-sm bg-white">
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
                        {reportType === 'employeeAnalysis' && employeeDisplayList.map(worker => {
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
                        {reportType === 'employeeAnalysis' && searchFilteredEmployeeHierarchy.length > employeeDisplayLimit && (
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
                    </div>
                )}
            </div>
        </div>
    );
}

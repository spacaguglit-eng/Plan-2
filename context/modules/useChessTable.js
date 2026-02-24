import { useEffect, useMemo, useRef, useCallback } from 'react';
import { normalizeName, checkWorkerAvailability, matchNames } from '../../utils';

/**
 * Хук для расчета табеля (chess table)
 */
export const useChessTable = ({
    // State
    viewMode,
    rawTables,
    scheduleDates,
    lineTemplates,
    floaters,
    workerRegistry,
    factData,
    manualAssignments,
    manualLines,
    autoReassignEnabled,
    assignmentClones,
    shiftsByDate,
    getShiftsForDate,
    cloneCountsByName,
    // Worker state
    USE_CHESS_WORKER,
    chessTableWorkerResult,
    chessTableWorkerStatus,
    setChessTableWorkerResult,
    setChessTableWorkerStatus
}) => {
    const chessTableWorkerRef = useRef(null);
    const chessTableWorkerReqIdRef = useRef(0);

    // Инициализация Web Worker
    useEffect(() => {
        if (!USE_CHESS_WORKER) return;
        if (chessTableWorkerRef.current) return;

        const worker = new Worker(new URL('../../chessTable.worker.js', import.meta.url), { type: 'module' });
        chessTableWorkerRef.current = worker;

        worker.onmessage = (e) => {
            const { requestId, result, error } = e.data || {};
            if (!requestId || requestId !== chessTableWorkerReqIdRef.current) return;

            if (error) {
                setChessTableWorkerStatus({ status: 'error', error: String(error), requestId });
                return;
            }

            const workers = (result?.workers || []).map(w => ({
                ...w,
                homeBrigades: new Set(w.homeBrigades || [])
            }));

            setChessTableWorkerResult(result ? { ...result, workers } : null);
            setChessTableWorkerStatus({ status: 'ready', error: null, requestId });
        };

        worker.onerror = (err) => {
            setChessTableWorkerStatus((prev) => ({ ...prev, status: 'error', error: err?.message || 'Worker error' }));
        };

        return () => {
            try { worker.terminate(); } catch (_) {}
            chessTableWorkerRef.current = null;
        };
    }, [USE_CHESS_WORKER, setChessTableWorkerResult, setChessTableWorkerStatus]);

    // Отправка данных в Worker
    useEffect(() => {
        if (!USE_CHESS_WORKER) return;
        if (viewMode !== 'chess') return;
        const worker = chessTableWorkerRef.current;
        if (!worker) return;
        if (!rawTables?.demand || !Array.isArray(scheduleDates) || scheduleDates.length === 0) return;

        const requestId = ++chessTableWorkerReqIdRef.current;
        setChessTableWorkerStatus({ status: 'calculating', error: null, requestId });

        // Structured-clone friendly payload (no Set/Map)
        const workerRegistryForWorker = {};
        Object.entries(workerRegistry || {}).forEach(([key, value]) => {
            workerRegistryForWorker[key] = {
                ...value,
                competencies: Array.from(value?.competencies || [])
            };
        });

        worker.postMessage({
            requestId,
            payload: {
                scheduleDates,
                demand: rawTables.demand,
                lineTemplates,
                floaters,
                manualAssignments,
                workerRegistry: workerRegistryForWorker,
                factData,
                manualLines,
                autoReassignEnabled,
                assignmentClones
            }
        });
    }, [USE_CHESS_WORKER, viewMode, rawTables, scheduleDates, lineTemplates, floaters, manualAssignments, workerRegistry, factData, manualLines, autoReassignEnabled, assignmentClones, setChessTableWorkerStatus]);

    // Базовая логика расчета табеля (когда Worker не используется)
    const chessTableBase = useMemo(() => {
        // Avoid spending CPU when user isn't on the timesheet view.
        if (viewMode !== 'chess') return null;
        if (USE_CHESS_WORKER) return null;
        if (!rawTables?.demand || !rawTables?.roster) return null;

        const sortedDates = Array.isArray(scheduleDates) ? scheduleDates : [];
        if (sortedDates.length === 0) return null;

        const getSurnameNorm = (fullName) => {
            const first = String(fullName || '').trim().split(/\s+/)[0] || '';
            return normalizeName(first);
        };

        const availabilityCache = new Map();
        const getAvailabilityCached = (name, dateStr) => {
            const k = `${name}|${dateStr}`;
            if (availabilityCache.has(k)) return availabilityCache.get(k);
            const v = checkWorkerAvailability(name, dateStr, workerRegistry);
            availabilityCache.set(k, v);
            return v;
        };

        // --- Build workers list (plan + floaters) ---
        const workerMeta = new Map();
        Object.keys(lineTemplates).forEach(lineKey => {
            lineTemplates[lineKey].forEach(pos => {
                const roster = pos?.roster || {};
                Object.entries(roster).forEach(([bId, val]) => {
                    if (!val) return;
                    String(val).split(/[,;\n/]+/).map(n => n.trim()).filter(n => n.length > 1).forEach(name => {
                        if (!workerMeta.has(name)) {
                            workerMeta.set(name, { name, role: pos.role, homeLine: lineKey, homeBrigades: new Set(), category: 'staff', sortShift: 99 });
                        }
                        const w = workerMeta.get(name);
                        w.homeBrigades.add(bId);
                        w.sortShift = Math.min(w.sortShift, parseInt(bId) || 99);
                    });
                });
            });
        });

        floaters.day.forEach(f => {
            if (!f?.name) return;
            if (!workerMeta.has(f.name)) workerMeta.set(f.name, { name: f.name, role: 'Подсобник', homeLine: 'Резерв Д', homeBrigades: new Set(), category: 'floater_day', sortShift: 100 });
        });
        floaters.night.forEach(f => {
            if (!f?.name) return;
            if (!workerMeta.has(f.name)) workerMeta.set(f.name, { name: f.name, role: 'Подсобник', homeLine: 'Резерв Н', homeBrigades: new Set(), category: 'floater_night', sortShift: 101 });
        });

        const workerRows = Array.from(workerMeta.values()).sort((a, b) => (a.category === 'staff' ? a.sortShift - b.sortShift : 10) || a.name.localeCompare(b.name));

        const workerLookupByNorm = new Map();
        const workersBySurname = new Map();
        workerRows.forEach(w => {
            const norm = normalizeName(w.name);
            workerLookupByNorm.set(norm, w);
            const surname = getSurnameNorm(w.name);
            if (!workersBySurname.has(surname)) workersBySurname.set(surname, []);
            workersBySurname.get(surname).push(w);
        });

        const workerRegistryLookupByNorm = new Map();
        const workerRegistryBySurname = new Map();
        Object.values(workerRegistry).forEach(w => {
            if (!w?.name) return;
            const norm = normalizeName(w.name);
            workerRegistryLookupByNorm.set(norm, w);
            const surname = getSurnameNorm(w.name);
            if (!workerRegistryBySurname.has(surname)) workerRegistryBySurname.set(surname, []);
            workerRegistryBySurname.get(surname).push(w);
        });

        // --- Facts index (by date) ---
        const factLookupByDate = new Map();
        const factBySurnameByDate = new Map();
        if (factData) {
            Object.entries(factData).forEach(([date, dateData]) => {
                const dateMap = new Map();
                const surnameMap = new Map();
                Object.values(dateData || {}).forEach((factEntry) => {
                    if (!factEntry) return;
                    const rawName = factEntry.rawName || '';
                    const norm = normalizeName(rawName);
                    if (norm) dateMap.set(norm, factEntry);
                    const surname = getSurnameNorm(rawName);
                    if (!surnameMap.has(surname)) surnameMap.set(surname, []);
                    surnameMap.get(surname).push(factEntry);
                });
                factLookupByDate.set(date, dateMap);
                factBySurnameByDate.set(date, surnameMap);
            });
        }

        const resolveFactEntry = (dateStr, workerName) => {
            const dateMap = factLookupByDate.get(dateStr);
            if (!dateMap) return null;
            const normName = normalizeName(workerName);
            const exact = dateMap.get(normName);
            if (exact) return exact;
            const surname = getSurnameNorm(workerName);
            const surnameMap = factBySurnameByDate.get(dateStr);
            const candidates = surnameMap?.get(surname) || [];
            for (const candidate of candidates) {
                if (candidate?.rawName && matchNames(workerName, candidate.rawName)) return candidate;
            }
            return null;
        };

        // --- Add unexpected workers (present in facts but not in plan) ---
        if (factData) {
            const unexpectedWorkersMap = new Map();
            sortedDates.forEach(date => {
                const surnameMap = factBySurnameByDate.get(date);
                if (!surnameMap) return;
                surnameMap.forEach((entries) => {
                    entries.forEach((factEntry) => {
                        if (!factEntry?.rawName) return;
                        if (!factEntry.cleanTime) return;

                        const factNormName = normalizeName(factEntry.rawName);
                        if (workerLookupByNorm.has(factNormName)) return;

                        const surname = getSurnameNorm(factEntry.rawName);
                        const candidates = workersBySurname.get(surname) || [];
                        let foundInPlan = false;
                        for (const worker of candidates) {
                            if (matchNames(worker.name, factEntry.rawName)) { foundInPlan = true; break; }
                        }
                        if (foundInPlan) return;

                        if (!unexpectedWorkersMap.has(factNormName)) {
                            let regEntry = workerRegistryLookupByNorm.get(factNormName);
                            if (!regEntry) {
                                const regCandidates = workerRegistryBySurname.get(surname) || [];
                                for (const w of regCandidates) {
                                    if (matchNames(w.name, factEntry.rawName)) { regEntry = w; break; }
                                }
                            }
                            unexpectedWorkersMap.set(factNormName, {
                                name: factEntry.rawName,
                                role: regEntry ? regEntry.role : 'Неизвестно',
                                homeLine: 'Вне плана',
                                homeBrigades: new Set(),
                                category: 'unexpected',
                                sortShift: 102,
                                cells: {}
                            });
                        }
                    });
                });
            });

            if (unexpectedWorkersMap.size > 0) {
                unexpectedWorkersMap.forEach(worker => workerRows.push(worker));
                workerRows.sort((a, b) => (a.category === 'staff' ? a.sortShift - b.sortShift : 10) || a.name.localeCompare(b.name));
            }
        }

        workerRows.forEach(worker => { worker.cells = {}; });

        // --- Fill cells ---
        sortedDates.forEach(date => {
            const shiftsOnDate = shiftsByDate.get(date) || getShiftsForDate(date);
            const workingWorkers = new Map();
            const idleWorkers = new Map();

            shiftsOnDate.forEach(shift => {
                const isNight = shift.type.toLowerCase().includes('ночь');
                const shiftCode = isNight ? 'Н' : 'Д';
                shift.lineTasks.forEach(task => {
                    task.slots.forEach(slot => {
                        if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                            const wName = slot.assigned.name;
                            if (slot.assigned.type === 'external') {
                                workingWorkers.set(wName, { code: 'РВ', brigadeId: shift.id, isRv: true });
                            } else {
                                const current = workingWorkers.get(wName);
                                const code = current && current.code !== shiftCode && !current.isRv ? 'Д/Н' : shiftCode;
                                workingWorkers.set(wName, { code, brigadeId: shift.id });
                            }
                        }
                    });
                });
                shift.unassignedPeople.forEach(p => { if (p.isAvailable) idleWorkers.set(p.name, shift.id); });
                shift.floaters.forEach(f => idleWorkers.set(f.name, shift.id));
            });

            workerRows.forEach(worker => {
                let text = '';
                let color = 'bg-white';
                let brigadeId = null;
                let verificationStatus = null;

                const avail = getAvailabilityCached(worker.name, date);
                if (!avail.available) {
                    if (avail.type === 'vacation') { text = 'О'; color = 'bg-emerald-50 text-emerald-700'; }
                    else if (avail.type === 'sick') { text = 'Б'; color = 'bg-amber-50 text-amber-700'; }
                    else if (avail.type === 'fired') { text = 'У'; color = 'bg-slate-200 text-slate-500'; }
                } else if (workingWorkers.has(worker.name)) {
                    const workData = workingWorkers.get(worker.name);
                    text = workData.code;
                    brigadeId = workData.brigadeId;
                    if (text === 'Д') color = 'bg-green-100 text-green-800 font-bold';
                    else if (text === 'Н') color = 'bg-blue-100 text-blue-800 font-bold';
                    else if (text === 'Д/Н') color = 'bg-teal-100 text-teal-800 font-bold';
                    else if (text === 'РВ') color = 'bg-orange-100 text-orange-700 font-bold';

                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry) {
                        if (factEntry.cleanTime) {
                            verificationStatus = 'ok';
                        } else {
                            verificationStatus = 'missing';
                        }
                    }
                } else if (idleWorkers.has(worker.name)) {
                    text = '—';
                    color = 'bg-yellow-100 text-yellow-800 font-bold';
                    brigadeId = idleWorkers.get(worker.name);

                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry) {
                        if (factEntry.cleanTime) {
                            verificationStatus = 'unassigned';
                        } else {
                            verificationStatus = 'missing';
                        }
                    }
                } else {
                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry && factEntry.cleanTime) {
                        verificationStatus = 'unexpected';
                        text = '!';
                        color = 'bg-orange-50 text-orange-700 font-bold';
                    }
                }

                worker.cells[date] = { text, color, brigadeId, verificationStatus };
            });
        });

        return { dates: sortedDates, workers: workerRows, cloneCountsByName };
    }, [viewMode, rawTables, scheduleDates, lineTemplates, floaters.day, floaters.night, workerRegistry, factData, shiftsByDate, getShiftsForDate, cloneCountsByName]);

    /**
     * Рассчитывает табель
     */
    const calculateChessTable = useCallback(() => {
        if (USE_CHESS_WORKER) return chessTableWorkerResult;
        return chessTableBase;
    }, [USE_CHESS_WORKER, chessTableWorkerResult, chessTableBase]);

    return {
        calculateChessTable,
        chessTableBase,
        chessTableWorkerStatus
    };
};


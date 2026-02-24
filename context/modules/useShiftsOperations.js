import { useCallback, useMemo } from 'react';
import {
    cleanVal,
    extractShiftNumber,
    normalizeExcelDate,
    formatDateLocal,
    normalizeName,
    isLineMatch,
    checkWorkerAvailability
} from '../../utils';
import { normalizePlanData, createManualSlotId } from './planUtils';

/**
 * Строит слоты плана из данных плана
 */
export const buildPlanSlots = (planData) => {
    const normalized = normalizePlanData(planData || {});
    const demandData = normalized.rawTables?.demand;
    const templates = normalized.lineTemplates || {};
    const assignments = normalized.manualAssignments || {};
    const manualLines = normalized.manualLines || {};
    const workerRegistry = normalized.workerRegistry || {};
    const autoReassignEnabled = normalized.autoReassignEnabled ?? true;

    if (!Array.isArray(demandData) || demandData.length === 0) {
        return { slots: [], slotMap: new Map() };
    }

    const headers = Array.isArray(demandData[0]) ? demandData[0] : [];
    const slots = [];
    const availabilityCache = new Map();

    const getAvailability = (name, dateStr) => {
        const k = `${name}|${dateStr}`;
        if (availabilityCache.has(k)) return availabilityCache.get(k);
        const v = checkWorkerAvailability(name, dateStr, workerRegistry);
        availabilityCache.set(k, v);
        return v;
    };

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

        const isNight = shiftRaw.toLowerCase().includes('ночь');

        // 1. Collect Active Lines
        const activeLines = [];
        for (let i = 15; i <= 26; i++) {
            if ((parseInt(rowAt(row, i), 10) || 0) > 0) {
                const headerName = cleanVal(rowAt(headers, i));
                if (headerName) activeLines.push(headerName);
            }
        }

        // 2. Collect all potential workers (roster)
        const allShiftWorkers = [];
        
        Object.keys(templates).forEach(lKey => {
            templates[lKey].forEach(pos => {
                const names = getRosterNames(pos, shiftNum);
                names.forEach(name => {
                    const regEntry = workerRegistry[name];
                    const isFiveDay = regEntry?.fiveDay === true;
                    if (isNight && isFiveDay) return;

                    const avail = getAvailability(name, dateStr);
                    const worker = {
                        name,
                        role: pos.role,
                        homeLine: lKey,
                        isBusy: false,
                        isAvailable: avail.available,
                        statusReason: avail.reason
                    };
                    allShiftWorkers.push(worker);
                });
            });
        });

        // Один человек на смену — одна запись в пуле (иначе при «Линия 1-2» дубли попадают на обе линии)
        const seenNames = new Set();
        const uniqueShiftWorkers = [];
        allShiftWorkers.forEach(w => {
            const n = normalizeName(w.name);
            if (seenNames.has(n)) return;
            seenNames.add(n);
            uniqueShiftWorkers.push(w);
        });
        allShiftWorkers.length = 0;
        allShiftWorkers.push(...uniqueShiftWorkers);

        // 3. Process assignments
        const lineTasks = [];
        // Один человек — одна линия в смене: если уже назначен на другую линию, слот делаем вакансией
        const assignedNamesInShift = new Set();

        activeLines.forEach(activeLineName => {
            const templateName = Object.keys(templates).find(t => isLineMatch(activeLineName, t));
            const positions = templateName ? templates[templateName] : [];

            positions.forEach(pos => {
                const names = getRosterNames(pos, shiftNum);
                const count = Math.max(parseInt(pos.count) || 1, names.length);

                for (let i = 0; i < count; i++) {
                    const slotId = `${dateStr}_${shiftNum}_${activeLineName}_${pos.role}_${i}`;
                    let currentWorkerName = names[i] || null;
                    let status = 'vacancy';

                    if (currentWorkerName) {
                        const norm = normalizeName(currentWorkerName);
                        if (assignedNamesInShift.has(norm)) {
                            currentWorkerName = null;
                        } else {
                            const wAvail = getAvailability(currentWorkerName, dateStr);
                            const regEntry = workerRegistry[currentWorkerName];
                            const isFiveDay = regEntry?.fiveDay === true;
                            if (isNight && isFiveDay) status = 'vacancy';
                            else status = wAvail.available ? 'filled' : 'vacancy';
                        }
                    }

                    const manual = assignments[slotId];
                    if (manual) {
                        if (manual.type === 'vacancy') status = 'vacancy';
                        else if (manual.type === 'outsourced') status = 'outsourced';
                        else status = 'manual';
                    }

                    if (status === 'filled' && currentWorkerName) {
                         const wAvail = getAvailability(currentWorkerName, dateStr);
                         const regEntry = workerRegistry[currentWorkerName];
                         const isFiveDay = regEntry?.fiveDay === true;
                         if (!wAvail.available || (isNight && isFiveDay)) status = 'vacancy';
                         else assignedNamesInShift.add(normalizeName(currentWorkerName));
                    }

                    const assigned = (status === 'filled' && currentWorkerName) ? { name: currentWorkerName } : null;

                    lineTasks.push({
                        slotId,
                        status,
                        roleTitle: pos.role,
                        currentWorkerName,
                        assigned: manual || assigned,
                        lineName: templateName || activeLineName,
                        index: i,
                        isManualVacancy: manual?.type === 'vacancy'
                    });
                }
            });
        });

        // Manual Lines
        const manualLineDefs = manualLines[`${dateStr}_${shiftNum}`] || [];
        manualLineDefs.forEach(manualLine => {
            (manualLine.positions || []).forEach(pos => {
                const count = Math.max(1, parseInt(pos.count, 10) || 1);
                for (let i = 0; i < count; i++) {
                    const slotId = createManualSlotId(dateStr, shiftNum, manualLine.id, pos.roleTitle, i);
                    const manual = assignments[slotId];
                    let status = 'vacancy';
                    if (manual) {
                         if (manual.type === 'vacancy') status = 'vacancy';
                         else if (manual.type === 'outsourced') status = 'outsourced';
                         else status = 'manual';
                    }
                    lineTasks.push({
                        slotId,
                        status,
                        roleTitle: pos.roleTitle,
                        currentWorkerName: null,
                        assigned: manual || null,
                        lineName: manualLine.displayName || manualLine.id,
                        index: i,
                        isManualVacancy: manual?.type === 'vacancy'
                    });
                }
            });
        });

        // Mark busy
        const busyNames = new Set();
        lineTasks.forEach(task => {
            if (task.status !== 'vacancy' && task.assigned?.name) {
                busyNames.add(normalizeName(task.assigned.name));
            }
        });

        // Auto-reassignment
        if (autoReassignEnabled) {
            const freeAgents = allShiftWorkers.filter(w => !w.isBusy && !busyNames.has(normalizeName(w.name)) && w.isAvailable);
            
            lineTasks.forEach(task => {
                if (task.status === 'vacancy' && !task.isManualVacancy && freeAgents.length > 0) {
                    let idx = freeAgents.findIndex(a => a.role === task.roleTitle);
                    if (idx === -1) {
                        idx = freeAgents.findIndex(a => {
                            const regEntry = workerRegistry[a.name];
                            return regEntry && regEntry.competencies?.has && regEntry.competencies.has(task.roleTitle);
                        });
                    }
                    if (idx >= 0) {
                        task.status = 'reassigned';
                        task.assigned = freeAgents[idx];
                        task.assignmentType = 'auto';
                        freeAgents.splice(idx, 1);
                    }
                }
            });
        }

        // Convert to output slots
        lineTasks.forEach(task => {
            let source = 'vacancy';
            let assignmentType = task.assignmentType || null;
            let assignedName = null;

            if (task.status === 'filled') {
                source = 'roster';
                assignedName = task.assigned?.name;
            } else if (task.status === 'manual') {
                source = 'manual';
                assignedName = task.assigned?.name;
                assignmentType = task.assigned?.type;
            } else if (task.status === 'reassigned') {
                source = 'auto';
                assignedName = task.assigned?.name;
            } else if (task.status === 'outsourced') {
                source = 'outsourced';
                assignedName = task.assigned?.name;
            } else if (task.isManualVacancy) {
                source = 'manualVacancy';
            }

            slots.push({
                slotId: task.slotId,
                date: dateStr,
                shiftId: String(shiftNum),
                lineName: task.lineName,
                role: task.roleTitle,
                index: task.index,
                assignedName,
                assignedNorm: assignedName ? normalizeName(assignedName) : '',
                assignmentType,
                source
            });
        });
    });

    return { slots, slotMap: new Map(slots.map(s => [s.slotId, s])) };
};

/**
 * Хук для работы со сменами
 * Принимает все необходимые зависимости из DataContext
 */
export const useShiftsOperations = ({
    // State
    rawTables,
    scheduleDates,
    lineTemplates,
    floaters,
    workerRegistry,
    manualAssignments,
    manualLines,
    assignmentClones,
    // Computed
    demandIndex,
    // Utils
    createManualSlotId,
    // Callbacks
    updateAssignments
}) => {
    /**
     * Строит смены из карты бригад для конкретной даты
     */
    const buildShiftsFromBrigadesMap = useCallback((targetDate, brigadesMap, availabilityCache) => {
        if (!brigadesMap) return [];

        const getAvailabilityCached = (name) => {
            const k = `${name}|${targetDate}`;
            if (availabilityCache.has(k)) return availabilityCache.get(k);
            const v = checkWorkerAvailability(name, targetDate, workerRegistry);
            availabilityCache.set(k, v);
            return v;
        };

        const clonesForDate = assignmentClones[targetDate] || {};

        return Object.values(brigadesMap).map(brigade => {
            const shiftTypeLower = brigade.type ? brigade.type.toLowerCase() : '';
            const lineTasks = [];

            const allShiftWorkers = [];

            Object.keys(lineTemplates).forEach(lKey => {
                lineTemplates[lKey].forEach(pos => {
                    const rawNames = pos.roster && pos.roster[brigade.id];
                    if (!rawNames) return;
                    rawNames
                        .split(/[,;\n/]+/)
                        .map(s => s.trim())
                        .filter(s => s.length > 1)
                        .forEach(name => {
                            const regEntry = workerRegistry[name];
                            const isFiveDay = regEntry?.fiveDay === true;
                            if (shiftTypeLower.includes('ночь') && isFiveDay) return;
                            const avail = getAvailabilityCached(name);
                            const worker = {
                                name,
                                role: pos.role,
                                homeLine: lKey,
                                id: `${name}_${brigade.id}`,
                                isBusy: false,
                                isAvailable: avail.available,
                                statusReason: avail.reason
                            };
                            allShiftWorkers.push(worker);
                        });
                });
            });

            const seenNames = new Set();
            const uniqueShiftWorkers = [];
            allShiftWorkers.forEach(w => {
                const n = normalizeName(w.name);
                if (seenNames.has(n)) return;
                seenNames.add(n);
                uniqueShiftWorkers.push(w);
            });
            allShiftWorkers.length = 0;
            allShiftWorkers.push(...uniqueShiftWorkers);

            const usedFloaterIds = new Set();
            Object.keys(manualAssignments).forEach(key => {
                if (key.startsWith(targetDate)) {
                    const w = manualAssignments[key];
                    if (w?.type !== 'vacancy') usedFloaterIds.add(w.originalId || w.id);
                }
            });

            const assignedNamesInShift = new Set();
            brigade.activeLines.forEach(activeLineName => {
                const templateName = Object.keys(lineTemplates).find(t => isLineMatch(activeLineName, t));
                const positions = templateName ? lineTemplates[templateName] : [];
                const tasksForLine = [];

                if (positions.length > 0) {
                    positions.forEach((pos) => {
                        const assignedNamesStr = pos.roster && pos.roster[brigade.id];
                        const assignedNamesList = assignedNamesStr
                            ? assignedNamesStr.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1)
                            : [];
                        const totalSlots = Math.max(pos.count, assignedNamesList.length);

                        for (let i = 0; i < totalSlots; i++) {
                            const slotId = `${targetDate}_${brigade.id}_${activeLineName}_${pos.role}_${i}`;
                            let currentWorkerName = assignedNamesList[i] || null;
                            let status = 'vacancy';

                            if (currentWorkerName) {
                                const norm = normalizeName(currentWorkerName);
                                if (assignedNamesInShift.has(norm)) {
                                    currentWorkerName = null;
                                } else {
                                    const wAvail = getAvailabilityCached(currentWorkerName);
                                    const isFiveDay = workerRegistry[currentWorkerName]?.fiveDay === true;
                                    if (shiftTypeLower.includes('ночь') && isFiveDay) status = 'vacancy';
                                    else status = wAvail.available ? 'filled' : 'vacancy';
                                }
                            }

                            const manual = manualAssignments[slotId];
                            if (manual) {
                                if (manual.type === 'vacancy') status = 'vacancy';
                                else if (manual.type === 'outsourced') status = 'outsourced';
                                else status = 'manual';
                            }

                            if (status === 'filled' && currentWorkerName) {
                                const wAvail = getAvailabilityCached(currentWorkerName);
                                const isFiveDay = workerRegistry[currentWorkerName]?.fiveDay === true;
                                if (!wAvail.available || (shiftTypeLower.includes('ночь') && isFiveDay)) status = 'vacancy';
                                else assignedNamesInShift.add(normalizeName(currentWorkerName));
                            }

                            const assigned = (status === 'filled' && currentWorkerName) ? { name: currentWorkerName } : null;
                            tasksForLine.push({
                                status,
                                roleTitle: pos.role,
                                slotId,
                                isManualVacancy: manualAssignments[slotId]?.type === 'vacancy',
                                currentWorkerName,
                                assigned: manual || assigned
                            });

                            // Mark worker as busy
                            if (manual && manual.type !== 'vacancy' && manual.type !== 'floater' && manual.name) {
                                const norm = normalizeName(manual.name);
                                allShiftWorkers.forEach(w => { if (normalizeName(w.name) === norm) w.isBusy = true; });
                            } else if (!manual && status === 'filled' && currentWorkerName) {
                                const norm = normalizeName(currentWorkerName);
                                allShiftWorkers.forEach(w => { if (normalizeName(w.name) === norm) w.isBusy = true; });
                            }
                        }
                    });
                }

                lineTasks.push({
                    slots: tasksForLine,
                    displayName: templateName || activeLineName,
                    lineSource: 'roster',
                    templateName: templateName || null,
                    activeLineName: activeLineName || null
                });
            });

            const manualLineKey = `${targetDate}_${brigade.id}`;
            const manualLineDefs = manualLines[manualLineKey] || [];
            manualLineDefs.forEach(manualLine => {
                const tasksForLine = [];
                manualLine.positions.forEach(pos => {
                    const slotCount = Math.max(1, parseInt(pos.count, 10) || 1);
                    for (let slotIdx = 0; slotIdx < slotCount; slotIdx++) {
                        const slotId = createManualSlotId(targetDate, brigade.id, manualLine.id, pos.roleTitle, slotIdx);
                        const manual = manualAssignments[slotId];
                        let status = 'vacancy';
                        if (manual) {
                            if (manual.type === 'vacancy') status = 'vacancy';
                            else if (manual.type === 'outsourced') status = 'outsourced';
                            else status = 'manual';
                        }
                        tasksForLine.push({
                            status,
                            roleTitle: pos.roleTitle || 'Роль',
                            slotId,
                            isManualVacancy: manual?.type === 'vacancy',
                            currentWorkerName: null,
                            assigned: manual || null
                        });
                    }
                });
                lineTasks.push({
                    slots: tasksForLine,
                    displayName: manualLine.displayName,
                    manualLineId: manualLine.id,
                    isManualLine: true,
                    lineSource: 'manual',
                    templateName: manualLine.templateName || null
                });
            });

            // Назначенные на ручных линиях тоже убираем из свободных
            lineTasks.forEach(lt => {
                lt.slots.forEach(slot => {
                    const name = slot.assigned?.name;
                    if (name && slot.assigned?.type !== 'outsourced') {
                        const norm = normalizeName(name);
                        allShiftWorkers.forEach(w => { if (normalizeName(w.name) === norm) w.isBusy = true; });
                    }
                });
            });

            const baseFloaters = shiftTypeLower.includes('день')
                ? [...floaters.day]
                : floaters.night.filter(f => workerRegistry[f.name]?.fiveDay !== true);
            const freeFloaters = baseFloaters.filter(f => !usedFloaterIds.has(f.id));
            const totalRequired = lineTasks.reduce((sum, lt) => sum + lt.slots.length, 0);
            const filledSlots = lineTasks.reduce((sum, lt) => sum + lt.slots.filter(s => s.status !== 'vacancy' && s.status !== 'unknown').length, 0);

            const shiftClones = clonesForDate[brigade.id] || [];
            const availableClones = shiftClones.filter(clone => clone.status === 'available');
            const cloneEntries = availableClones.map(clone => ({
                ...clone,
                cloneId: clone.id,
                isClone: true,
                isAvailable: true,
                statusReason: clone.statusReason || 'Совмещение',
                role: clone.role || '',
                name: clone.name || '',
                homeLine: clone.homeLine || ''
            }));
            const unassignedPeople = [
                ...cloneEntries,
                ...allShiftWorkers.filter(w => !w.isBusy)
            ];

            return {
                id: brigade.id,
                name: brigade.name,
                type: brigade.type,
                lineTasks,
                unassignedPeople,
                floaters: freeFloaters,
                totalRequired,
                filledSlots
            };
        });
    }, [floaters.day, floaters.night, lineTemplates, manualAssignments, manualLines, workerRegistry, assignmentClones, createManualSlotId]);

    /**
     * Кэш смен по датам
     */
    const shiftsByDate = useMemo(() => {
        const map = new Map();
        if (!scheduleDates || scheduleDates.length === 0) return map;
        const availabilityCache = new Map();
        scheduleDates.forEach(dateStr => {
            const brigadesMap = demandIndex.brigadesByDate.get(dateStr);
            map.set(dateStr, buildShiftsFromBrigadesMap(dateStr, brigadesMap, availabilityCache));
        });
        return map;
    }, [scheduleDates, demandIndex, buildShiftsFromBrigadesMap]);

    /**
     * Получает смены для конкретной даты (обновленная версия с поддержкой shiftsByDate)
     */
    const getShiftsForDateWithCache = useCallback((targetDate) => {
        if (!targetDate) return [];
        if (shiftsByDate.has(targetDate)) return shiftsByDate.get(targetDate) || [];
        const availabilityCache = new Map();
        const brigadesMap = demandIndex.brigadesByDate.get(targetDate);
        return buildShiftsFromBrigadesMap(targetDate, brigadesMap, availabilityCache);
    }, [buildShiftsFromBrigadesMap, demandIndex, shiftsByDate]);

    /**
     * Применяет автоназначение для конкретной даты
     */
    const applyAutoReassignForDate = useCallback((dateStr, getShiftsForDateFn, manualAssignments, updateAssignments, workerRegistry) => {
        if (!dateStr) return;
        const shifts = getShiftsForDateFn(dateStr);
        const toApply = {};
        const hasCompetency = (person, roleTitle) => {
            const comps = workerRegistry[person?.name]?.competencies;
            if (!comps || !roleTitle) return false;
            return (comps instanceof Set && comps.has(roleTitle)) || (Array.isArray(comps) && comps.includes(roleTitle));
        };
        shifts.forEach(shift => {
            const available = (shift.unassignedPeople || []).filter(p => p.isAvailable);
            const used = new Set();
            (shift.lineTasks || []).forEach(lt => {
                (lt.slots || []).forEach(slot => {
                    if (slot.status !== 'vacancy' || slot.isManualVacancy) return;
                    let idx = available.findIndex(a => !used.has(a.id) && a.role === slot.roleTitle);
                    if (idx === -1) {
                        idx = available.findIndex(a => !used.has(a.id) && hasCompetency(a, slot.roleTitle));
                    }
                    if (idx >= 0) {
                        const person = available[idx];
                        used.add(person.id);
                        toApply[slot.slotId] = {
                            ...person,
                            originalId: person.id,
                            id: `assigned_${slot.slotId}_${Date.now()}`
                        };
                    }
                });
            });
        });
        if (Object.keys(toApply).length > 0) {
            updateAssignments({ ...manualAssignments, ...toApply });
        }
    }, []);

    /**
     * Рассчитывает статистику по дням
     */
    const calculateDailyStats = useMemo(() => {
        const stats = {};
        if (!rawTables?.demand || scheduleDates.length === 0) return stats;
        scheduleDates.forEach(date => {
            let totalSlots = 0;
            let filledBySystem = 0;
            let freeStaff = 0;
            let activeFloaters = 0;
            let manualEdits = 0;
            const shifts = getShiftsForDateWithCache(date);
            shifts.forEach(shift => {
                totalSlots += shift.totalRequired;
                filledBySystem += shift.filledSlots;
                freeStaff += shift.unassignedPeople.filter(p => p.isAvailable).length;
                activeFloaters += shift.floaters.length;
            });
            Object.keys(manualAssignments).forEach(k => { if (k.startsWith(date)) manualEdits++; });
            const vacancies = totalSlots - filledBySystem;
            let status = 'complete';
            if (vacancies > 0) status = (freeStaff + activeFloaters) >= vacancies ? 'warning' : 'critical';
            stats[date] = { totalSlots, filledSlots: filledBySystem, vacancies, freeStaff, floatersAvailable: activeFloaters, manualEdits, status };
        });
        return stats;
    }, [rawTables, manualAssignments, scheduleDates, getShiftsForDateWithCache]);

    /**
     * Глобальное расписание работы
     */
    const globalWorkSchedule = useMemo(() => {
        const schedule = {};
        if (scheduleDates.length === 0) return schedule;
        scheduleDates.forEach(date => {
            const shifts = getShiftsForDateWithCache(date);
            const workingMap = new Map();
            shifts.forEach(shift => {
                const shiftType = shift.type.toLowerCase().includes('ночь') ? 'Night' : 'Day';
                shift.lineTasks.forEach(t => t.slots.forEach(s => {
                    if ((s.status === 'filled' || s.status === 'manual' || s.status === 'reassigned') && s.assigned) {
                        workingMap.set(s.assigned.name, shiftType);
                    }
                }));
            });
            schedule[date] = workingMap;
        });
        return schedule;
    }, [scheduleDates, getShiftsForDateWithCache]);

    return {
        buildShiftsFromBrigadesMap,
        getShiftsForDate: getShiftsForDateWithCache,
        shiftsByDate,
        applyAutoReassignForDate,
        calculateDailyStats,
        globalWorkSchedule
    };
};


import { useMemo, useCallback } from 'react';
import {
    checkWorkerAvailability,
    normalizeName,
    extractShiftNumber,
    cleanVal,
    normalizeExcelDate,
    formatDateLocal,
    isLineMatch,
    expandCompositeLineKey
} from '../../utils';
import {
    createManualSlotId,
    normalizePlanData,
    normalizeManualRoleForId
} from '../dataContextUtils';

export function useShiftCalculations(state) {
    const {
        rawTables,
        scheduleDates,
        lineTemplates,
        floaters,
        workerRegistry,
        manualAssignments,
        manualLines,
        assignmentClones,
        autoReassignEnabled,
        updateAssignments,
        selectedDate
    } = state;

    // --- DEMAND INDEX (by date) ---
    const demandIndex = useMemo(() => {
        const res = { headers: [], brigadesByDate: new Map() };
        if (!rawTables?.demand) return res;
        const data = rawTables.demand;
        res.headers = Array.isArray(data[0]) ? data[0] : [];

        data.slice(1).forEach(row => {
            const normalizedDate = normalizeExcelDate(row[11]);
            if (!normalizedDate) return;
            const dateStr = formatDateLocal(normalizedDate);

            const shiftType = cleanVal(row[13]);
            const brigadeRaw = cleanVal(row[14]);
            const shiftNum = extractShiftNumber(brigadeRaw);
            if (!shiftNum) return;

            if (!res.brigadesByDate.has(dateStr)) res.brigadesByDate.set(dateStr, {});
            const brigadesMap = res.brigadesByDate.get(dateStr);

            if (!brigadesMap[shiftNum]) brigadesMap[shiftNum] = { id: shiftNum, name: brigadeRaw, type: shiftType, activeLines: [] };

            for (let i = 15; i <= 26; i++) {
                const lineHeader = cleanVal(res.headers[i]);
                if (lineHeader && (parseInt(row[i]) || 0) > 0 && !brigadesMap[shiftNum].activeLines.includes(lineHeader)) {
                    brigadesMap[shiftNum].activeLines.push(lineHeader);
                }
            }
        });

        return res;
    }, [rawTables]);

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
            const workersById = new Map();
            const workersByNameHomeLine = new Map();

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
                            workersById.set(worker.id, worker);
                            workersByNameHomeLine.set(`${normalizeName(name)}|${lKey}`, worker);
                        });
                });
            });

            const usedFloaterIds = new Set();
            Object.keys(manualAssignments).forEach(key => {
                if (key.startsWith(targetDate)) {
                    const w = manualAssignments[key];
                    if (w?.type !== 'vacancy') usedFloaterIds.add(w.originalId || w.id);
                }
            });

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
                            const currentWorkerName = assignedNamesList[i] || null;
                            let status = 'vacancy';

                            if (currentWorkerName) {
                                const wAvail = getAvailabilityCached(currentWorkerName);
                                const isFiveDay = workerRegistry[currentWorkerName]?.fiveDay === true;
                                if (shiftTypeLower.includes('ночь') && isFiveDay) status = 'vacancy';
                                else status = wAvail.available ? 'filled' : 'vacancy';
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

                            // Mark worker as busy without O(n) scan
                            if (manual && manual.type !== 'vacancy' && manual.type !== 'floater') {
                                const w = workersById.get(manual.originalId || manual.id);
                                if (w) w.isBusy = true;
                            } else if (!manual && status === 'filled' && currentWorkerName) {
                                const w = workersByNameHomeLine.get(`${normalizeName(currentWorkerName)}|${templateName || ''}`);
                                if (w) w.isBusy = true;
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

            const freeAgents = allShiftWorkers.filter(w => !w.isBusy && w.isAvailable);
            
            // Автоподстановка работает только если включена
            if (autoReassignEnabled) {
                lineTasks.forEach(lt => {
                    lt.slots.forEach(slot => {
                        if (slot.status === 'vacancy' && !slot.isManualVacancy && freeAgents.length > 0) {
                            let idx = freeAgents.findIndex(a => a.role === slot.roleTitle);
                            if (idx === -1) {
                                idx = freeAgents.findIndex(a => {
                                    const registryEntry = workerRegistry[a.name];
                                    return registryEntry && registryEntry.competencies?.has && registryEntry.competencies.has(slot.roleTitle);
                                });
                            }
                            if (idx >= 0) {
                                slot.status = 'reassigned';
                                slot.assigned = freeAgents[idx];
                                freeAgents[idx].isBusy = true;
                                freeAgents.splice(idx, 1);
                            }
                        }
                    });
                });
            }

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
            const seenIds = new Set(cloneEntries.map(c => c.id));
            const uniqueFreeWorkers = allShiftWorkers.filter(w => {
                if (w.isBusy) return false;
                if (seenIds.has(w.id)) return false;
                seenIds.add(w.id);
                return true;
            });
            const unassignedPeople = [...cloneEntries, ...uniqueFreeWorkers];

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
    }, [floaters.day, floaters.night, lineTemplates, manualAssignments, manualLines, workerRegistry, autoReassignEnabled, assignmentClones]);

    // --- SHIFTS CACHE (by date) ---
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

    const getShiftsForDate = useCallback((targetDate) => {
        if (!targetDate) return [];
        if (shiftsByDate.has(targetDate)) return shiftsByDate.get(targetDate) || [];
        // Fallback for dates outside scheduleDates
        const availabilityCache = new Map();
        const brigadesMap = demandIndex.brigadesByDate.get(targetDate);
        return buildShiftsFromBrigadesMap(targetDate, brigadesMap, availabilityCache);
    }, [buildShiftsFromBrigadesMap, demandIndex, shiftsByDate]);

    const calculateDailyStats = useMemo(() => {
        const stats = {};
        if (!rawTables['demand'] || scheduleDates.length === 0) return stats;
        scheduleDates.forEach(date => {
            let totalSlots = 0;
            let filledBySystem = 0;
            let freeStaff = 0;
            let activeFloaters = 0;
            let manualEdits = 0;
            const shifts = getShiftsForDate(date);
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
    }, [rawTables, manualAssignments, scheduleDates, getShiftsForDate]);

    const globalWorkSchedule = useMemo(() => {
        const schedule = {};
        if (scheduleDates.length === 0) return schedule;
        scheduleDates.forEach(date => {
            const shifts = getShiftsForDate(date);
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
    }, [scheduleDates, getShiftsForDate]);

    const handleAutoFillFloaters = useCallback((targetShift, isGlobal) => {
        let newAssignments = { ...manualAssignments };
        const datesToProcess = isGlobal ? scheduleDates : [selectedDate];
        datesToProcess.forEach(date => {
            const shifts = getShiftsForDate(date);
            const usedIdsForDate = new Set();
            Object.keys(newAssignments).filter(k => k.startsWith(date) && newAssignments[k].type !== 'vacancy').forEach(k => usedIdsForDate.add(newAssignments[k].originalId || newAssignments[k].id));
            shifts.forEach(shift => {
                if (!isGlobal && shift.id !== targetShift.id) return;
                const vacantSlots = [];
                shift.lineTasks.forEach(task => task.slots.forEach(slot => {
                    if (slot.status === 'vacancy' && !slot.isManualVacancy && slot.roleTitle.toLowerCase().includes('подсобник')) vacantSlots.push(slot.slotId);
                }));
                let count = 0;
                for (const floater of shift.floaters) {
                    if (count >= vacantSlots.length) break;
                    if (!usedIdsForDate.has(floater.id)) {
                        const slotId = vacantSlots[count];
                        if (!newAssignments[slotId]) {
                            newAssignments[slotId] = { ...floater, originalId: floater.id, id: `auto_${slotId}_${Date.now()}` };
                            usedIdsForDate.add(floater.id);
                            count++;
                        }
                    }
                }
            });
        });
        updateAssignments(newAssignments);
    }, [manualAssignments, scheduleDates, selectedDate, getShiftsForDate, updateAssignments]);

    const buildPlanSlots = useCallback((planData) => {
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

            // 3. Process assignments
            const lineTasks = [];

            activeLines.forEach(activeLineName => {
                const templateName = Object.keys(templates).find(t => isLineMatch(activeLineName, t));
                const positions = templateName ? templates[templateName] : [];

                positions.forEach(pos => {
                    const names = getRosterNames(pos, shiftNum);
                    const count = Math.max(parseInt(pos.count) || 1, names.length);

                    for (let i = 0; i < count; i++) {
                        const slotId = `${dateStr}_${shiftNum}_${activeLineName}_${pos.role}_${i}`;
                        const currentWorkerName = names[i] || null;
                        let status = 'vacancy';

                        if (currentWorkerName) {
                            const wAvail = getAvailability(currentWorkerName, dateStr);
                            const regEntry = workerRegistry[currentWorkerName];
                            const isFiveDay = regEntry?.fiveDay === true;
                            if (isNight && isFiveDay) status = 'vacancy';
                            else status = wAvail.available ? 'filled' : 'vacancy';
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
    }, []);

    const comparePlanSnapshots = useCallback((masterPlan, operationalPlan) => {
        const master = normalizePlanData(masterPlan || {});
        const operational = normalizePlanData(operationalPlan || {});

        const masterSlots = buildPlanSlots(master);
        const operationalSlots = buildPlanSlots(operational);

        const slotIds = new Set([
            ...masterSlots.slots.map(s => s.slotId),
            ...operationalSlots.slots.map(s => s.slotId)
        ]);

        const tempAdded = [];
        const tempLost = [];
        const replaced = [];
        const unchangedSlotIds = new Set();

        operationalSlots.slots.forEach(slotB => {
            if (masterSlots.slotMap.has(slotB.slotId)) return;
            if (!slotB.assignedName || !slotB.assignedNorm) return;
            tempAdded.push({ ...slotB, name: slotB.assignedName });
        });

        slotIds.forEach(slotId => {
            const slotA = masterSlots.slotMap.get(slotId);
            const slotB = operationalSlots.slotMap.get(slotId);

            if (!slotA && !slotB) return;

            if (slotA && !slotB) {
                if (slotA.assignedName && slotA.assignedNorm) {
                    tempLost.push({ ...slotA, name: slotA.assignedName });
                }
                return;
            }

            if (!slotA || !slotB) return;

            const nameA = slotA.assignedNorm;
            const nameB = slotB.assignedNorm;

            if (nameA === nameB) {
                unchangedSlotIds.add(slotId);
                return;
            }

            if (nameA && nameB) {
                replaced.push({
                    ...slotB,
                    fromName: slotA.assignedName,
                    toName: slotB.assignedName,
                    fromSlot: slotA,
                    toSlot: slotB
                });
                return;
            }

            if (nameA && !nameB) {
                tempLost.push({ ...slotA, name: slotA.assignedName });
                return;
            }

            if (!nameA && nameB) {
                tempAdded.push({ ...slotB, name: slotB.assignedName });
                return;
            }
        });

        const moved = [];
        const movedSlotIds = new Set();
        const usedLostIndices = new Set();
        const usedAddedIndices = new Set();

        tempLost.forEach((lostSlot, lostIdx) => {
            if (usedLostIndices.has(lostIdx)) return;

            const dateShiftKey = `${lostSlot.date}_${lostSlot.shiftId}`;
            const lostNameNorm = lostSlot.assignedNorm;

            tempAdded.forEach((addedSlot, addedIdx) => {
                if (usedAddedIndices.has(addedIdx)) return;
                if (movedSlotIds.has(lostSlot.slotId) || movedSlotIds.has(addedSlot.slotId)) return;

                const addedDateShiftKey = `${addedSlot.date}_${addedSlot.shiftId}`;
                const addedNameNorm = addedSlot.assignedNorm;

                if (lostNameNorm === addedNameNorm && dateShiftKey === addedDateShiftKey && lostSlot.slotId !== addedSlot.slotId) {
                    moved.push({
                        name: lostSlot.name,
                        from: lostSlot,
                        to: addedSlot
                    });
                    movedSlotIds.add(lostSlot.slotId);
                    movedSlotIds.add(addedSlot.slotId);
                    usedLostIndices.add(lostIdx);
                    usedAddedIndices.add(addedIdx);
                }
            });
        });

        const added = tempAdded.filter((_, idx) => !usedAddedIndices.has(idx));
        const lost = tempLost.filter((_, idx) => !usedLostIndices.has(idx));

        const matched = [];
        unchangedSlotIds.forEach(slotId => {
            const masterSlot = masterSlots.slotMap.get(slotId);
            const operationalSlot = operationalSlots.slotMap.get(slotId);
            if (!masterSlot || !operationalSlot) return;
            matched.push({ master: masterSlot, operational: operationalSlot });
        });

        return {
            changes: { moved, added, lost, replaced, matched }
        };
    }, [buildPlanSlots]);

    return {
        getShiftsForDate,
        calculateDailyStats,
        globalWorkSchedule,
        handleAutoFillFloaters,
        buildPlanSlots,
        comparePlanSnapshots
    };
}

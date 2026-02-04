import { useCallback } from 'react';
import { useNotification } from '../../components/common/Toast';
import { STORAGE_KEYS, checkWorkerAvailability, normalizeName } from '../../utils';
import {
    generateShiftHash,
    normalizeLineTemplates,
    normalizeManualAssignments,
    preAnalyzeRoster,
    analyzeDataPure,
    buildPlanHashes,
    normalizePlanData,
    createManualSlotId,
    buildManualLineSlotIds,
    serializeWorkerRegistry
} from '../dataContextUtils';

export function usePlanActions(state) {
    const { notify } = useNotification();
    const {
        savedPlans, setSavedPlans, savedPlansSourceRef,
        currentPlanId, setCurrentPlanId,
        isReadOnly,
        persistStateKey,
        setRawTables, setScheduleDates, setPlanHashes,
        setLineTemplates, setFloaters, setWorkerRegistry,
        setManualAssignments, setManualLines, setAssignmentClones,
        setFactData, setFactDates, setPlanningStateToLoad,
        setPlanningStateVersion, setSelectedDate,
        manualAssignments, manualLines, assignmentClones,
        workerRegistry, lineTemplates, floaters,
        applyPlanData,
        viewMode, selectedDate,
        draggedWorker, setDraggedWorker,
        setRvModalData,
        assignmentsBackup, setAssignmentsBackup,
        pendingUpdates,
        setError, setLoading, setFile, setUpdateReport, setStep, setEditingWorker, setIsLocked,
        parseExcelToPlanData,
        buildPlanSnapshot
    } = state;

    const generatePlanId = () => `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const saveSourceDataToLocal = useCallback((tables, hashes) => {
        try {
            persistStateKey(STORAGE_KEYS.RAW_TABLES, tables);
            persistStateKey(STORAGE_KEYS.PLAN_HASHES, hashes);
        } catch (e) {
            setError("Ошибка сохранения данных.");
        }
    }, [persistStateKey, setError]);

    const addPlan = useCallback((plan) => {
        savedPlansSourceRef.current = 'addPlan';
        setSavedPlans(prev => {
            const cleared = plan.type ? prev.map(p => (p.type === plan.type ? { ...p, type: null } : p)) : prev;
            return [...cleared, plan];
        });
    }, [setSavedPlans, savedPlansSourceRef]);

    const saveCurrentAsNewPlan = useCallback((name) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Сохранение недоступно.' });
            return;
        }
        const planName = (name || `План ${new Date().toISOString().slice(0, 10)}`).trim();
        const createdAt = new Date().toISOString();
        const snapshot = buildPlanSnapshot();
        const existing = savedPlans.find(p => (p.name || '').trim() === planName);
        const targetPlanId = existing ? existing.id : generatePlanId();
        savedPlansSourceRef.current = 'saveCurrentAsNewPlan';
        setSavedPlans(prev => {
            const existingIdx = prev.findIndex(p => (p.name || '').trim() === planName);
            const cleared = prev.map(p => (p.type === 'Operational' ? { ...p, type: null } : p));
            if (existingIdx !== -1) {
                const next = [...cleared];
                next[existingIdx] = {
                    ...cleared[existingIdx],
                    createdAt,
                    type: 'Operational',
                    data: snapshot
                };
                return next;
            }
            return [...cleared, {
                id: targetPlanId,
                name: planName,
                createdAt,
                type: 'Operational',
                data: snapshot
            }];
        });
        setCurrentPlanId(targetPlanId);
    }, [isReadOnly, savedPlans, buildPlanSnapshot, setSavedPlans, setCurrentPlanId, notify, savedPlansSourceRef]);

    const loadPlan = useCallback((planId, { switchToDashboard = true } = {}) => {
        const plan = savedPlans.find(p => p.id === planId);
        if (!plan?.data) return;
        setLoading(true);
        applyPlanData(plan.data, { switchView: switchToDashboard });
        setCurrentPlanId(plan.id);
        if (plan.data.planningState) {
            persistStateKey(STORAGE_KEYS.PLANNING_STATE, plan.data.planningState);
            setPlanningStateToLoad(plan.data.planningState);
            setPlanningStateVersion(v => v + 1);
        }
        setTimeout(() => {
            setLoading(false);
        }, 0);
    }, [savedPlans, applyPlanData, setCurrentPlanId, persistStateKey, setPlanningStateToLoad, setPlanningStateVersion, setLoading]);

    const loadPlanQueue = useCallback((planId) => {
        const plan = savedPlans.find(p => p.id === planId);
        if (!plan?.data?.planningState) return;
        setPlanningStateToLoad(plan.data.planningState);
        setPlanningStateVersion(v => v + 1);
    }, [savedPlans, setPlanningStateToLoad, setPlanningStateVersion]);

    const updateOperationalTimeline = useCallback((updater) => {
        if (!currentPlanId || typeof updater !== 'function') return;
        savedPlansSourceRef.current = 'updateOperationalTimeline';
        setSavedPlans(prev => {
            const idx = prev.findIndex(p => p.id === currentPlanId);
            if (idx === -1) return prev;
            const nextData = { ...prev[idx].data, operationalTimeline: updater(prev[idx].data?.operationalTimeline ?? null) };
            const next = [...prev];
            next[idx] = { ...next[idx], data: nextData, updatedAt: new Date().toISOString() };
            return next;
        });
    }, [currentPlanId, setSavedPlans, savedPlansSourceRef]);

    const updateOperationalFacts = useCallback((updater) => {
        if (!currentPlanId || typeof updater !== 'function') return;
        savedPlansSourceRef.current = 'updateOperationalFacts';
        setSavedPlans(prev => {
            const idx = prev.findIndex(p => p.id === currentPlanId);
            if (idx === -1) return prev;
            const nextData = { ...prev[idx].data, operationalFacts: updater(prev[idx].data?.operationalFacts ?? null) };
            const next = [...prev];
            next[idx] = { ...next[idx], data: nextData, updatedAt: new Date().toISOString() };
            return next;
        });
    }, [currentPlanId, setSavedPlans, savedPlansSourceRef]);

    const updatePlanPlanningState = useCallback((planningState) => {
        if (!currentPlanId || planningState == null) return;
        savedPlansSourceRef.current = 'updatePlanPlanningState';
        setSavedPlans(prev => {
            const idx = prev.findIndex(p => p.id === currentPlanId);
            if (idx === -1) return prev;
            const nextData = { ...prev[idx].data, planningState };
            const next = [...prev];
            next[idx] = { ...next[idx], data: nextData, updatedAt: new Date().toISOString() };
            return next;
        });
    }, [currentPlanId, setSavedPlans, savedPlansSourceRef]);

    const setPlanType = useCallback((planId, type) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Изменение типа недоступно.' });
            return;
        }
        savedPlansSourceRef.current = 'setPlanType';
        setSavedPlans(prev => prev.map(plan => {
            if (plan.id === planId) return { ...plan, type };
            if (type && plan.type === type) return { ...plan, type: null };
            return plan;
        }));
    }, [isReadOnly, setSavedPlans, notify, savedPlansSourceRef]);

    const deletePlan = useCallback((planId) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Удаление недоступно.' });
            return;
        }
        savedPlansSourceRef.current = 'deletePlan';
        setSavedPlans(prev => prev.filter(plan => plan.id !== planId));
        if (currentPlanId === planId) {
            setCurrentPlanId(null);
            setRawTables({});
            setScheduleDates([]);
            setPlanHashes({});
            setManualAssignments({});
            setManualLines({});
            setAssignmentClones({});
            setFactData(null);
            setFactDates([]);
            setWorkerRegistry({});
            setLineTemplates({});
            setFloaters({ day: [], night: [] });
            setPlanningStateToLoad(null);
            setSelectedDate('');
        }
    }, [isReadOnly, setSavedPlans, currentPlanId, setCurrentPlanId, setRawTables, setScheduleDates, setPlanHashes, setManualAssignments, setManualLines, setAssignmentClones, setFactData, setFactDates, setWorkerRegistry, setLineTemplates, setFloaters, setPlanningStateToLoad, setSelectedDate, notify, savedPlansSourceRef]);

    const importPlanFromJson = useCallback((jsonData, defaultName) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Импорт недоступен.' });
            return null;
        }
        const createdAt = new Date().toISOString();
        const hasData = jsonData && typeof jsonData === 'object' && jsonData.data;
        const planData = hasData ? jsonData.data : jsonData;
        const plan = {
            id: jsonData?.id || generatePlanId(),
            name: jsonData?.name || defaultName || `План ${createdAt.slice(0, 10)}`,
            createdAt: jsonData?.createdAt || createdAt,
            type: jsonData?.type || null,
            data: normalizePlanData(planData)
        };
        addPlan(plan);
        return plan.id;
    }, [isReadOnly, addPlan, notify]);

    const importPlanFromExcelFile = useCallback(async (file, nameOverride) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Импорт недоступен.' });
            return null;
        }
        const planData = await parseExcelToPlanData(file);
        const createdAt = new Date().toISOString();
        const plan = {
            id: generatePlanId(),
            name: nameOverride || file?.name || `План ${createdAt.slice(0, 10)}`,
            createdAt,
            type: null,
            data: planData
        };
        addPlan(plan);
        return plan.id;
    }, [isReadOnly, parseExcelToPlanData, addPlan, notify]);

    const updateAssignments = useCallback((newAssignments) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Редактирование недоступно.' });
            return;
        }
        if (viewMode !== 'dashboard') {
            notify({ type: 'error', message: 'Редактирование доступно только в режиме "Смены".' });
            return;
        }
        setManualAssignments(newAssignments);
        persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, newAssignments);
    }, [isReadOnly, viewMode, setManualAssignments, persistStateKey, notify]);

    const handleMatrixAssignment = useCallback((targetLineName, targetPosIdx, shiftId, newWorkerNames) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Редактирование недоступно.' });
            return;
        }
        setLineTemplates(prev => {
            const newTemplates = { ...prev };
            Object.keys(newTemplates).forEach(lineKey => {
                newTemplates[lineKey] = newTemplates[lineKey].map((pos, pIdx) => {
                    const roster = { ...pos.roster };
                    let changed = false;
                    Object.keys(roster).forEach(sId => {
                        if (lineKey === targetLineName && pIdx === targetPosIdx && sId === shiftId) return;
                        const currentCellStr = roster[sId];
                        if (currentCellStr) {
                            let names = currentCellStr.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1);
                            const hasConflict = names.some(n => newWorkerNames.includes(n));
                            if (hasConflict) {
                                names = names.filter(n => !newWorkerNames.includes(n));
                                roster[sId] = names.join(', ');
                                changed = true;
                            }
                        }
                    });
                    return changed ? { ...pos, roster } : pos;
                });
            });

            const targetLine = [...newTemplates[targetLineName]];
            const targetPos = { ...targetLine[targetPosIdx] };
            const targetRoster = { ...targetPos.roster };
            targetRoster[shiftId] = newWorkerNames.join(', ');
            targetPos.roster = targetRoster;
            targetLine[targetPosIdx] = targetPos;
            newTemplates[targetLineName] = targetLine;

            setTimeout(() => {
                setWorkerRegistry(reg => {
                    const nextReg = { ...reg };
                    newWorkerNames.forEach(name => {
                        if (!nextReg[name]) {
                            nextReg[name] = { name, role: targetPos.role, homeLine: targetLineName, competencies: new Set(), status: null };
                        } else {
                            nextReg[name] = { ...nextReg[name], homeLine: targetLineName, role: targetPos.role };
                        }
                    });
                    const registryForStorage = {};
                    Object.entries(nextReg).forEach(([key, value]) => {
                        registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
                    });
                    persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
                    return nextReg;
                });
            }, 0);

            persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, newTemplates);
            return newTemplates;
        });
    }, [isReadOnly, setLineTemplates, setWorkerRegistry, persistStateKey, notify]);

    const handleWorkerEditSave = useCallback(({ oldName, newName, competencies, status, fiveDay }) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Редактирование недоступно.' });
            return;
        }
        setWorkerRegistry(prev => {
            const next = { ...prev };
            if (oldName && oldName !== newName) {
                const data = next[oldName];
                delete next[oldName];
                next[newName] = { ...data, name: newName, competencies, status, fiveDay: fiveDay ?? data?.fiveDay };
                setLineTemplates(lt => {
                    const newLt = { ...lt };
                    Object.keys(newLt).forEach(k => {
                        newLt[k] = newLt[k].map(pos => {
                            const newRoster = { ...pos.roster };
                            Object.keys(newRoster).forEach(s => {
                                if (newRoster[s] && newRoster[s].includes(oldName)) {
                                    newRoster[s] = newRoster[s].replace(oldName, newName);
                                }
                            });
                            return { ...pos, roster: newRoster };
                        });
                    });
                    return newLt;
                });
            } else {
                const existing = next[newName];
                next[newName] = {
                    name: newName,
                    role: existing?.role || 'Сотрудник',
                    homeLine: existing?.homeLine || '',
                    competencies,
                    status,
                    fiveDay: fiveDay ?? existing?.fiveDay
                };
            }
            const registryForStorage = {};
            Object.entries(next).forEach(([key, value]) => {
                registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
            });
            persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
            return next;
        });
        setEditingWorker(null);
    }, [isReadOnly, setWorkerRegistry, setLineTemplates, setEditingWorker, persistStateKey, notify]);

    const handleWorkerDelete = useCallback((name) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Удаление недоступно.' });
            return;
        }
        setWorkerRegistry(prev => {
            const next = { ...prev };
            delete next[name];
            const registryForStorage = {};
            Object.entries(next).forEach(([key, value]) => {
                registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
            });
            persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
            return next;
        });
        setLineTemplates(lt => {
            const newLt = { ...lt };
            Object.keys(newLt).forEach(k => {
                newLt[k] = newLt[k].map(pos => {
                    const newRoster = { ...pos.roster };
                    Object.keys(newRoster).forEach(s => {
                        if (newRoster[s]) {
                            const names = newRoster[s].split(/[,;\n/]+/).map(n => n.trim());
                            const filtered = names.filter(n => n !== name);
                            newRoster[s] = filtered.join(', ');
                        }
                    });
                    return { ...pos, roster: newRoster };
                });
            });
            persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, newLt);
            return newLt;
        });
    }, [isReadOnly, setWorkerRegistry, setLineTemplates, persistStateKey, notify]);

    const addManualLine = useCallback(({ date, shiftId, displayName, templateName, positions }) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Редактирование недоступно.' });
            return;
        }
        if (!date || !shiftId || !displayName) return;
        const key = `${date}_${shiftId}`;
        const normalizedPositions = Array.isArray(positions) && positions.length > 0
            ? positions.map(pos => ({
                roleTitle: pos?.roleTitle || pos?.role || displayName,
                count: Math.max(1, parseInt(pos?.count, 10) || 1)
            }))
            : [{ roleTitle: displayName, count: 1 }];
        const nextLine = {
            id: `manual_line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            templateName,
            displayName,
            positions: normalizedPositions
        };
        setManualLines(prev => {
            const next = { ...prev };
            const existing = next[key] ? [...next[key]] : [];
            next[key] = [...existing, nextLine];
            return next;
        });
    }, [isReadOnly, setManualLines, notify]);

    const removeManualLine = useCallback(({ date, shiftId, lineId }) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Удаление недоступно.' });
            return;
        }
        if (!date || !shiftId || !lineId) return;
        const key = `${date}_${shiftId}`;
        let removedLine = null;
        setManualLines(prev => {
            const next = { ...prev };
            const existing = next[key] ? [...next[key]] : [];
            const filtered = existing.filter(line => {
                if (line.id === lineId) {
                    removedLine = line;
                    return false;
                }
                return true;
            });
            if (filtered.length > 0) {
                next[key] = filtered;
            } else {
                delete next[key];
            }
            return next;
        });
        if (!removedLine) return;
        const slotIds = buildManualLineSlotIds(date, shiftId, removedLine);
        if (slotIds.length === 0) return;
        const nextAssignments = { ...manualAssignments };
        let changed = false;
        slotIds.forEach(slotId => {
            if (nextAssignments[slotId]) {
                delete nextAssignments[slotId];
                changed = true;
            }
        });
        if (changed) {
            updateAssignments(nextAssignments);
        }
    }, [isReadOnly, manualAssignments, setManualLines, updateAssignments, notify]);

    const createPlanFromSchedule = useCallback(({ demand, roster, name, planningState } = {}) => {
        if (!Array.isArray(demand) || demand.length === 0) throw new Error('Пустое расписание (demand).');
        if (!Array.isArray(roster) || roster.length === 0) throw new Error('Пустой справочник (roster).');

        const rawTablesNext = { demand, roster };
        const { templates: templatesFromRoster } = preAnalyzeRoster(roster);
        const newHashes = buildPlanHashes(demand, templatesFromRoster);
        const analysis = analyzeDataPure(demand, roster);

        setRawTables(rawTablesNext);
        setPlanHashes(newHashes);
        setScheduleDates(analysis.scheduleDates);
        setLineTemplates(analysis.lineTemplates);
        setFloaters(analysis.floaters);
        setWorkerRegistry(analysis.workerRegistry);
        setManualAssignments({});
        if (analysis.scheduleDates.length > 0) {
            setSelectedDate(prev => analysis.scheduleDates.includes(prev) ? prev : analysis.scheduleDates[0]);
        }

        persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, analysis.lineTemplates);
        persistStateKey(STORAGE_KEYS.FLOATERS, analysis.floaters);
        const registryForStorage = {};
        Object.entries(analysis.workerRegistry || {}).forEach(([k, v]) => {
            registryForStorage[k] = { ...v, competencies: Array.from(v?.competencies || []) };
        });
        persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);

        const createdAt = new Date().toISOString();
        const planName = (name || `План ${createdAt.slice(0, 10)}`).trim();
        const planData = {
            rawTables: rawTablesNext,
            planHashes: newHashes,
            scheduleDates: analysis.scheduleDates,
            lineTemplates: analysis.lineTemplates,
            floaters: analysis.floaters,
            workerRegistry: serializeWorkerRegistry(analysis.workerRegistry),
            manualAssignments: {},
            manualLines,
            assignmentClones,
            planningState: planningState || null
        };
        const existingByName = savedPlans.find(p => (p.name || '').trim() === planName);
        const planId = existingByName ? existingByName.id : generatePlanId();
        const plan = {
            id: planId,
            name: planName,
            createdAt,
            type: existingByName ? existingByName.type : null,
            data: planData
        };
        savedPlansSourceRef.current = 'createPlanFromSchedule';
        setSavedPlans(prev => {
            const idx = prev.findIndex(p => p.id === planId);
            return idx !== -1 ? (() => { const n = [...prev]; n[idx] = plan; return n; })() : [...prev, plan];
        });
        setCurrentPlanId(planId);
    }, [savedPlans, manualLines, assignmentClones, setRawTables, setPlanHashes, setScheduleDates, setLineTemplates, setFloaters, setWorkerRegistry, setManualAssignments, setSelectedDate, persistStateKey, setSavedPlans, setCurrentPlanId, savedPlansSourceRef]);

    const updateCloneEntry = useCallback(({ date, shiftId, cloneId, updater }) => {
        setAssignmentClones(prev => {
            const next = { ...prev };
            const dateEntry = next[date];
            if (!dateEntry) return prev;
            const shiftClones = dateEntry[shiftId];
            if (!shiftClones) return prev;
            let changed = false;
            const updated = shiftClones.map(clone => {
                if (clone.id !== cloneId) return clone;
                changed = true;
                return updater(clone);
            });
            if (!changed) return prev;
            next[date] = { ...dateEntry, [shiftId]: updated };
            return next;
        });
    }, [setAssignmentClones]);

    const handleDragStart = useCallback((e, worker) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Редактирование недоступно.' });
            return;
        }
        if (viewMode !== 'dashboard') {
            notify({ type: 'error', message: 'Редактирование доступно только в режиме "Смены".' });
            return;
        }
        const availability = worker.isClone ? { available: true } : checkWorkerAvailability(worker.name, selectedDate, workerRegistry);
        if (!availability.available) {
            e.preventDefault();
            notify({ type: 'error', message: `${worker.name} недоступен: ${availability.reason}` });
            return;
        }
        setDraggedWorker(worker);
        e.dataTransfer.effectAllowed = 'move';
    }, [isReadOnly, viewMode, selectedDate, workerRegistry, setDraggedWorker, notify]);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggedWorker(null);
    }, [setDraggedWorker]);

    const handleDrop = useCallback((e, targetSlotId, targetBaseWorkerName = null) => {
        e.preventDefault();
        if (!draggedWorker) return;
        
        const newAssignments = { ...manualAssignments };
        const sourceSlotId = draggedWorker.sourceSlotId;
        
        if (sourceSlotId && sourceSlotId !== targetSlotId) {
            const targetWorker = newAssignments[targetSlotId];
            const draggedEntry = {
                ...draggedWorker,
                originalId: draggedWorker.originalId || draggedWorker.id,
                id: `assigned_${targetSlotId}_${Date.now()}`,
                movedFrom: sourceSlotId,
                movedAt: Date.now()
            };
            delete draggedEntry.sourceSlotId;
            
            if (targetWorker && targetWorker.type !== 'vacancy') {
                const swappedEntry = {
                    ...targetWorker,
                    id: `assigned_${sourceSlotId}_${Date.now()}`,
                    movedFrom: targetSlotId,
                    movedAt: Date.now()
                };
                newAssignments[sourceSlotId] = swappedEntry;
            } else if (targetBaseWorkerName) {
                const rosterWorkerEntry = {
                    name: targetBaseWorkerName,
                    role: workerRegistry[targetBaseWorkerName]?.role || 'Не указано',
                    homeLine: workerRegistry[targetBaseWorkerName]?.homeLine || '',
                    id: `assigned_${sourceSlotId}_${Date.now()}`,
                    movedFrom: targetSlotId,
                    movedAt: Date.now(),
                    type: 'roster'
                };
                newAssignments[sourceSlotId] = rosterWorkerEntry;
            } else {
                newAssignments[sourceSlotId] = { 
                    type: 'vacancy', 
                    id: `moved_vacancy_${sourceSlotId}_${Date.now()}`,
                    reason: 'moved',
                    movedTo: targetSlotId,
                    movedWorker: draggedWorker.name,
                    movedAt: Date.now()
                };
            }
            newAssignments[targetSlotId] = draggedEntry;
        } else {
            const assignmentEntry = {
                ...draggedWorker,
                originalId: draggedWorker.id,
                id: `assigned_${targetSlotId}_${Date.now()}`
            };
            delete assignmentEntry.sourceSlotId;
            if (draggedWorker.cloneId) {
                assignmentEntry.cloneId = draggedWorker.cloneId;
                assignmentEntry.cloneDate = draggedWorker.date;
                assignmentEntry.cloneShiftId = draggedWorker.shiftId;
            }
            newAssignments[targetSlotId] = assignmentEntry;
            if (draggedWorker.cloneId) {
                updateCloneEntry({
                    date: draggedWorker.date,
                    shiftId: draggedWorker.shiftId,
                    cloneId: draggedWorker.cloneId,
                    updater: (clone) => ({
                        ...clone,
                        status: 'assigned',
                        assignedSlotId: targetSlotId,
                        assignedAt: Date.now()
                    })
                });
            }
        }
        
        updateAssignments(newAssignments);
        setDraggedWorker(null);
    }, [draggedWorker, manualAssignments, workerRegistry, updateAssignments, updateCloneEntry, setDraggedWorker]);

    const handleAssignRv = useCallback((worker, slotId) => {
        const assignmentEntry = {
            name: worker.name,
            role: worker.mainRole,
            homeLine: worker.homeLine,
            originalId: `rv_${worker.name}_${Date.now()}`,
            id: `assigned_${slotId}_${Date.now()}`,
            type: 'external',
            sourceShift: worker.sourceShift
        };
        updateAssignments({ ...manualAssignments, [slotId]: assignmentEntry });
        setRvModalData(null);
    }, [manualAssignments, updateAssignments, setRvModalData]);

    const handleRemoveAssignment = useCallback((slotId) => {
        const newAssignments = { ...manualAssignments };
        const existing = newAssignments[slotId];
        if (existing?.cloneId && existing.cloneDate && existing.cloneShiftId) {
            updateCloneEntry({
                date: existing.cloneDate,
                shiftId: existing.cloneShiftId,
                cloneId: existing.cloneId,
                updater: (clone) => ({
                    ...clone,
                    status: 'available',
                    assignedSlotId: undefined,
                    assignedAt: undefined
                })
            });
        }
        if (newAssignments[slotId]) delete newAssignments[slotId];
        else newAssignments[slotId] = { type: 'vacancy', id: `forced_vac_${Date.now()}` };
        updateAssignments(newAssignments);
    }, [manualAssignments, updateAssignments, updateCloneEntry]);

    const cloneAssignedWorker = useCallback(({ date, shiftId, slotId, worker, roleTitle }) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Редактирование недоступно.' });
            return;
        }
        if (viewMode !== 'dashboard') {
            notify({ type: 'error', message: 'Совмещение доступно только в режиме "Смены".' });
            return;
        }
        if (!worker?.name || !date || !shiftId) return;

        const cloneEntry = {
            id: `clone_${slotId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: worker.name,
            role: worker.role || roleTitle || 'Не указано',
            homeLine: worker.homeLine || '',
            originalSlotId: slotId,
            date,
            shiftId,
            status: 'available',
            createdAt: Date.now()
        };

        setAssignmentClones(prev => {
            const next = { ...prev };
            const dateEntry = next[date] ? { ...next[date] } : {};
            const shiftList = dateEntry[shiftId] ? [...dateEntry[shiftId]] : [];
            shiftList.push(cloneEntry);
            dateEntry[shiftId] = shiftList;
            next[date] = dateEntry;
            return next;
        });
    }, [isReadOnly, viewMode, setAssignmentClones, notify]);

    const removeCloneEntry = useCallback(({ date, shiftId, cloneId }) => {
        setAssignmentClones(prev => {
            const next = { ...prev };
            const dateEntry = next[date];
            if (!dateEntry) return prev;
            const shiftClones = dateEntry[shiftId];
            if (!shiftClones) return prev;
            const filtered = shiftClones.filter(clone => clone.id !== cloneId);
            if (filtered.length === shiftClones.length) return prev;
            if (filtered.length > 0) {
                next[date] = { ...dateEntry, [shiftId]: filtered };
            } else {
                const { [shiftId]: removed, ...rest } = dateEntry;
                if (Object.keys(rest).length > 0) {
                    next[date] = rest;
                } else {
                    delete next[date];
                }
            }
            return next;
        });
    }, [setAssignmentClones]);

    const backupAssignments = useCallback(() => {
        try {
            setAssignmentsBackup(manualAssignments);
            persistStateKey(STORAGE_KEYS.ASSIGNMENTS_BACKUP, manualAssignments);
            notify({ type: 'success', message: 'Расстановка сохранена в резервную копию' });
        } catch (e) {
            notify({ type: 'error', message: 'Ошибка сохранения резервной копии' });
        }
    }, [manualAssignments, setAssignmentsBackup, persistStateKey, notify]);

    const restoreAssignments = useCallback(() => {
        try {
            const backup = pendingUpdates[STORAGE_KEYS.ASSIGNMENTS_BACKUP] ?? assignmentsBackup;
            if (!backup || Object.keys(backup).length === 0) {
                notify({ type: 'warning', message: 'Нет сохраненной резервной копии' });
                return;
            }
            updateAssignments(backup);
            notify({ type: 'success', message: 'Расстановка восстановлена из резервной копии' });
        } catch (e) {
            notify({ type: 'error', message: 'Ошибка восстановления резервной копии' });
        }
    }, [assignmentsBackup, pendingUpdates, updateAssignments, notify]);

    const unlockWithCode = useCallback((code) => {
        setIsLocked(false);
        return true;
    }, [setIsLocked]);

    return {
        addPlan,
        saveCurrentAsNewPlan,
        loadPlan,
        loadPlanQueue,
        updateOperationalTimeline,
        updateOperationalFacts,
        updatePlanPlanningState,
        setPlanType,
        deletePlan,
        importPlanFromJson,
        importPlanFromExcelFile,
        updateAssignments,
        handleMatrixAssignment,
        handleWorkerEditSave,
        handleWorkerDelete,
        addManualLine,
        removeManualLine,
        createPlanFromSchedule,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDrop,
        handleAssignRv,
        handleRemoveAssignment,
        cloneAssignedWorker,
        updateCloneEntry,
        removeCloneEntry,
        backupAssignments,
        restoreAssignments,
        saveSourceDataToLocal,
        unlockWithCode
    };
}

import { useCallback } from 'react';
import { STORAGE_KEYS, checkWorkerAvailability, normalizeName } from '../../utils';
import { buildManualLineSlotIds } from './planUtils';

/**
 * Хук для операций с назначениями
 */
export const useAssignmentsOperations = ({
    // State
    manualAssignments,
    assignmentClones,
    manualLines,
    draggedWorker,
    selectedDate,
    viewMode,
    workerRegistry,
    scheduleDates,
    // Setters
    setManualAssignments,
    setAssignmentClones,
    setManualLines,
    setDraggedWorker,
    // Utils
    persistStateKey,
    notify,
    isReadOnly,
    getShiftsForDate
}) => {
    /**
     * Обновляет назначения
     */
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
    }, [persistStateKey, viewMode, isReadOnly, notify, setManualAssignments]);

    /**
     * Обработчик начала перетаскивания
     */
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
    }, [selectedDate, workerRegistry, viewMode, isReadOnly, notify, setDraggedWorker]);

    /**
     * Обработчик перетаскивания над целью
     */
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    /**
     * Обработчик окончания перетаскивания
     */
    const handleDragEnd = useCallback(() => {
        setDraggedWorker(null);
    }, [setDraggedWorker]);

    /**
     * Обновляет запись клона
     */
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

    /**
     * Удаляет запись клона
     */
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

    /**
     * Клонирует назначенного работника
     */
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
    }, [notify, viewMode, isReadOnly, setAssignmentClones]);

    /**
     * Обработчик сброса на слот
     */
    const handleDrop = useCallback((e, targetSlotId, targetBaseWorkerName = null) => {
        e.preventDefault();
        if (!draggedWorker) return;
        
        const newAssignments = { ...manualAssignments };
        const sourceSlotId = draggedWorker.sourceSlotId;
        
        // Если перетаскивают из другого слота (перемещение/обмен)
        if (sourceSlotId && sourceSlotId !== targetSlotId) {
            const targetWorker = newAssignments[targetSlotId];
            
            // Создаем новую запись для перетаскиваемого работника в целевой слот
            const draggedEntry = {
                ...draggedWorker,
                originalId: draggedWorker.originalId || draggedWorker.id,
                id: `assigned_${targetSlotId}_${Date.now()}`,
                movedFrom: sourceSlotId,
                movedAt: Date.now()
            };
            delete draggedEntry.sourceSlotId;
            
            // Если целевой слот занят - меняем местами
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
            // Обычное назначение из резерва/свободных
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
    }, [draggedWorker, manualAssignments, updateAssignments, workerRegistry, updateCloneEntry, setDraggedWorker]);

    /**
     * Назначает РВ работника
     */
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
    }, [manualAssignments, updateAssignments]);

    /**
     * Удаляет назначение
     */
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
        if (existing?.type === 'vacancy') {
            delete newAssignments[slotId];
        } else if (existing) {
            if (slotId.includes('_manual_')) {
                delete newAssignments[slotId];
            } else {
                newAssignments[slotId] = { type: 'vacancy', id: `forced_vac_${Date.now()}` };
            }
        } else {
            newAssignments[slotId] = { type: 'vacancy', id: `forced_vac_${Date.now()}` };
        }
        updateAssignments(newAssignments);
    }, [manualAssignments, updateAssignments, updateCloneEntry]);

    /**
     * Добавляет ручную линию
     */
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
    }, [isReadOnly, notify, setManualLines]);

    /**
     * Удаляет ручную линию
     */
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
    }, [manualAssignments, updateAssignments, isReadOnly, notify, setManualLines]);

    /**
     * Автозаполнение подсобниками
     */
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

    return {
        updateAssignments,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDrop,
        handleAssignRv,
        handleRemoveAssignment,
        cloneAssignedWorker,
        removeCloneEntry,
        updateCloneEntry,
        addManualLine,
        removeManualLine,
        handleAutoFillFloaters
    };
};


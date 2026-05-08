import { normalizeName, checkWorkerAvailability } from '../../utils';

/**
 * Ключ для сопоставления блока линии между сменами (одинаковая структура слотов).
 */
export const taskStructuralKey = (task) => {
    const roles = (task.slots || []).map((s) => s.roleTitle).join('¦');
    if (task.isManualLine || task.lineSource === 'manual') {
        return `m|${task.displayName || ''}|${task.templateName || ''}|${roles}`;
    }
    return `r|${task.displayName || ''}|${task.activeLineName || ''}|${roles}`;
};

/** Одинаковый набор линий/ролей (для группировки «смены как у источника»). */
export const shiftLineCompositionSignature = (shift) => {
    const keys = (shift?.lineTasks || []).map((t) => taskStructuralKey(t)).sort();
    return keys.join('||');
};

export const workerEligibleForTargetShift = (name, dateStr, targetShift, workerRegistry) => {
    if (!name) return false;
    const shiftTypeLower = String(targetShift.type || '').toLowerCase();
    const reg = workerRegistry?.[name];
    const isFiveDay = reg?.fiveDay === true;
    if (shiftTypeLower.includes('ночь') && isFiveDay) return false;
    const v = checkWorkerAvailability(name, dateStr, workerRegistry || {});
    return v.available;
};

export const cloneAssignmentEntry = (src, targetSlotId) => {
    const entry = { ...src };
    entry.id = `assigned_${targetSlotId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (entry.type === 'outsourced') {
        entry.originalId = `outsourced_${targetSlotId}`;
    }
    delete entry.cloneId;
    delete entry.cloneDate;
    delete entry.cloneShiftId;
    delete entry.sourceSlotId;
    delete entry.movedFrom;
    delete entry.movedTo;
    delete entry.movedAt;
    delete entry.movedWorker;
    return entry;
};

export const extractAssignableFromSourceSlot = (slot, manualAssignments) => {
    const manual = manualAssignments[slot.slotId];
    if (manual?.type === 'vacancy') return null;
    if (manual && manual.type !== 'vacancy') {
        return manual;
    }
    if (slot.status === 'filled' && slot.currentWorkerName) {
        return { name: slot.currentWorkerName, type: 'roster' };
    }
    if (slot.assigned?.name && (slot.status === 'reassigned' || slot.status === 'outsourced')) {
        return slot.assigned;
    }
    return null;
};

/**
 * Патч manualAssignments для целевой смены по составу исходной.
 * targetDateStr — дата целевой смены (для доступности людей); слоты источника берутся из sourceShift.slotId.
 */
export const buildShiftCopyPatch = (_sourceDateStr, targetDateStr, sourceShift, targetShift, manualAssignments, workerRegistry) => {
    const targetMap = new Map();
    (targetShift.lineTasks || []).forEach((t) => {
        targetMap.set(taskStructuralKey(t), t);
    });

    const patch = {};
    let copied = 0;
    let skipped = 0;
    const usedNorm = new Set();

    (sourceShift.lineTasks || []).forEach((srcTask) => {
        const tgtTask = targetMap.get(taskStructuralKey(srcTask));
        if (!tgtTask) return;
        const n = Math.min(srcTask.slots.length, tgtTask.slots.length);
        for (let i = 0; i < n; i++) {
            const srcSlot = srcTask.slots[i];
            const tgtSlot = tgtTask.slots[i];
            const srcEntry = extractAssignableFromSourceSlot(srcSlot, manualAssignments);
            if (!srcEntry?.name || srcEntry.type === 'vacancy') continue;

            const { name } = srcEntry;
            const norm = normalizeName(name);
            if (usedNorm.has(norm)) {
                skipped++;
                continue;
            }
            if (!workerEligibleForTargetShift(name, targetDateStr, targetShift, workerRegistry)) {
                skipped++;
                continue;
            }

            patch[tgtSlot.slotId] = cloneAssignmentEntry(srcEntry, tgtSlot.slotId);
            usedNorm.add(norm);
            copied++;
        }
    });

    return { patch, copied, skipped };
};

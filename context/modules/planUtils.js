import { normalizeExcelDate, expandCompositeLineKey } from '../../utils';

/**
 * Генерирует уникальный ID для плана
 */
export const generatePlanId = () => `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Восстанавливает даты в таблице demand, нормализуя их для избежания проблем с часовым поясом
 */
export const restoreDemandDates = (demandTable) => {
    if (!Array.isArray(demandTable)) return demandTable;
    return demandTable.map((row, i) => {
        if (i === 0) return row;
        const dateVal = row[11];
        const normalized = normalizeExcelDate(dateVal);
        if (normalized) {
            row[11] = normalized;
        }
        return row;
    });
};

/**
 * Сериализует реестр работников для хранения (конвертирует Set в Array)
 */
export const serializeWorkerRegistry = (registry) => {
    const out = {};
    Object.entries(registry || {}).forEach(([key, value]) => {
        out[key] = { ...value, competencies: Array.from(value?.competencies || []) };
    });
    return out;
};

/**
 * Восстанавливает реестр работников из хранилища (конвертирует Array в Set)
 */
export const hydrateWorkerRegistry = (registry) => {
    const restored = {};
    Object.entries(registry || {}).forEach(([key, value]) => {
        restored[key] = {
            ...value,
            competencies: value?.competencies ? new Set(value.competencies) : new Set()
        };
    });
    return restored;
};

/**
 * Нормализует название роли для использования в ID
 */
export const normalizeManualRoleForId = (roleTitle) => {
    return String(roleTitle || 'role').replace(/\s+/g, '_');
};

/**
 * Создает ID для ручного слота
 */
export const createManualSlotId = (date, shiftId, lineId, roleTitle, index) => {
    const roleKey = normalizeManualRoleForId(roleTitle);
    return `${date}_${shiftId}_manual_${lineId}_${roleKey}_${index}`;
};

/**
 * Строит список ID слотов для ручной линии
 */
export const buildManualLineSlotIds = (date, shiftId, manualLine) => {
    if (!manualLine?.positions || manualLine.positions.length === 0) return [];
    const ids = [];
    manualLine.positions.forEach(pos => {
        const count = Math.max(1, parseInt(pos.count, 10) || 1);
        for (let idx = 0; idx < count; idx++) {
            ids.push(createManualSlotId(date, shiftId, manualLine.id, pos.roleTitle, idx));
        }
    });
    return ids;
};

/**
 * Составные ключи "Линия 1-2" раскладывает в "Линия 1" и "Линия 2" с одинаковым составом.
 */
export const normalizeLineTemplates = (templates) => {
    const result = {};
    Object.entries(templates || {}).forEach(([key, positions]) => {
        expandCompositeLineKey(key).forEach((atomic) => {
            result[atomic] = positions;
        });
    });
    return result;
};

/**
 * SlotId вида date_shift_lineName_role_index: составную линию раскладывает в отдельные ключи.
 */
export const normalizeManualAssignments = (assignments) => {
    const result = {};
    Object.entries(assignments || {}).forEach(([slotId, value]) => {
        const parts = slotId.split('_');
        if (parts.length >= 5) {
            const linePart = parts[2];
            const expanded = expandCompositeLineKey(linePart);
            expanded.forEach((atomic) => {
                const newParts = [...parts];
                newParts[2] = atomic;
                result[newParts.join('_')] = value;
            });
        } else {
            result[slotId] = value;
        }
    });
    return result;
};

/**
 * Нормализует данные плана, заполняя недостающие поля значениями по умолчанию
 */
export const normalizePlanData = (planData) => ({
    rawTables: planData.rawTables || {},
    scheduleDates: planData.scheduleDates || [],
    planHashes: planData.planHashes || {},
    lineTemplates: planData.lineTemplates || {},
    floaters: planData.floaters || { day: [], night: [] },
    workerRegistry: planData.workerRegistry || {},
    manualAssignments: planData.manualAssignments || {},
    manualLines: planData.manualLines || {},
    planningState: planData.planningState || null,
    autoReassignEnabled: planData.autoReassignEnabled
});


import { normalizeName, matchNames, cleanVal, extractShiftNumber, isLineMatch, normalizeExcelDate, formatDateLocal, expandCompositeLineKey } from '../../../utils';
import { emptySummary } from './reportsViewConstants';

export const normalizeManualRoleForId = (roleTitle) => String(roleTitle || 'role').replace(/\s+/g, '_');
export const createManualSlotId = (date, shiftId, lineId, roleTitle, index) => `${date}_${shiftId}_manual_${lineId}_${normalizeManualRoleForId(roleTitle)}_${index}`;

export function buildPlanLineDailyCounts(planData) {
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
    const splitNames = (val) => (!val ? [] : String(val).split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1));
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
                if (headerName) expandCompositeLineKey(headerName).forEach(lineKey => lineKey && activeLines.add(lineKey));
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
                    let name = manual?.type === 'vacancy' ? null : (manual?.name || baseName);
                    if (name) { lineBucket.filled += 1; lineBucket.unique.add(name); }
                }
            });
        });
        (manualLines?.[`${dateStr}_${shiftNum}`] || []).forEach(manualLine => {
            const lineBucket = ensureLine(dateStr, manualLine.displayName || manualLine.id);
            (manualLine.positions || []).forEach(pos => {
                const count = Math.max(1, parseInt(pos.count, 10) || 1);
                for (let idx = 0; idx < count; idx++) {
                    const slotId = createManualSlotId(dateStr, shiftNum, manualLine.id, pos.roleTitle || pos.role, idx);
                    const manual = assignments[slotId];
                    const name = manual?.type === 'vacancy' ? null : (manual?.name || null);
                    if (name) { lineBucket.filled += 1; lineBucket.unique.add(name); }
                }
            });
        });
    });
    const output = {};
    result.forEach((lineMap, dateStr) => {
        output[dateStr] = {};
        lineMap.forEach((value, lineName) => { output[dateStr][lineName] = { filled: value.filled, unique: value.unique.size }; });
    });
    return output;
}

export function buildSummaryFromRows(rows) {
    const summary = emptySummary();
    (rows || []).forEach(row => { if (row?.changeType) summary[row.changeType] = (summary[row.changeType] || 0) + 1; });
    return summary;
}

export const getSurnameNorm = (fullName) => normalizeName(String(fullName || '').trim().split(/\s+/)[0] || '');

export function buildFactMap(dayFact) {
    if (!dayFact) return { byNormKey: new Map(), byNormRawName: new Map(), bySurname: new Map() };
    const byNormKey = new Map(), byNormRawName = new Map(), bySurname = new Map();
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
}

export function resolveFactEntry(planName, factMap) {
    if (!planName || !factMap) return null;
    const normName = normalizeName(planName);
    let factEntry = factMap.byNormKey.get(normName) || factMap.byNormRawName.get(normName);
    if (factEntry) return factEntry;
    const surname = getSurnameNorm(planName);
    const candidates = factMap.bySurname.get(surname) || [];
    for (const candidate of candidates) { if (candidate?.rawName && matchNames(planName, candidate.rawName)) return candidate; }
    return null;
}

export const formatFactTime = (factEntry) => {
    if (!factEntry) return '—';
    if (factEntry.hasOvernightShift && factEntry.nextDayExit) return `${factEntry.entryTime} → ${factEntry.nextDayExit} (+1)`;
    if (factEntry.hasOvernightShift) return `Вход: ${factEntry.entryTime} (ночная)`;
    if (factEntry.entryTime && !factEntry.exitTime) return `Вход: ${factEntry.entryTime}`;
    if (factEntry.entryTime && factEntry.exitTime) return `${factEntry.entryTime} → ${factEntry.exitTime}`;
    return factEntry.time || '—';
};

export const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

const STANDARD_SHIFT_HOURS = 12;
export function computeOvertimeHours(factEntry) {
    if (!factEntry) return 0;
    const entryM = parseTimeToMinutes(factEntry.entryTime);
    const exitM = parseTimeToMinutes(factEntry.exitTime);
    const nextExitM = parseTimeToMinutes(factEntry.nextDayExit);
    if (factEntry.hasOvernightShift && nextExitM != null) {
        if (entryM == null) return 0;
        const durationM = (24 * 60 - entryM) + nextExitM;
        return Math.max(0, durationM / 60 - STANDARD_SHIFT_HOURS);
    }
    if (entryM != null && exitM != null) {
        let durationM = exitM - entryM;
        if (durationM < 0) durationM += 24 * 60;
        return Math.max(0, durationM / 60 - STANDARD_SHIFT_HOURS);
    }
    return 0;
}

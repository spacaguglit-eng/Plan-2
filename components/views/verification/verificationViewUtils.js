import { normalizeName, matchNames, parseCellStrict } from '../../../utils';

const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;

export const getSurnameNorm = (fullName) => {
    const first = String(fullName || '').trim().split(/\s+/)[0] || '';
    return normalizeName(first);
};

function isGarbageRow(row) {
    if (!row || row.length === 0) return true;
    const firstFewCells = row.slice(0, 5).join(' ').toLowerCase();
    return firstFewCells.includes('отчет') ||
        firstFewCells.includes('период с') ||
        firstFewCells.includes('страница');
}

function detectDateHeader(row, allDatesSet) {
    const dateMap = {};
    row.forEach((cell, colIdx) => {
        if (typeof cell === 'string') {
            const trimmed = cell.trim();
            if (dateRegex.test(trimmed)) {
                dateMap[colIdx] = trimmed;
                allDatesSet.add(trimmed);
            }
        }
    });
    return Object.keys(dateMap).length > 0 ? dateMap : null;
}

function detectEmployeeRow(row) {
    if (!row || row.length < 5) return null;
    let seqNumFound = false;
    for (let i = 0; i < Math.min(3, row.length); i++) {
        const cell = String(row[i] || '').trim();
        if (cell && /^\d+$/.test(cell)) {
            seqNumFound = true;
            break;
        }
    }
    if (!seqNumFound) return null;
    let name = null;
    for (let i = 2; i < Math.min(7, row.length); i++) {
        const cell = String(row[i] || '').trim();
        if (cell && cell.length >= 3 && !dateRegex.test(cell) && !/^\d+$/.test(cell)) {
            if (/[а-яА-Яa-zA-Z]/.test(cell)) {
                name = cell;
                break;
            }
        }
    }
    return name || null;
}

/**
 * Parse XLSX sheet data (array of rows) into parsedFact and allDates.
 * @param {Array<Array>} data - sheet_to_json(ws, { header: 1 })
 * @returns {{ parsedFact: object, allDates: string[] }}
 */
export function parseSheetDataToFact(data) {
    const dataStore = {};
    let currentDateMap = {};
    const allDatesSet = new Set();

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (isGarbageRow(row)) continue;

        const dateMap = detectDateHeader(row, allDatesSet);
        if (dateMap) {
            currentDateMap = dateMap;
            continue;
        }

        const employeeName = detectEmployeeRow(row);
        if (employeeName) {
            const normName = normalizeName(employeeName);
            if (!dataStore[normName]) {
                dataStore[normName] = { rawName: employeeName, dates: {} };
            }
            Object.entries(currentDateMap).forEach(([colIdxStr, date]) => {
                const colIdx = parseInt(colIdxStr, 10);
                if (colIdx < row.length) {
                    const timeVal = row[colIdx];
                    if (timeVal !== null && timeVal !== undefined && timeVal !== '') {
                        const timeStr = String(timeVal).trim().toLowerCase();
                        if (timeStr !== 'нет' && timeStr.length > 0) {
                            if (!dataStore[normName].dates[date] || dataStore[normName].dates[date] === '') {
                                dataStore[normName].dates[date] = String(timeVal);
                            }
                        }
                    }
                }
            });
        }
    }

    if (allDatesSet.size === 0) {
        throw new Error('Не удалось найти даты в файле (формат ДД.ММ.ГГГГ)');
    }

    const parsedFact = {};
    const allDates = Array.from(allDatesSet).sort();
    allDates.forEach(date => { parsedFact[date] = {}; });

    Object.values(dataStore).forEach(({ rawName, dates }) => {
        const normName = normalizeName(rawName);
        const timelineData = Object.entries(dates).map(([date, val]) => ({ date, val }));
        timelineData.sort((a, b) => {
            const [dA, mA, yA] = a.date.split('.').map(Number);
            const [dB, mB, yB] = b.date.split('.').map(Number);
            const dateA = new Date(yA, mA - 1, dA);
            const dateB = new Date(yB, mB - 1, dB);
            return dateA - dateB;
        });

        let pendingShift = null;
        timelineData.forEach((event) => {
            const { date, val } = event;
            const { inTime, outTime } = parseCellStrict(val);
            if (!parsedFact[date]) parsedFact[date] = {};

            if (pendingShift) {
                if (outTime) {
                    const shiftDate = pendingShift.date;
                    if (!parsedFact[shiftDate]) parsedFact[shiftDate] = {};
                    parsedFact[shiftDate][normName] = {
                        rawName,
                        time: `${pendingShift.time} → ${outTime} (+1)`,
                        cleanTime: `${pendingShift.time} → ${outTime} (+1)`,
                        entryTime: pendingShift.time,
                        exitTime: null,
                        hasOvernightShift: true,
                        nextDayExit: outTime,
                        nextDayDate: date,
                        primaryDate: shiftDate
                    };
                    pendingShift = null;
                    if (inTime) {
                        pendingShift = { time: inTime, date: date };
                        parsedFact[date][normName] = {
                            rawName,
                            time: `Вход: ${inTime}...`,
                            cleanTime: `Вход: ${inTime}`,
                            entryTime: inTime,
                            exitTime: null,
                            hasOvernightShift: true
                        };
                    }
                } else if (inTime) {
                    pendingShift = { time: inTime, date: date };
                    parsedFact[date][normName] = {
                        rawName,
                        time: `Вход: ${inTime}...`,
                        cleanTime: `Вход: ${inTime}`,
                        entryTime: inTime,
                        exitTime: null,
                        hasOvernightShift: true
                    };
                }
                return;
            }

            if (inTime && outTime) {
                parsedFact[date][normName] = {
                    rawName,
                    time: `${inTime} → ${outTime}`,
                    cleanTime: `${inTime} → ${outTime}`,
                    entryTime: inTime,
                    exitTime: outTime,
                    hasOvernightShift: false
                };
                pendingShift = null;
            } else if (inTime && !outTime) {
                pendingShift = { time: inTime, date: date };
                parsedFact[date][normName] = {
                    rawName,
                    time: `Вход: ${inTime}...`,
                    cleanTime: `Вход: ${inTime}`,
                    entryTime: inTime,
                    exitTime: null,
                    hasOvernightShift: true
                };
            }
        });
    });

    return { parsedFact, allDates };
}

export function buildFactMap(dayFact, getSurnameNormFn) {
    if (!dayFact) return null;
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
            const surname = getSurnameNormFn(value.rawName);
            if (!bySurname.has(surname)) bySurname.set(surname, []);
            bySurname.get(surname).push(value);
        }
    });
    return { byNormKey, byNormRawName, bySurname };
}

export function computeComparisonResult({
    getShiftsForDate,
    selectedDate,
    dayFact,
    factMap,
    getDepartment,
    workerRegistryMap,
    getSurnameNormFn
}) {
    if (!selectedDate || !dayFact || !factMap) return [];
    const shifts = getShiftsForDate(selectedDate);
    const result = [];
    const processedFactNames = new Set();
    const processedBySurname = new Map();

    const markProcessed = (rawName) => {
        if (!rawName) return;
        const norm = normalizeName(rawName);
        processedFactNames.add(norm);
        const surname = getSurnameNormFn(rawName);
        if (!processedBySurname.has(surname)) processedBySurname.set(surname, []);
        processedBySurname.get(surname).push(rawName);
    };

    const resolveFactEntry = (planName) => {
        const normNameForMatch = normalizeName(planName);
        let factEntry = factMap.byNormKey.get(normNameForMatch) || factMap.byNormRawName.get(normNameForMatch);
        if (factEntry) return factEntry;
        const surname = getSurnameNormFn(planName);
        const candidates = factMap.bySurname.get(surname) || [];
        for (const candidate of candidates) {
            if (candidate?.rawName && matchNames(planName, candidate.rawName)) return candidate;
        }
        return null;
    };

    shifts.forEach(shift => {
        shift.lineTasks.forEach(task => {
            task.slots.forEach(slot => {
                if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                    const planName = slot.assigned.name;
                    const factEntry = resolveFactEntry(planName);
                    if (factEntry?.rawName) markProcessed(factEntry.rawName);

                    let status = 'ok';
                    let timeDisplay = factEntry ? factEntry.time : '-';
                    if (!factEntry || !factEntry.cleanTime) {
                        status = 'missing';
                    } else if (factEntry.hasOvernightShift && factEntry.nextDayExit) {
                        timeDisplay = `${factEntry.entryTime} → ${factEntry.nextDayExit} (+1)`;
                    } else if (factEntry.hasOvernightShift) {
                        timeDisplay = `Вход: ${factEntry.entryTime} (ночная)`;
                    } else if (factEntry.entryTime && !factEntry.exitTime) {
                        timeDisplay = `Вход: ${factEntry.entryTime}`;
                    } else if (factEntry.entryTime && factEntry.exitTime) {
                        timeDisplay = `${factEntry.entryTime} → ${factEntry.exitTime}`;
                    } else {
                        timeDisplay = factEntry.time;
                    }

                    const department = getDepartment(planName);
                    result.push({
                        name: planName,
                        role: slot.roleTitle,
                        shift: shift.name,
                        line: task.displayName,
                        plan: true,
                        fact: !!(factEntry && factEntry.cleanTime),
                        time: timeDisplay,
                        status,
                        details: slot.assigned,
                        timeInfo: factEntry,
                        department
                    });
                }
            });
        });
    });

    Object.values(dayFact).forEach(entry => {
        if (!entry || !entry.rawName) return;
        const normName = normalizeName(entry.rawName);
        let wasProcessed = processedFactNames.has(normName);
        if (!wasProcessed) {
            const surname = getSurnameNormFn(entry.rawName);
            const processedCandidates = processedBySurname.get(surname) || [];
            for (const processedName of processedCandidates) {
                if (matchNames(entry.rawName, processedName)) {
                    wasProcessed = true;
                    break;
                }
            }
        }
        if (!wasProcessed && entry.cleanTime) {
            let regEntry = workerRegistryMap.byNorm.get(normName);
            if (!regEntry) {
                const surname = getSurnameNormFn(entry.rawName);
                const candidates = workerRegistryMap.bySurname.get(surname) || [];
                for (const worker of candidates) {
                    if (matchNames(worker.name, entry.rawName)) {
                        regEntry = worker;
                        break;
                    }
                }
            }
            let timeDisplay = entry.time;
            if (entry.hasOvernightShift && entry.nextDayExit) {
                timeDisplay = `${entry.entryTime} → ${entry.nextDayExit} (+1)`;
            } else if (entry.hasOvernightShift) {
                timeDisplay = `Вход: ${entry.entryTime} (ночная)`;
            } else if (entry.entryTime && entry.exitTime) {
                timeDisplay = `${entry.entryTime} → ${entry.exitTime}`;
            } else if (entry.entryTime && !entry.exitTime) {
                timeDisplay = `Вход: ${entry.entryTime}`;
            }
            const department = getDepartment(entry.rawName);
            result.push({
                name: entry.rawName,
                role: regEntry ? regEntry.role : 'Неизвестно',
                shift: '-',
                line: '-',
                plan: false,
                fact: true,
                time: timeDisplay,
                status: 'unexpected',
                details: regEntry,
                timeInfo: entry,
                department
            });
        }
    });

    return result;
}

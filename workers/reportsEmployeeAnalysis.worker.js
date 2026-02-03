const normalizeName = (name) => {
    return String(name).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я]/g, '');
};

const matchNames = (name1, name2) => {
    if (!name1 || !name2) return false;
    const n1 = String(name1).toLowerCase().trim();
    const n2 = String(name2).toLowerCase().trim();
    if (normalizeName(n1) === normalizeName(n2)) return true;
    const parts1 = n1.split(/\s+/).filter(p => p.length > 0);
    const parts2 = n2.split(/\s+/).filter(p => p.length > 0);
    if (parts1.length === 0 || parts2.length === 0) return false;
    const surname1 = normalizeName(parts1[0]);
    const surname2 = normalizeName(parts2[0]);
    if (surname1 !== surname2) return false;
    if (parts1.length === 1 && parts2.length === 1) return true;
    const firstName1 = parts1.length >= 2 ? parts1[1].replace(/\./g, '').trim() : '';
    const firstName2 = parts2.length >= 2 ? parts2[1].trim() : '';
    const middleName1 = parts1.length >= 3 ? parts1[2].replace(/\./g, '').trim() : '';
    const middleName2 = parts2.length >= 3 ? parts2[2].trim() : '';
    let firstNameMatch = false;
    if (firstName1 && firstName2) {
        if ((firstName1.length === 1 && firstName2.length > 1) || (firstName1.length > 1 && firstName2.length === 1) || (firstName1[0] === firstName2[0])) {
            firstNameMatch = firstName1[0] === firstName2[0];
        }
    } else if (!firstName1 && !firstName2) {
        firstNameMatch = true;
    }
    let middleNameMatch = false;
    if (middleName1 && middleName2) {
        if ((middleName1.length === 1 && middleName2.length > 1) || (middleName1.length > 1 && middleName2.length === 1) || (middleName1[0] === middleName2[0])) {
            middleNameMatch = middleName1[0] === middleName2[0];
        }
    } else if (!middleName1 && !middleName2) {
        middleNameMatch = true;
    } else if ((!middleName1 && middleName2) || (middleName1 && !middleName2)) {
        middleNameMatch = true;
    }
    if (firstNameMatch) {
        if (middleName1 || middleName2) return middleNameMatch;
        return true;
    }
    if (firstName1 && firstName2 && firstName1[0] === firstName2[0]) return true;
    return false;
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
    const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})$/);
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
        return Math.max(0, durationM / 60 - STANDARD_SHIFT_HOURS);
    }
    if (entryM != null && exitM != null) {
        let durationM = exitM - entryM;
        if (durationM < 0) durationM += 24 * 60;
        return Math.max(0, durationM / 60 - STANDARD_SHIFT_HOURS);
    }
    return 0;
};

function computeExtendedHierarchy(employeeHierarchy, factData) {
    if (!factData || typeof factData !== 'object') return employeeHierarchy;
    const planDateSet = new Set();
    (employeeHierarchy || []).forEach(worker => {
        (worker.dates || []).forEach(dateNode => {
            planDateSet.add(`${normalizeName(worker.name)}__${dateNode.date}`);
        });
    });
    const planWorkerNames = (employeeHierarchy || []).map(w => w.name);
    const skudOnlyByCanonical = new Map();
    Object.entries(factData).forEach(([date, dayFact]) => {
        if (!dayFact || typeof dayFact !== 'object') return;
        Object.entries(dayFact).forEach(([, value]) => {
            if (!value?.rawName) return;
            const rawName = value.rawName;
            let canonicalName = rawName;
            for (const planName of planWorkerNames) {
                if (matchNames(rawName, planName)) {
                    canonicalName = planName;
                    break;
                }
            }
            const keySet = `${normalizeName(canonicalName)}__${date}`;
            if (planDateSet.has(keySet)) return;
            if (!skudOnlyByCanonical.has(canonicalName)) skudOnlyByCanonical.set(canonicalName, []);
            skudOnlyByCanonical.get(canonicalName).push({ date, factEntry: value });
        });
    });
    const withSkudDates = (employeeHierarchy || []).map(worker => {
        const extraDates = [];
        skudOnlyByCanonical.forEach((items, canonicalName) => {
            if (!matchNames(worker.name, canonicalName)) return;
            items.forEach(({ date }) => {
                extraDates.push({
                    date,
                    shifts: [{
                        shiftId: 'skud',
                        shiftName: '—',
                        rows: [{
                            lineName: '—',
                            roleTitle: '—',
                            planName: '',
                            factName: worker.name,
                            changeType: 'skud_only',
                            date,
                            shiftLabel: '—',
                            note: 'Выход вне графика'
                        }]
                    }]
                });
            });
        });
        const dates = [...(worker.dates || []), ...extraDates].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        return { ...worker, dates };
    });
    const matchedCanonical = new Set();
    (employeeHierarchy || []).forEach(worker => {
        skudOnlyByCanonical.forEach((_, canonicalName) => {
            if (matchNames(worker.name, canonicalName)) matchedCanonical.add(canonicalName);
        });
    });
    const newWorkers = [];
    skudOnlyByCanonical.forEach((items, canonicalName) => {
        if (matchedCanonical.has(canonicalName)) return;
        const dates = items.map(({ date }) => ({
            date,
            shifts: [{
                shiftId: 'skud',
                shiftName: '—',
                rows: [{
                    lineName: '—',
                    roleTitle: '—',
                    planName: '',
                    factName: canonicalName,
                    changeType: 'skud_only',
                    date,
                    shiftLabel: '—',
                    note: 'Выход вне графика'
                }]
            }]
        })).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        newWorkers.push({ name: canonicalName, dates });
    });
    return [...withSkudDates, ...newWorkers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

self.onmessage = (e) => {
    const { requestId, employeeHierarchy, factData, factDates } = e.data || {};
    try {
        const factMapsByDate = {};
        if (factData && typeof factData === 'object') {
            const dates = factDates && factDates.length ? factDates : Object.keys(factData);
            dates.forEach(d => {
                if (factData[d]) factMapsByDate[d] = buildFactMap(factData[d]);
            });
        }
        const extendedEmployeeHierarchy = computeExtendedHierarchy(employeeHierarchy || [], factData);
        const skudCacheArray = [];
        extendedEmployeeHierarchy.forEach(worker => {
            (worker.dates || []).forEach(dateNode => {
                const date = dateNode.date;
                const factMap = factMapsByDate[date];
                const fact = resolveFactEntry(worker.name, factMap || { byNormKey: new Map(), byNormRawName: new Map(), bySurname: new Map() });
                const status = fact ? (fact.cleanTime ? 'ok' : 'missing') : 'unassigned';
                const timeDisplay = formatFactTime(fact);
                const overtimeHours = computeOvertimeHours(fact);
                skudCacheArray.push({
                    key: `${normalizeName(worker.name)}__${date}`,
                    status,
                    timeDisplay,
                    overtimeHours
                });
            });
        });
        self.postMessage({
            requestId,
            extendedEmployeeHierarchy,
            skudCacheArray
        });
    } catch (err) {
        self.postMessage({
            requestId,
            error: err?.message || String(err)
        });
    }
};

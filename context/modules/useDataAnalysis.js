import {
    cleanVal,
    extractShiftNumber,
    normalizeExcelDate,
    formatDateLocal,
    expandCompositeLineKey,
    cyrb53,
    parseWorkerStatus,
    isLineMatch
} from '../../utils';

/**
 * Предварительный анализ справочника для извлечения шаблонов линий
 */
export const preAnalyzeRoster = (rosterData) => {
    const templates = {};
    let lastLineName = '';
    rosterData.slice(1).forEach(row => {
        let lineName = cleanVal(row[4]);
        const role = cleanVal(row[5]);
        if (!lineName && role && lastLineName) lineName = lastLineName;
        if (lineName) lastLineName = lineName;
        const countVal = cleanVal(row[6]);
        if (lineName && role && !role.toLowerCase().includes('подсобник')) {
            const entry = { role, count: parseInt(countVal) || 1 };
            expandCompositeLineKey(lineName).forEach((atomic) => {
                if (!templates[atomic]) templates[atomic] = [];
                templates[atomic].push(entry);
            });
        }
    });
    return { templates };
};

/**
 * Чистый анализ данных (без side effects) - извлекает структуру из Excel данных
 */
export const analyzeDataPure = (demandData, rosterData) => {
    const rawDates = demandData.slice(1).map(row => {
        return normalizeExcelDate(row[11]);
    }).filter(d => d);

    const uniqueTimestamps = [...new Set(rawDates.map(d => d.getTime()))].sort((a, b) => a - b);
    // Форматируем дату без учета часового пояса
    const sortedStringDates = uniqueTimestamps.map(ts => formatDateLocal(new Date(ts)));

    const templates = {};
    const floaterMap = { day: new Map(), night: new Map() };
    const registry = {};
    let lastLineName = '';

    rosterData.slice(1).forEach((row, rowIdx) => {
        let lineName = cleanVal(row[4]);
        const role = cleanVal(row[5]);
        if (!lineName && role && lastLineName) lineName = lastLineName;
        if (lineName) lastLineName = lineName;

        const countVal = cleanVal(row[6]);
        const roleLower = role.toLowerCase();
        const shiftConfig = [
            { id: '1', n: 7, c: 8, s: 9 },
            { id: '2', n: 10, c: 11, s: 12 },
            { id: '3', n: 13, c: 14, s: 15 },
            { id: '4', n: 16, c: 17, s: 18 }
        ];

        if (roleLower.includes('подсобник') && countVal.length > 2 && !/^\d+$/.test(countVal)) {
            const names = countVal.split(/[,;\n]+/).map(n => n.trim()).filter(n => n.length > 1);
            let context = roleLower.includes('ночь') ? 'night' : 'day';
            names.forEach(name => {
                const uniqueKey = name.replace(/\./g, '').trim().toLowerCase();
                if (!floaterMap[context].has(uniqueKey)) {
                    floaterMap[context].set(uniqueKey, {
                        name, role, type: 'floater', shiftContext: context, id: `floater_${context}_${uniqueKey}`
                    });
                }
            });
            return;
        }

        if (lineName && role) {
            const atomicLines = expandCompositeLineKey(lineName);
            const homeLine = atomicLines[0];
            const rosterMap = {};
            shiftConfig.forEach(cfg => {
                const rawName = cleanVal(row[cfg.n]);
                const rawComp = cleanVal(row[cfg.c]);
                const rawStat = cleanVal(row[cfg.s]);
                if (rawName) {
                    rosterMap[cfg.id] = rawName;
                    const names = rawName.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1);
                    names.forEach(name => {
                        const parsedStatus = parseWorkerStatus(rawStat);
                        const comps = rawComp ? rawComp.split(/[,;]+/).map(s => s.trim()) : [];
                        const hasFiveDay = rawStat && String(rawStat).toLowerCase().includes('пятидневк');
                        if (!registry[name]) {
                            registry[name] = { name, role, homeLine, competencies: new Set(comps), status: parsedStatus, fiveDay: hasFiveDay };
                        } else {
                            comps.forEach(c => registry[name].competencies.add(c));
                            if (!registry[name].status && parsedStatus) registry[name].status = parsedStatus;
                            if (hasFiveDay) registry[name].fiveDay = true;
                        }
                    });
                }
            });
            const entry = { role, count: parseInt(countVal) || 1, roster: rosterMap };
            atomicLines.forEach((atomic) => {
                if (!templates[atomic]) {
                    templates[atomic] = [];
                }
                templates[atomic].push(entry);
            });
        }
    });

    return {
        scheduleDates: sortedStringDates,
        lineTemplates: templates,
        floaters: { day: Array.from(floaterMap.day.values()), night: Array.from(floaterMap.night.values()) },
        workerRegistry: registry
    };
};

/**
 * Анализ данных с обновлением состояния (требует сеттеры)
 */
export const createAnalyzeData = ({
    setScheduleDates,
    setLineTemplates,
    setFloaters,
    setWorkerRegistry,
    setSelectedDate,
    persistStateKey,
    STORAGE_KEYS
}) => {
    return (demandData, rosterData) => {
        const result = analyzeDataPure(demandData, rosterData);
        const { scheduleDates: sortedStringDates, lineTemplates: templates, floaters: nextFloaters, workerRegistry: registry } = result;

        setScheduleDates(sortedStringDates);
        persistStateKey(STORAGE_KEYS.SCHEDULE_DATES, sortedStringDates);
        if (sortedStringDates.length > 0) setSelectedDate(prev => sortedStringDates.includes(prev) ? prev : sortedStringDates[0]);

        setLineTemplates(templates);
        setFloaters(nextFloaters);
        setWorkerRegistry(registry);

        persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, templates);
        persistStateKey(STORAGE_KEYS.FLOATERS, nextFloaters);
        const registryForStorage = {};
        Object.entries(registry).forEach(([key, value]) => {
            registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
        });
        persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
    };
};

/**
 * Генерирует хеш для смены на основе даты, номера смены, типа и активных линий
 */
export const generateShiftHash = (dateStr, shiftNum, shiftType, activeLines, templates) => {
    const linesFingerprint = activeLines.sort().map(lineName => {
        const templateName = Object.keys(templates).find(t => isLineMatch(lineName, t));
        const positions = templateName ? templates[templateName] : [];
        const positionsStr = positions.map(p => `${p.role}:${p.count}`).sort().join('|');
        return `${lineName}(${positionsStr})`;
    }).join(';');
    return cyrb53(`${dateStr}|${shiftNum}|${shiftType}|${linesFingerprint}`);
};

/**
 * Строит хеши планов на основе данных demand и шаблонов
 */
export const buildPlanHashes = (demandData, templates) => {
    const newHashes = {};
    const headers = demandData[0];
    demandData.slice(1).forEach(row => {
        const normalizedDate = normalizeExcelDate(row[11]);
        if (!normalizedDate) return;
        const dateStr = formatDateLocal(normalizedDate);

        const shiftNum = extractShiftNumber(cleanVal(row[14]));
        const shiftType = cleanVal(row[13]);
        if (!shiftNum) return;

        const activeLines = [];
        for (let i = 15; i <= 26; i++) {
            if ((parseInt(row[i]) || 0) > 0) activeLines.push(cleanVal(headers[i]));
        }
        const hash = generateShiftHash(dateStr, shiftNum, shiftType, activeLines, templates);
        newHashes[`${dateStr}_${shiftNum}`] = hash;
    });
    return newHashes;
};


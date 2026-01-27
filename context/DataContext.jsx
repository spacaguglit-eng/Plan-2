import React, { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { useNotification } from '../components/common/Toast.jsx';
import {
    STORAGE_KEYS,
    saveToLocalStorage,
    loadFromLocalStorage,
    debounce,
    cleanVal,
    extractShiftNumber,
    normalizeName,
    matchNames,
    isLineMatch,
    cyrb53,
    parseWorkerStatus,
    checkWorkerAvailability,
    parseCellStrict,
    formatDateLocal,
    normalizeExcelDate
} from '../utils';

const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
    // --- STATE ---
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(true);
    const [error, setError] = useState('');
    const [syncStatus, setSyncStatus] = useState('idle');

    const [rawTables, setRawTables] = useState({});
    const [scheduleDates, setScheduleDates] = useState([]);
    const [planHashes, setPlanHashes] = useState({});

    // Multi-plan management
    const [savedPlans, setSavedPlans] = useState(() => loadFromLocalStorage(STORAGE_KEYS.SAVED_PLANS, []));
    const [currentPlanId, setCurrentPlanId] = useState(() => loadFromLocalStorage(STORAGE_KEYS.CURRENT_PLAN_ID, null));
    const [isLocked, setIsLocked] = useState(false);

    const [lineTemplates, setLineTemplates] = useState({});
    const [floaters, setFloaters] = useState({ day: [], night: [] });
    const [workerRegistry, setWorkerRegistry] = useState({});

    const [step, setStep] = useState('upload');
    const [viewMode, setViewMode] = useState('dashboard');
    const [selectedDate, setSelectedDate] = useState('');
    
    // UI State that needs to be global
    const [targetScrollBrigadeId, setTargetScrollBrigadeId] = useState(null);
    const [manualAssignments, setManualAssignments] = useState({});
    const [draggedWorker, setDraggedWorker] = useState(null);
    const [updateReport, setUpdateReport] = useState(null);
    const [rvModalData, setRvModalData] = useState(null);
    const [editingWorker, setEditingWorker] = useState(null);

    // Chess Table Filters (Global needed for export functions)
    const [chessFilterShift, setChessFilterShift] = useState('all');
    const [chessSearch, setChessSearch] = useState('');
    const [isGlobalFill, setIsGlobalFill] = useState(false);
    const [autoReassignEnabled, setAutoReassignEnabled] = useState(() => loadFromLocalStorage(STORAGE_KEYS.AUTO_REASSIGN_ENABLED, true));
    const [chessDisplayLimit, setChessDisplayLimit] = useState(50);

    // Chess Table (Worker offload)
    const USE_CHESS_WORKER = true;
    const [chessTableWorkerResult, setChessTableWorkerResult] = useState(null);
    const [chessTableWorkerStatus, setChessTableWorkerStatus] = useState({ status: 'idle', error: null, requestId: 0 });
    const chessTableWorkerRef = useRef(null);
    const chessTableWorkerReqIdRef = useRef(0);

    // Verification (SCUD)
    const [factData, setFactData] = useState(null);
    const [factDates, setFactDates] = useState([]);

    const { notify } = useNotification();

    const fileInputRef = useRef(null);
    const syncTimeoutRef = useRef(null);
    const isLoadingPlanRef = useRef(false);

    const TARGET_CONFIG = useMemo(() => ([
        { tableName: 'Сводная_По_Людям', expectedSheet: 'Расписание по сменам', type: 'demand' },
        { tableName: 'Люд', expectedSheet: 'Справочник', type: 'roster' }
    ]), []);

    const unlockWithCode = useCallback((code) => {
        if (code === '1234') {
            setIsLocked(false);
            return true;
        }
        return false;
    }, []);

    const generatePlanId = () => `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const restoreDemandDates = (demandTable) => {
        if (!Array.isArray(demandTable)) return demandTable;
        return demandTable.map((row, i) => {
            if (i === 0) return row;
            const dateVal = row[11];
            // Нормализуем дату для избежания проблем с часовым поясом
            const normalized = normalizeExcelDate(dateVal);
            if (normalized) {
                row[11] = normalized;
            }
            return row;
        });
    };

    const serializeWorkerRegistry = (registry) => {
        const out = {};
        Object.entries(registry || {}).forEach(([key, value]) => {
            out[key] = { ...value, competencies: Array.from(value?.competencies || []) };
        });
        return out;
    };

    const hydrateWorkerRegistry = (registry) => {
        const restored = {};
        Object.entries(registry || {}).forEach(([key, value]) => {
            restored[key] = {
                ...value,
                competencies: value?.competencies ? new Set(value.competencies) : new Set()
            };
        });
        return restored;
    };

    const buildPlanSnapshot = useCallback(() => ({
        rawTables,
        scheduleDates,
        planHashes,
        lineTemplates,
        floaters,
        workerRegistry: serializeWorkerRegistry(workerRegistry),
        manualAssignments
    }), [rawTables, scheduleDates, planHashes, lineTemplates, floaters, workerRegistry, manualAssignments]);

    const applyPlanData = (planData) => {
        if (!planData) return;
        const nextRaw = { ...(planData.rawTables || {}) };
        if (nextRaw.demand) nextRaw.demand = restoreDemandDates(nextRaw.demand);

        setRawTables(nextRaw);
        setScheduleDates(planData.scheduleDates || []);
        setPlanHashes(planData.planHashes || {});
        setLineTemplates(planData.lineTemplates || {});
        setFloaters(planData.floaters || { day: [], night: [] });
        setWorkerRegistry(hydrateWorkerRegistry(planData.workerRegistry || {}));
        setManualAssignments(planData.manualAssignments || {});
        if (planData.scheduleDates?.length > 0) {
            setSelectedDate(prev => planData.scheduleDates.includes(prev) ? prev : planData.scheduleDates[0]);
        }
        setStep('dashboard');
    };

    // --- EFFECT: LOAD FROM LOCAL STORAGE ---
    useEffect(() => {
        const restoreData = () => {
            setRestoring(true);
            try {
                const storedPlans = loadFromLocalStorage(STORAGE_KEYS.SAVED_PLANS, []);
                const storedCurrentPlanId = loadFromLocalStorage(STORAGE_KEYS.CURRENT_PLAN_ID, null);
                if (Array.isArray(storedPlans) && storedPlans.length > 0) {
                    setSavedPlans(storedPlans);
                    const preferredId = storedCurrentPlanId || storedPlans.find(p => p.type === 'Operational')?.id || storedPlans[0].id;
                    setCurrentPlanId(preferredId);
                    const selectedPlan = storedPlans.find(p => p.id === preferredId);
                    if (selectedPlan?.data) {
                        isLoadingPlanRef.current = true;
                        applyPlanData(selectedPlan.data);
                        isLoadingPlanRef.current = false;
                    } else {
                        // Есть планы, но нет данных в выбранном - переходим в менеджер планов
                        setStep('dashboard');
                        setViewMode('plans');
                    }
                } else {
                    // Нет планов - проверяем старые данные для миграции
                    const savedTables = loadFromLocalStorage(STORAGE_KEYS.RAW_TABLES, {});
                    if (savedTables.demand && savedTables.roster) {
                        // Миграция старых данных в план
                        if (savedTables.demand) {
                            savedTables.demand = restoreDemandDates(savedTables.demand);
                        }
                        setRawTables(savedTables);
                        
                        const analysis = analyzeDataPure(savedTables.demand, savedTables.roster);
                        const { templates: preTemplates } = preAnalyzeRoster(savedTables.roster);
                        const newHashes = buildPlanHashes(savedTables.demand, preTemplates);
                        
                        setScheduleDates(analysis.scheduleDates);
                        setLineTemplates(analysis.lineTemplates);
                        setFloaters(analysis.floaters);
                        setWorkerRegistry(hydrateWorkerRegistry(serializeWorkerRegistry(analysis.workerRegistry)));
                        setPlanHashes(newHashes);
                        
                        const savedAssignments = loadFromLocalStorage(STORAGE_KEYS.MANUAL_ASSIGNMENTS, {});
                        setManualAssignments(savedAssignments);
                        
                        if (analysis.scheduleDates.length > 0) {
                            setSelectedDate(analysis.scheduleDates[0]);
                        }
                        
                        // Создаём план из мигрированных данных
                        const createdAt = new Date().toISOString();
                        const migratedPlan = {
                            id: generatePlanId(),
                            name: `Миграция ${createdAt.slice(0, 10)}`,
                            createdAt,
                            type: 'Operational',
                            data: {
                                rawTables: savedTables,
                                scheduleDates: analysis.scheduleDates,
                                planHashes: newHashes,
                                lineTemplates: analysis.lineTemplates,
                                floaters: analysis.floaters,
                                workerRegistry: serializeWorkerRegistry(analysis.workerRegistry),
                                manualAssignments: savedAssignments
                            }
                        };
                        setSavedPlans([migratedPlan]);
                        setCurrentPlanId(migratedPlan.id);
                        setStep('dashboard');
                    } else {
                        // Нет планов и нет данных - переходим в менеджер планов
                        setStep('dashboard');
                        setViewMode('plans');
                    }
                }

                const savedFactData = loadFromLocalStorage(STORAGE_KEYS.FACT_DATA, null);
                const savedFactDates = loadFromLocalStorage(STORAGE_KEYS.FACT_DATES, []);
                if (savedFactData && Object.keys(savedFactData).length > 0) setFactData(savedFactData);
                if (savedFactDates.length > 0) setFactDates(savedFactDates);

            } catch (err) {
                console.error('Error restoring data:', err);
            } finally {
                setRestoring(false);
            }
        };
        restoreData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (restoring) return;
        saveToLocalStorage(STORAGE_KEYS.SAVED_PLANS, savedPlans);
    }, [savedPlans, restoring]);

    useEffect(() => {
        if (restoring) return;
        saveToLocalStorage(STORAGE_KEYS.CURRENT_PLAN_ID, currentPlanId);
    }, [currentPlanId, restoring]);

    useEffect(() => {
        if (restoring) return;
        saveToLocalStorage(STORAGE_KEYS.AUTO_REASSIGN_ENABLED, autoReassignEnabled);
    }, [autoReassignEnabled, restoring]);

    useEffect(() => {
        const activePlan = savedPlans.find(plan => plan.id === currentPlanId);
        setIsLocked(activePlan?.type === 'Master');
    }, [currentPlanId, savedPlans]);

    // --- LOGIC FUNCTIONS ---

    const saveSourceDataToLocal = (tables, hashes) => {
        try {
            saveToLocalStorage(STORAGE_KEYS.RAW_TABLES, tables);
            saveToLocalStorage(STORAGE_KEYS.PLAN_HASHES, hashes);
        } catch (e) {
            setError("Ошибка сохранения данных.");
        }
    };

    const debouncedSaveToLocal = useCallback(debounce((assignments) => {
        setSyncStatus('syncing');
        try {
            saveToLocalStorage(STORAGE_KEYS.MANUAL_ASSIGNMENTS, assignments);
            setSyncStatus('saved');
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = setTimeout(() => setSyncStatus('idle'), 2000);
        } catch (e) {
            setSyncStatus('error');
            console.error('Error saving assignments:', e);
        }
    }, 1000), []);

    const updateAssignments = useCallback((newAssignments) => {
        if (isLocked) {
            notify({ type: 'error', message: 'План защищен. Введите PIN для редактирования.' });
            return;
        }
        if (viewMode !== 'dashboard') {
            notify({ type: 'error', message: 'Редактирование доступно только в режиме "Смены".' });
            return;
        }
        setManualAssignments(newAssignments);
        debouncedSaveToLocal(newAssignments);
    }, [debouncedSaveToLocal, isLocked, viewMode]);

    const handleMatrixAssignment = useCallback((targetLineName, targetPosIdx, shiftId, newWorkerNames) => {
        if (isLocked) {
            notify({ type: 'error', message: 'План защищен. Введите PIN для редактирования.' });
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
                    saveToLocalStorage(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
                    return nextReg;
                });
            }, 0);

            saveToLocalStorage(STORAGE_KEYS.LINE_TEMPLATES, newTemplates);
            return newTemplates;
        });
    }, [isLocked]);

    const handleWorkerEditSave = useCallback(({ oldName, newName, competencies, status }) => {
        setWorkerRegistry(prev => {
            const next = { ...prev };
            if (oldName && oldName !== newName) {
                const data = next[oldName];
                delete next[oldName];
                next[newName] = { ...data, name: newName, competencies, status };
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
                next[newName] = {
                    name: newName,
                    role: next[newName]?.role || 'Сотрудник',
                    homeLine: next[newName]?.homeLine || '',
                    competencies,
                    status
                };
            }
            const registryForStorage = {};
            Object.entries(next).forEach(([key, value]) => {
                registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
            });
            saveToLocalStorage(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
            return next;
        });
        setEditingWorker(null);
    }, []);

    const handleWorkerDelete = useCallback((name) => {
        setWorkerRegistry(prev => {
            const next = { ...prev };
            delete next[name];
            const registryForStorage = {};
            Object.entries(next).forEach(([key, value]) => {
                registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
            });
            saveToLocalStorage(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
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
            saveToLocalStorage(STORAGE_KEYS.LINE_TEMPLATES, newLt);
            return newLt;
        });
    }, []);

    const generateShiftHash = (dateStr, shiftNum, shiftType, activeLines, templates) => {
        const linesFingerprint = activeLines.sort().map(lineName => {
            const templateName = Object.keys(templates).find(t => isLineMatch(lineName, t));
            const positions = templateName ? templates[templateName] : [];
            const positionsStr = positions.map(p => `${p.role}:${p.count}`).sort().join('|');
            return `${lineName}(${positionsStr})`;
        }).join(';');
        return cyrb53(`${dateStr}|${shiftNum}|${shiftType}|${linesFingerprint}`);
    };

    const preAnalyzeRoster = (rosterData) => {
        const templates = {};
        let lastLineName = '';
        rosterData.slice(1).forEach(row => {
            let lineName = cleanVal(row[4]);
            const role = cleanVal(row[5]);
            if (!lineName && role && lastLineName) lineName = lastLineName;
            if (lineName) lastLineName = lineName;
            const countVal = cleanVal(row[6]);
            if (lineName && role && !role.toLowerCase().includes('подсобник')) {
                if (!templates[lineName]) templates[lineName] = [];
                templates[lineName].push({ role, count: parseInt(countVal) || 1 });
            }
        });
        return { templates };
    };

    const analyzeDataPure = useCallback((demandData, rosterData) => {
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

        rosterData.slice(1).forEach(row => {
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
                if (!templates[lineName]) templates[lineName] = [];
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
                            if (!registry[name]) {
                                registry[name] = { name, role, homeLine: lineName, competencies: new Set(comps), status: parsedStatus };
                            } else {
                                comps.forEach(c => registry[name].competencies.add(c));
                                if (!registry[name].status && parsedStatus) registry[name].status = parsedStatus;
                            }
                        });
                    }
                });
                templates[lineName].push({ role, count: parseInt(countVal) || 1, roster: rosterMap });
            }
        });

        return {
            scheduleDates: sortedStringDates,
            lineTemplates: templates,
            floaters: { day: Array.from(floaterMap.day.values()), night: Array.from(floaterMap.night.values()) },
            workerRegistry: registry
        };
    }, []);

    const analyzeData = (demandData, rosterData) => {
        const result = analyzeDataPure(demandData, rosterData);
        const { scheduleDates: sortedStringDates, lineTemplates: templates, floaters: nextFloaters, workerRegistry: registry } = result;

        setScheduleDates(sortedStringDates);
        saveToLocalStorage(STORAGE_KEYS.SCHEDULE_DATES, sortedStringDates);
        if (sortedStringDates.length > 0) setSelectedDate(prev => sortedStringDates.includes(prev) ? prev : sortedStringDates[0]);

        setLineTemplates(templates);
        setFloaters(nextFloaters);
        setWorkerRegistry(registry);

        saveToLocalStorage(STORAGE_KEYS.LINE_TEMPLATES, templates);
        saveToLocalStorage(STORAGE_KEYS.FLOATERS, nextFloaters);
        const registryForStorage = {};
        Object.entries(registry).forEach(([key, value]) => {
            registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
        });
        saveToLocalStorage(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
    };

    const buildPlanHashes = (demandData, templates) => {
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

    const processExcelFile = async (selectedFile) => {
        if (!selectedFile) return;
        setLoading(true);
        setError('');
        setFile(selectedFile);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                // Отключаем cellDates, чтобы получать даты как числа Excel, которые потом корректно парсим
                const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellNF: true });
                const loadedData = {};
                TARGET_CONFIG.forEach(target => {
                    const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes(target.expectedSheet.toLowerCase().split('.')[0]));
                    if (sheetName) loadedData[target.type] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false });
                });

                if (!loadedData['demand'] || !loadedData['roster']) throw new Error('Неверная структура файла.');

                const { templates: newTemplates } = preAnalyzeRoster(loadedData['roster']);
                const demandData = loadedData['demand'];
                const newHashes = buildPlanHashes(demandData, newTemplates);

                const oldHashes = planHashes;
                const keptAssignments = {};
                let preservedCount = 0;
                const changedDaysSet = new Set();

                Object.entries(manualAssignments).forEach(([key, assignment]) => {
                    const parts = key.split('_');
                    const date = parts[0];
                    const shift = parts[1];
                    const compositeKey = `${date}_${shift}`;
                    if (newHashes[compositeKey] && newHashes[compositeKey] === oldHashes[compositeKey]) {
                        keptAssignments[key] = assignment;
                        preservedCount++;
                    } else {
                        changedDaysSet.add(JSON.stringify({ date, shift }));
                    }
                });

                const changedDays = Array.from(changedDaysSet).map(s => JSON.parse(s));
                let sameDaysCount = 0;
                Object.keys(newHashes).forEach(k => { if (oldHashes[k] === newHashes[k]) sameDaysCount++; });

                if (Object.keys(oldHashes).length > 0) {
                    setUpdateReport({ savedDays: sameDaysCount, savedAssignmentsCount: preservedCount, changedDays: changedDays });
                }

                setManualAssignments(keptAssignments);
                setRawTables(loadedData);
                setPlanHashes(newHashes);
                analyzeData(loadedData['demand'], loadedData['roster']);
                saveSourceDataToLocal(loadedData, newHashes);
                debouncedSaveToLocal(keptAssignments);
                setStep('dashboard');

                if (!currentPlanId) {
                    const createdAt = new Date().toISOString();
                    const name = selectedFile?.name || 'Новый план';
                    const nextPlan = {
                        id: generatePlanId(),
                        name,
                        createdAt,
                        type: 'Operational',
                        data: buildPlanSnapshot()
                    };
                    setSavedPlans(prev => {
                        const cleared = prev.map(p => (p.type === 'Operational' ? { ...p, type: null } : p));
                        return [...cleared, nextPlan];
                    });
                    setCurrentPlanId(nextPlan.id);
                }

            } catch (err) { setError(err.message); } finally { setLoading(false); }
        };
        reader.readAsArrayBuffer(selectedFile);
    };

    const parseExcelToPlanData = useCallback(async (selectedFile) => {
        if (!selectedFile) return null;
        const data = await selectedFile.arrayBuffer();
        // Отключаем cellDates, чтобы получать даты как числа Excel, которые потом корректно парсим
        const workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: false, cellNF: true });
        const loadedData = {};
        TARGET_CONFIG.forEach(target => {
            const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes(target.expectedSheet.toLowerCase().split('.')[0]));
            if (sheetName) loadedData[target.type] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false });
        });
        if (!loadedData['demand'] || !loadedData['roster']) throw new Error('Неверная структура файла.');

        const { templates: newTemplates } = preAnalyzeRoster(loadedData['roster']);
        const newHashes = buildPlanHashes(loadedData['demand'], newTemplates);
        const analysis = analyzeDataPure(loadedData['demand'], loadedData['roster']);

        return {
            rawTables: loadedData,
            planHashes: newHashes,
            scheduleDates: analysis.scheduleDates,
            lineTemplates: analysis.lineTemplates,
            floaters: analysis.floaters,
            workerRegistry: serializeWorkerRegistry(analysis.workerRegistry),
            manualAssignments: {}
        };
    }, [TARGET_CONFIG, buildPlanHashes, analyzeDataPure]);

    const normalizePlanData = useCallback((planData) => ({
        rawTables: planData.rawTables || {},
        scheduleDates: planData.scheduleDates || [],
        planHashes: planData.planHashes || {},
        lineTemplates: planData.lineTemplates || {},
        floaters: planData.floaters || { day: [], night: [] },
        workerRegistry: planData.workerRegistry || {},
        manualAssignments: planData.manualAssignments || {}
    }), []);

    const buildPlanSlots = useCallback((planData) => {
        const normalized = normalizePlanData(planData || {});
        const demandData = normalized.rawTables?.demand;
        const templates = normalized.lineTemplates || {};
        const assignments = normalized.manualAssignments || {};

        if (!Array.isArray(demandData) || demandData.length === 0) {
            return { slots: [], slotMap: new Map() };
        }

        const headers = Array.isArray(demandData[0]) ? demandData[0] : [];
        const slots = [];

        const splitNames = (val) => {
            if (!val) return [];
            return String(val)
                .split(/[,;\n/]+/)
                .map(s => s.trim())
                .filter(s => s.length > 1);
        };

        demandData.slice(1).forEach(row => {
            if (!row) return;
            const normalizedDate = normalizeExcelDate(row[11]);
            if (!normalizedDate) return;
            const dateStr = formatDateLocal(normalizedDate);
            if (!dateStr || dateStr.length < 5) return;

            const shiftNum = extractShiftNumber(cleanVal(row[14]));
            if (!shiftNum) return;

            const activeLines = [];
            for (let i = 15; i <= 26; i++) {
                if ((parseInt(row[i]) || 0) > 0) {
                    const headerName = cleanVal(headers[i]);
                    if (headerName) activeLines.push(headerName);
                }
            }

            activeLines.forEach(activeLineName => {
                const templateName = Object.keys(templates).find(t => isLineMatch(activeLineName, t));
                const positions = templateName ? templates[templateName] : [];
                positions.forEach(pos => {
                    const assignedNamesList = splitNames(pos?.roster?.[shiftNum]);
                    const totalSlots = Math.max(parseInt(pos?.count) || 1, assignedNamesList.length);

                    for (let i = 0; i < totalSlots; i++) {
                        const slotId = `${dateStr}_${shiftNum}_${activeLineName}_${pos.role}_${i}`;
                        const baseName = assignedNamesList[i] || null;
                        const manual = assignments[slotId];
                        let name = baseName;
                        let assignmentType = null;
                        let source = baseName ? 'roster' : 'vacancy';

                        if (manual) {
                            if (manual.type === 'vacancy') {
                                name = null;
                                source = 'manualVacancy';
                            } else {
                                name = manual.name || baseName;
                                assignmentType = manual.type || null;
                                source = 'manual';
                            }
                        }

                        slots.push({
                            slotId,
                            date: dateStr,
                            shiftId: String(shiftNum),
                            lineName: templateName || activeLineName,
                            role: pos.role,
                            index: i,
                            assignedName: name,
                            assignedNorm: name ? normalizeName(name) : '',
                            assignmentType,
                            source
                        });
                    }
                });
            });
        });

        return { slots, slotMap: new Map(slots.map(s => [s.slotId, s])) };
    }, [normalizePlanData]);

    const comparePlanSnapshots = useCallback((masterPlan, operationalPlan) => {
        const master = normalizePlanData(masterPlan || {});
        const operational = normalizePlanData(operationalPlan || {});

        const masterSlots = buildPlanSlots(master);
        const operationalSlots = buildPlanSlots(operational);

        const slotIds = new Set([
            ...masterSlots.slots.map(s => s.slotId),
            ...operationalSlots.slots.map(s => s.slotId)
        ]);

        // Сначала собираем все изменения без учёта moved
        const tempAdded = [];
        const tempLost = [];
        const replaced = [];
        const unchangedSlotIds = new Set();

        slotIds.forEach(slotId => {
            const slotA = masterSlots.slotMap.get(slotId);
            const slotB = operationalSlots.slotMap.get(slotId);
            
            // Если слота нет в одном из планов - пропускаем (структурное изменение)
            if (!slotA || !slotB) return;

            const nameA = slotA.assignedNorm;
            const nameB = slotB.assignedNorm;
            
            // Если ничего не изменилось
            if (nameA === nameB) {
                unchangedSlotIds.add(slotId);
                return;
            }

            // Замена (оба не пустые, но разные люди)
            if (nameA && nameB) {
                replaced.push({
                    ...slotB,
                    fromName: slotA.assignedName,
                    toName: slotB.assignedName
                });
                return;
            }

            // Потеря (был человек, стал пусто)
            if (nameA && !nameB) {
                tempLost.push({ ...slotA, name: slotA.assignedName });
                return;
            }

            // Добавление (было пусто, стал человек)
            if (!nameA && nameB) {
                tempAdded.push({ ...slotB, name: slotB.assignedName });
                return;
            }
        });

        // Теперь определяем moved: если человек исчез из одного слота и появился в другом той же смены
        const moved = [];
        const movedSlotIds = new Set();
        const usedLostIndices = new Set();
        const usedAddedIndices = new Set();

        tempLost.forEach((lostSlot, lostIdx) => {
            if (usedLostIndices.has(lostIdx)) return;

            // Ищем добавление того же человека в той же смене
            const dateShiftKey = `${lostSlot.date}_${lostSlot.shiftId}`;
            const lostNameNorm = lostSlot.assignedNorm;

            tempAdded.forEach((addedSlot, addedIdx) => {
                if (usedAddedIndices.has(addedIdx)) return;
                if (movedSlotIds.has(lostSlot.slotId) || movedSlotIds.has(addedSlot.slotId)) return;

                const addedDateShiftKey = `${addedSlot.date}_${addedSlot.shiftId}`;
                const addedNameNorm = addedSlot.assignedNorm;

                // Проверяем: тот же человек, та же смена, но разные слоты
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

        // Остальные lost и added, которые не стали moved
        const added = tempAdded.filter((_, idx) => !usedAddedIndices.has(idx));
        const lost = tempLost.filter((_, idx) => !usedLostIndices.has(idx));

        return {
            changes: { moved, added, lost, replaced }
        };
    }, [buildPlanSlots, normalizePlanData]);

    const addPlan = useCallback((plan) => {
        setSavedPlans(prev => {
            const cleared = plan.type ? prev.map(p => (p.type === plan.type ? { ...p, type: null } : p)) : prev;
            return [...cleared, plan];
        });
    }, []);

    const saveCurrentAsNewPlan = useCallback((name) => {
        const createdAt = new Date().toISOString();
        const plan = {
            id: generatePlanId(),
            name: name || `План ${createdAt.slice(0, 10)}`,
            createdAt,
            type: 'Operational',
            data: buildPlanSnapshot()
        };
        setSavedPlans(prev => {
            const cleared = prev.map(p => (p.type === 'Operational' ? { ...p, type: null } : p));
            return [...cleared, plan];
        });
        setCurrentPlanId(plan.id);
    }, [buildPlanSnapshot]);

    const loadPlan = useCallback((planId) => {
        const plan = savedPlans.find(p => p.id === planId);
        if (!plan?.data) return;
        isLoadingPlanRef.current = true;
        applyPlanData(plan.data);
        setCurrentPlanId(plan.id);
        setTimeout(() => {
            isLoadingPlanRef.current = false;
        }, 0);
    }, [savedPlans]);

    const setPlanType = useCallback((planId, type) => {
        setSavedPlans(prev => prev.map(plan => {
            if (plan.id === planId) return { ...plan, type };
            if (type && plan.type === type) return { ...plan, type: null };
            return plan;
        }));
    }, []);

    const deletePlan = useCallback((planId) => {
        setSavedPlans(prev => prev.filter(plan => plan.id !== planId));
        if (currentPlanId === planId) {
            setCurrentPlanId(null);
            setRawTables({});
            setScheduleDates([]);
            setPlanHashes({});
            setLineTemplates({});
            setFloaters({ day: [], night: [] });
            setWorkerRegistry({});
            setManualAssignments({});
            setSelectedDate('');
            setStep('upload');
        }
    }, [currentPlanId]);

    const importPlanFromJson = useCallback((jsonData, defaultName) => {
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
    }, [addPlan]);

    const importPlanFromExcelFile = useCallback(async (file, nameOverride) => {
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
    }, [addPlan]);

    useEffect(() => {
        if (!currentPlanId) return;
        if (isLoadingPlanRef.current) return;
        setSavedPlans(prev => {
            const idx = prev.findIndex(p => p.id === currentPlanId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
                ...next[idx],
                data: buildPlanSnapshot(),
                updatedAt: new Date().toISOString()
            };
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        currentPlanId,
        rawTables,
        scheduleDates,
        planHashes,
        lineTemplates,
        floaters,
        workerRegistry,
        manualAssignments
    ]);

    const handleDragStart = useCallback((e, worker) => {
        if (isLocked) {
            notify({ type: 'error', message: 'План защищен. Введите PIN для редактирования.' });
            return;
        }
        if (viewMode !== 'dashboard') {
            notify({ type: 'error', message: 'Редактирование доступно только в режиме "Смены".' });
            return;
        }
        const availability = checkWorkerAvailability(worker.name, selectedDate, workerRegistry);
        if (!availability.available) {
            e.preventDefault();
            notify({ type: 'error', message: `${worker.name} недоступен: ${availability.reason}` });
            return;
        }
        setDraggedWorker(worker);
        e.dataTransfer.effectAllowed = 'move';
    }, [selectedDate, workerRegistry, isLocked, viewMode]);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

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
                movedFrom: sourceSlotId, // Сохраняем откуда перенесли
                movedAt: Date.now()
            };
            delete draggedEntry.sourceSlotId; // Убираем служебное поле
            
            // Если целевой слот занят - меняем местами
            if (targetWorker && targetWorker.type !== 'vacancy') {
                // Target slot has a manual assignment - swap them
                const swappedEntry = {
                    ...targetWorker,
                    id: `assigned_${sourceSlotId}_${Date.now()}`,
                    movedFrom: targetSlotId,
                    movedAt: Date.now()
                };
                newAssignments[sourceSlotId] = swappedEntry;
            } else if (targetBaseWorkerName) {
                // Target slot is occupied by a roster worker (not in manualAssignments)
                // Create a manual assignment for the roster worker in the source slot
                const rosterWorkerEntry = {
                    name: targetBaseWorkerName,
                    role: workerRegistry[targetBaseWorkerName]?.role || 'Не указано',
                    homeLine: workerRegistry[targetBaseWorkerName]?.homeLine || '',
                    id: `assigned_${sourceSlotId}_${Date.now()}`,
                    movedFrom: targetSlotId,
                    movedAt: Date.now(),
                    type: 'roster' // Mark as roster worker moved to manual
                };
                newAssignments[sourceSlotId] = rosterWorkerEntry;
            } else {
                // Если целевой слот пустой - освобождаем исходный (создаем вакансию)
                // This handles the case where source slot had a roster worker
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
            newAssignments[targetSlotId] = assignmentEntry;
        }
        
        updateAssignments(newAssignments);
        setDraggedWorker(null);
    }, [draggedWorker, manualAssignments, updateAssignments, workerRegistry]);

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
    }, [manualAssignments, updateAssignments]);

    const handleRemoveAssignment = useCallback((slotId) => {
        const newAssignments = { ...manualAssignments };
        if (newAssignments[slotId]) delete newAssignments[slotId];
        else newAssignments[slotId] = { type: 'vacancy', id: `forced_vac_${Date.now()}` };
        updateAssignments(newAssignments);
    }, [manualAssignments, updateAssignments]);

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
                                status = wAvail.available ? 'filled' : 'vacancy';
                            }

                            const manual = manualAssignments[slotId];
                            if (manual) status = manual.type === 'vacancy' ? 'vacancy' : 'manual';

                            if (status === 'filled' && currentWorkerName) {
                                const wAvail = getAvailabilityCached(currentWorkerName);
                                if (!wAvail.available) status = 'vacancy';
                            }

                            tasksForLine.push({
                                status,
                                roleTitle: pos.role,
                                slotId,
                                isManualVacancy: manualAssignments[slotId]?.type === 'vacancy',
                                currentWorkerName,
                                assigned: manual || (status === 'filled' ? { name: currentWorkerName } : null)
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

                lineTasks.push({ slots: tasksForLine, displayName: templateName || activeLineName });
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

            const baseFloaters = shiftTypeLower.includes('день') ? [...floaters.day] : [...floaters.night];
            const freeFloaters = baseFloaters.filter(f => !usedFloaterIds.has(f.id));
            const totalRequired = lineTasks.reduce((sum, lt) => sum + lt.slots.length, 0);
            const filledSlots = lineTasks.reduce((sum, lt) => sum + lt.slots.filter(s => s.status !== 'vacancy' && s.status !== 'unknown').length, 0);

            return {
                id: brigade.id,
                name: brigade.name,
                type: brigade.type,
                lineTasks,
                unassignedPeople: allShiftWorkers.filter(w => !w.isBusy),
                floaters: freeFloaters,
                totalRequired,
                filledSlots
            };
        });
    }, [floaters.day, floaters.night, lineTemplates, manualAssignments, workerRegistry, autoReassignEnabled]);

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
    }, [rawTables, manualAssignments, scheduleDates, lineTemplates, getShiftsForDate]);

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

    const backupAssignments = useCallback(() => {
        try {
            saveToLocalStorage(STORAGE_KEYS.ASSIGNMENTS_BACKUP, manualAssignments);
            notify({ type: 'success', message: 'Расстановка сохранена в резервную копию' });
        } catch (e) {
            notify({ type: 'error', message: 'Ошибка сохранения резервной копии' });
        }
    }, [manualAssignments, notify]);

    const restoreAssignments = useCallback(() => {
        try {
            const backup = loadFromLocalStorage(STORAGE_KEYS.ASSIGNMENTS_BACKUP, null);
            if (!backup || Object.keys(backup).length === 0) {
                notify({ type: 'warning', message: 'Нет сохраненной резервной копии' });
                return;
            }
            updateAssignments(backup);
            notify({ type: 'success', message: 'Расстановка восстановлена из резервной копии' });
        } catch (e) {
            notify({ type: 'error', message: 'Ошибка восстановления резервной копии' });
        }
    }, [updateAssignments, notify]);

    // --- CHESS TABLE WORKER LIFECYCLE ---
    useEffect(() => {
        if (!USE_CHESS_WORKER) return;
        if (chessTableWorkerRef.current) return;

        const worker = new Worker(new URL('../chessTable.worker.js', import.meta.url), { type: 'module' });
        chessTableWorkerRef.current = worker;

        worker.onmessage = (e) => {
            const { requestId, result, error } = e.data || {};
            if (!requestId || requestId !== chessTableWorkerReqIdRef.current) return;

            if (error) {
                setChessTableWorkerStatus({ status: 'error', error: String(error), requestId });
                return;
            }

            const workers = (result?.workers || []).map(w => ({
                ...w,
                homeBrigades: new Set(w.homeBrigades || [])
            }));

            setChessTableWorkerResult(result ? { ...result, workers } : null);
            setChessTableWorkerStatus({ status: 'ready', error: null, requestId });
        };

        worker.onerror = (err) => {
            setChessTableWorkerStatus((prev) => ({ ...prev, status: 'error', error: err?.message || 'Worker error' }));
        };

        return () => {
            try { worker.terminate(); } catch (_) {}
            chessTableWorkerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!USE_CHESS_WORKER) return;
        if (viewMode !== 'chess') return;
        const worker = chessTableWorkerRef.current;
        if (!worker) return;
        if (!rawTables?.demand || !Array.isArray(scheduleDates) || scheduleDates.length === 0) return;

        const requestId = ++chessTableWorkerReqIdRef.current;
        setChessTableWorkerStatus({ status: 'calculating', error: null, requestId });

        // Structured-clone friendly payload (no Set/Map)
        const workerRegistryForWorker = {};
        Object.entries(workerRegistry || {}).forEach(([key, value]) => {
            workerRegistryForWorker[key] = {
                ...value,
                competencies: Array.from(value?.competencies || [])
            };
        });

        worker.postMessage({
            requestId,
            payload: {
                scheduleDates,
                demand: rawTables.demand,
                lineTemplates,
                floaters,
                manualAssignments,
                workerRegistry: workerRegistryForWorker,
                factData,
                autoReassignEnabled
            }
        });
    }, [USE_CHESS_WORKER, viewMode, rawTables, scheduleDates, lineTemplates, floaters, manualAssignments, workerRegistry, factData, autoReassignEnabled]);

    const chessTableBase = useMemo(() => {
        // Avoid spending CPU when user isn't on the timesheet view.
        if (viewMode !== 'chess') return null;
        if (USE_CHESS_WORKER) return null;
        if (!rawTables?.demand || !rawTables?.roster) return null;

        const sortedDates = Array.isArray(scheduleDates) ? scheduleDates : [];
        if (sortedDates.length === 0) return null;

        const getSurnameNorm = (fullName) => {
            const first = String(fullName || '').trim().split(/\s+/)[0] || '';
            return normalizeName(first);
        };

        const availabilityCache = new Map();
        const getAvailabilityCached = (name, dateStr) => {
            const k = `${name}|${dateStr}`;
            if (availabilityCache.has(k)) return availabilityCache.get(k);
            const v = checkWorkerAvailability(name, dateStr, workerRegistry);
            availabilityCache.set(k, v);
            return v;
        };

        // --- Build workers list (plan + floaters) ---
        const workerMeta = new Map();
        Object.keys(lineTemplates).forEach(lineKey => {
            lineTemplates[lineKey].forEach(pos => {
                const roster = pos?.roster || {};
                Object.entries(roster).forEach(([bId, val]) => {
                    if (!val) return;
                    String(val).split(/[,;\n/]+/).map(n => n.trim()).filter(n => n.length > 1).forEach(name => {
                        if (!workerMeta.has(name)) {
                            workerMeta.set(name, { name, role: pos.role, homeLine: lineKey, homeBrigades: new Set(), category: 'staff', sortShift: 99 });
                        }
                        const w = workerMeta.get(name);
                        w.homeBrigades.add(bId);
                        w.sortShift = Math.min(w.sortShift, parseInt(bId) || 99);
                    });
                });
            });
        });

        floaters.day.forEach(f => {
            if (!f?.name) return;
            if (!workerMeta.has(f.name)) workerMeta.set(f.name, { name: f.name, role: 'Подсобник', homeLine: 'Резерв Д', homeBrigades: new Set(), category: 'floater_day', sortShift: 100 });
        });
        floaters.night.forEach(f => {
            if (!f?.name) return;
            if (!workerMeta.has(f.name)) workerMeta.set(f.name, { name: f.name, role: 'Подсобник', homeLine: 'Резерв Н', homeBrigades: new Set(), category: 'floater_night', sortShift: 101 });
        });

        const workerRows = Array.from(workerMeta.values()).sort((a, b) => (a.category === 'staff' ? a.sortShift - b.sortShift : 10) || a.name.localeCompare(b.name));

        const workerLookupByNorm = new Map();
        const workersBySurname = new Map();
        workerRows.forEach(w => {
            const norm = normalizeName(w.name);
            workerLookupByNorm.set(norm, w);
            const surname = getSurnameNorm(w.name);
            if (!workersBySurname.has(surname)) workersBySurname.set(surname, []);
            workersBySurname.get(surname).push(w);
        });

        const workerRegistryLookupByNorm = new Map();
        const workerRegistryBySurname = new Map();
        Object.values(workerRegistry).forEach(w => {
            if (!w?.name) return;
            const norm = normalizeName(w.name);
            workerRegistryLookupByNorm.set(norm, w);
            const surname = getSurnameNorm(w.name);
            if (!workerRegistryBySurname.has(surname)) workerRegistryBySurname.set(surname, []);
            workerRegistryBySurname.get(surname).push(w);
        });

        // --- Facts index (by date) ---
        const factLookupByDate = new Map(); // date -> Map<norm, entry>
        const factBySurnameByDate = new Map(); // date -> Map<surnameNorm, entry[]>
        if (factData) {
            Object.entries(factData).forEach(([date, dateData]) => {
                const dateMap = new Map();
                const surnameMap = new Map();
                Object.values(dateData || {}).forEach((factEntry) => {
                    if (!factEntry) return;
                    const rawName = factEntry.rawName || '';
                    const norm = normalizeName(rawName);
                    if (norm) dateMap.set(norm, factEntry);
                    const surname = getSurnameNorm(rawName);
                    if (!surnameMap.has(surname)) surnameMap.set(surname, []);
                    surnameMap.get(surname).push(factEntry);
                });
                factLookupByDate.set(date, dateMap);
                factBySurnameByDate.set(date, surnameMap);
            });
        }

        const resolveFactEntry = (dateStr, workerName) => {
            const dateMap = factLookupByDate.get(dateStr);
            if (!dateMap) return null;
            const normName = normalizeName(workerName);
            const exact = dateMap.get(normName);
            if (exact) return exact;
            const surname = getSurnameNorm(workerName);
            const surnameMap = factBySurnameByDate.get(dateStr);
            const candidates = surnameMap?.get(surname) || [];
            for (const candidate of candidates) {
                if (candidate?.rawName && matchNames(workerName, candidate.rawName)) return candidate;
            }
            return null;
        };

        // --- Add unexpected workers (present in facts but not in plan) ---
        if (factData) {
            const unexpectedWorkersMap = new Map();
            sortedDates.forEach(date => {
                const surnameMap = factBySurnameByDate.get(date);
                if (!surnameMap) return;
                surnameMap.forEach((entries) => {
                    entries.forEach((factEntry) => {
                        if (!factEntry?.rawName) return;
                        if (!factEntry.cleanTime) return;

                        const factNormName = normalizeName(factEntry.rawName);
                        if (workerLookupByNorm.has(factNormName)) return;

                        const surname = getSurnameNorm(factEntry.rawName);
                        const candidates = workersBySurname.get(surname) || [];
                        let foundInPlan = false;
                        for (const worker of candidates) {
                            if (matchNames(worker.name, factEntry.rawName)) { foundInPlan = true; break; }
                        }
                        if (foundInPlan) return;

                        if (!unexpectedWorkersMap.has(factNormName)) {
                            let regEntry = workerRegistryLookupByNorm.get(factNormName);
                            if (!regEntry) {
                                const regCandidates = workerRegistryBySurname.get(surname) || [];
                                for (const w of regCandidates) {
                                    if (matchNames(w.name, factEntry.rawName)) { regEntry = w; break; }
                                }
                            }
                            unexpectedWorkersMap.set(factNormName, {
                                name: factEntry.rawName,
                                role: regEntry ? regEntry.role : 'Неизвестно',
                                homeLine: 'Вне плана',
                                homeBrigades: new Set(),
                                category: 'unexpected',
                                sortShift: 102,
                                cells: {}
                            });
                        }
                    });
                });
            });

            if (unexpectedWorkersMap.size > 0) {
                unexpectedWorkersMap.forEach(worker => workerRows.push(worker));
                workerRows.sort((a, b) => (a.category === 'staff' ? a.sortShift - b.sortShift : 10) || a.name.localeCompare(b.name));
            }
        }

        workerRows.forEach(worker => { worker.cells = {}; });

        // --- Fill cells ---
        sortedDates.forEach(date => {
            const shiftsOnDate = shiftsByDate.get(date) || getShiftsForDate(date);
            const workingWorkers = new Map();
            const idleWorkers = new Map();

            shiftsOnDate.forEach(shift => {
                const isNight = shift.type.toLowerCase().includes('ночь');
                const shiftCode = isNight ? 'Н' : 'Д';
                shift.lineTasks.forEach(task => {
                    task.slots.forEach(slot => {
                        if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                            const wName = slot.assigned.name;
                            if (slot.assigned.type === 'external') {
                                workingWorkers.set(wName, { code: 'РВ', brigadeId: shift.id, isRv: true });
                            } else {
                                const current = workingWorkers.get(wName);
                                const code = current && current.code !== shiftCode && !current.isRv ? 'Д/Н' : shiftCode;
                                workingWorkers.set(wName, { code, brigadeId: shift.id });
                            }
                        }
                    });
                });
                shift.unassignedPeople.forEach(p => { if (p.isAvailable) idleWorkers.set(p.name, shift.id); });
                shift.floaters.forEach(f => idleWorkers.set(f.name, shift.id));
            });

            workerRows.forEach(worker => {
                let text = '';
                let color = 'bg-white';
                let brigadeId = null;
                let verificationStatus = null;

                const avail = getAvailabilityCached(worker.name, date);
                if (!avail.available) {
                    if (avail.type === 'vacation') { text = 'О'; color = 'bg-emerald-50 text-emerald-700'; }
                    else if (avail.type === 'sick') { text = 'Б'; color = 'bg-amber-50 text-amber-700'; }
                    else if (avail.type === 'fired') { text = 'У'; color = 'bg-slate-200 text-slate-500'; }
                } else if (workingWorkers.has(worker.name)) {
                    const workData = workingWorkers.get(worker.name);
                    text = workData.code;
                    brigadeId = workData.brigadeId;
                    if (text === 'Д') color = 'bg-green-100 text-green-800 font-bold';
                    else if (text === 'Н') color = 'bg-blue-100 text-blue-800 font-bold';
                    else if (text === 'Д/Н') color = 'bg-teal-100 text-teal-800 font-bold';
                    else if (text === 'РВ') color = 'bg-orange-100 text-orange-700 font-bold';

                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry) {
                        if (factEntry.cleanTime) {
                            verificationStatus = 'ok';
                        } else {
                            verificationStatus = 'missing';
                        }
                    }
                } else if (idleWorkers.has(worker.name)) {
                    text = '—';
                    color = 'bg-yellow-100 text-yellow-800 font-bold';
                    brigadeId = idleWorkers.get(worker.name);

                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry) {
                        if (factEntry.cleanTime) {
                            verificationStatus = 'unassigned';
                        } else {
                            verificationStatus = 'missing';
                        }
                    }
                } else {
                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry && factEntry.cleanTime) {
                        verificationStatus = 'unexpected';
                        text = '!';
                        color = 'bg-orange-50 text-orange-700 font-bold';
                    }
                }

                worker.cells[date] = { text, color, brigadeId, verificationStatus };
            });
        });

        return { dates: sortedDates, workers: workerRows };
    }, [viewMode, rawTables, scheduleDates, lineTemplates, floaters.day, floaters.night, workerRegistry, factData, shiftsByDate, getShiftsForDate]);

    const calculateChessTable = useCallback(() => {
        if (USE_CHESS_WORKER) return chessTableWorkerResult;
        return chessTableBase;
    }, [USE_CHESS_WORKER, chessTableWorkerResult, chessTableBase]);

    const exportWithExcelJS = async (tableData) => {
        const { dates, workers } = tableData;
        const filteredWorkers = workers.filter(w => {
            if (chessSearch && !w.name.toLowerCase().includes(chessSearch.toLowerCase())) return false;
            if (chessFilterShift !== 'all') {
                if (chessFilterShift === 'floaters') return w.category.startsWith('floater');
                return w.homeBrigades.has(chessFilterShift);
            }
            return true;
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Табель');
        worksheet.getColumn(1).width = 30;
        worksheet.getColumn(2).width = 10;
        worksheet.getColumn(3).width = 25;
        dates.forEach((_, idx) => { worksheet.getColumn(idx + 4).width = 8; });
        const formattedDates = dates.map(date => {
            const [day, month] = date.split('.');
            return `${day}.${month}`;
        });
        const headerRow = worksheet.addRow(['ФИО Сотрудника', 'Бригада', 'Должность', ...formattedDates]);
        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
            cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } }, bottom: { style: 'thin', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FF000000' } }, right: { style: 'thin', color: { argb: 'FF000000' } } };
        });
        headerRow.height = 20;

        filteredWorkers.forEach(worker => {
            const rowData = [
                worker.name,
                Array.from(worker.homeBrigades).join(', '),
                worker.role,
                ...dates.map(date => {
                    const cell = worker.cells[date] || { text: '', color: 'bg-white', verificationStatus: null };
                    return cell.text || '';
                })
            ];
            const row = worksheet.addRow(rowData);
            row.getCell(1).font = { size: 11 };
            row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
            row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
            row.getCell(2).font = { size: 11, bold: true };
            row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
            row.getCell(3).font = { size: 10 };
            row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
            row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

            dates.forEach((date, dateIdx) => {
                const cell = worker.cells[date] || { text: '', color: 'bg-white', verificationStatus: null };
                const excelCell = row.getCell(dateIdx + 4);
                const cellText = cell.text || '';
                let fillColor = 'FFFFFFFF';
                if (cellText.includes('Д') && !cellText.includes('Д/Н')) fillColor = 'FFC6EFCE';
                else if (cellText.includes('Н')) fillColor = 'FFBDD7EE';
                else if (cellText.includes('Д/Н')) fillColor = 'FFB7DEE8';
                else if (cellText.includes('РВ')) fillColor = 'FFFFE699';
                else if (cellText.includes('—') || cellText.includes('-')) fillColor = 'FFFFF2CC';
                else if (cellText.includes('О')) fillColor = 'FFD5E8D4';
                else if (cellText.includes('Б')) fillColor = 'FFFCE4D6';
                else if (cellText.includes('У')) fillColor = 'FFE2E2E2';
                else if (cellText.includes('!')) fillColor = 'FFFFE699';

                excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
                excelCell.font = { size: 11, bold: true };
                excelCell.alignment = { horizontal: 'center', vertical: 'middle' };

                if (cell.verificationStatus === 'ok') {
                    excelCell.border = { top: { style: 'medium', color: { argb: 'FF00B050' } }, bottom: { style: 'medium', color: { argb: 'FF00B050' } }, left: { style: 'medium', color: { argb: 'FF00B050' } }, right: { style: 'medium', color: { argb: 'FF00B050' } } };
                    excelCell.value = (cellText || '') + ' ✓';
                } else if (cell.verificationStatus === 'missing') {
                    excelCell.border = { top: { style: 'medium', color: { argb: 'FFFF0000' } }, bottom: { style: 'medium', color: { argb: 'FFFF0000' } }, left: { style: 'medium', color: { argb: 'FFFF0000' } }, right: { style: 'medium', color: { argb: 'FFFF0000' } } };
                    excelCell.value = (cellText || '') + ' ✗';
                } else if (cell.verificationStatus === 'unassigned') {
                     excelCell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
                    excelCell.value = (cellText || '') + ' ⏰';
                } else if (cell.verificationStatus === 'unexpected') {
                     excelCell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
                    excelCell.value = (cellText || '') + ' !';
                } else {
                    excelCell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
                }
            });
            [1, 2, 3].forEach(col => {
                const cell = row.getCell(col);
                if (!cell.border) cell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
            });
        });

        worksheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1, topLeftCell: 'D2', activeCell: 'D2' }];
        dates.forEach((_, idx) => { worksheet.getColumn(idx + 4).width = 6; });
        worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: filteredWorkers.length + 1, column: dates.length + 3 } };

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const filterSuffix = chessFilterShift !== 'all' ? `_${chessFilterShift === 'floaters' ? 'Резерв' : `Бригада${chessFilterShift}`}` : '';
        const fileName = `Табель_${dateStr}${filterSuffix}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(url);
    };

     const exportWithXLSX = (tableData) => {
        const { dates, workers } = tableData;
        const filteredWorkers = workers.filter(w => {
            if (chessSearch && !w.name.toLowerCase().includes(chessSearch.toLowerCase())) return false;
            if (chessFilterShift !== 'all') {
                if (chessFilterShift === 'floaters') return w.category.startsWith('floater');
                return w.homeBrigades.has(chessFilterShift);
            }
            return true;
        });

        const excelData = [];
        const headerRow = ['ФИО Сотрудника', 'Бригада', 'Должность', ...dates];
        excelData.push(headerRow);

        filteredWorkers.forEach(worker => {
            const row = [
                worker.name,
                Array.from(worker.homeBrigades).join(', '),
                worker.role,
                ...dates.map(date => {
                    const cell = worker.cells[date] || { text: '', color: 'bg-white', verificationStatus: null };
                    let cellText = cell.text || '';
                    if (cell.verificationStatus === 'ok') cellText += ' ✓';
                    else if (cell.verificationStatus === 'missing') cellText += ' ✗';
                    else if (cell.verificationStatus === 'unexpected') cellText += ' !';
                    return cellText;
                })
            ];
            excelData.push(row);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        // ... styling logic omitted for brevity in Context, but core logic is preserved
        // Standard XLSX export usually sufficient without heavy styling code in Context
        // unless specifically requested. Using ExcelJS mostly anyway.
        
        const colWidths = [{ wch: 30 }, { wch: 10 }, { wch: 25 }, ...dates.map(() => ({ wch: 8 }))];
        ws['!cols'] = colWidths;
        ws['!freeze'] = { xSplit: 3, ySplit: 1, topLeftCell: 'D2', activePane: 'bottomRight', state: 'frozen' };
        ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_cell({ r: filteredWorkers.length, c: dates.length + 2 })}` };
        XLSX.utils.book_append_sheet(wb, ws, 'Табель');
        
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const filterSuffix = chessFilterShift !== 'all' ? `_${chessFilterShift === 'floaters' ? 'Резерв' : `Бригада${chessFilterShift}`}` : '';
        const fileName = `Табель_${dateStr}${filterSuffix}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const exportScheduleByLinesToExcel = useCallback(async () => {
        if (!scheduleDates.length) {
            notify({ type: 'error', message: 'Нет данных для экспорта' });
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('График по линиям');

        const headerRow1 = ['Линия', 'Должность'];
        const headerRow2 = ['', ''];

        scheduleDates.forEach(date => {
            const [day, month] = date.split('.');
            const shortDate = month ? `${day}.${month}` : date;
            headerRow1.push(shortDate, '');
            headerRow2.push('День', 'Ночь');
        });

        const r1 = worksheet.addRow(headerRow1);
        const r2 = worksheet.addRow(headerRow2);

        let colIndex = 3;
        scheduleDates.forEach(() => {
            worksheet.mergeCells(1, colIndex, 1, colIndex + 1);
            colIndex += 2;
        });

        const applyBorder = (cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            };
        };

        const dayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
        const nightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };

        [r1, r2].forEach((row) => {
            row.eachCell((cell, colNumber) => {
                cell.font = { bold: true };
                cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' };
                applyBorder(cell);
            });
        });

        scheduleDates.forEach((_, idx) => {
            const dayCol = 3 + idx * 2;
            const nightCol = dayCol + 1;
            r2.getCell(dayCol).fill = dayFill;
            r2.getCell(nightCol).fill = nightFill;
        });

        const resolveWorkerName = (shift, lineName, role, slotIndex) => {
            if (!shift) return '';
            const lineTask = shift.lineTasks.find(lt => isLineMatch(lt.displayName, lineName));
            if (!lineTask) return '';
            const slotsForRole = lineTask.slots.filter(s => s.roleTitle === role);
            const slot = slotsForRole[slotIndex];
            if (!slot || !slot.assigned) return '';
            if (slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') {
                return slot.assigned.name || '';
            }
            return '';
        };

        Object.entries(lineTemplates).forEach(([lineName, positions]) => {
            let isFirstLineRow = true;
            positions.forEach(pos => {
                const count = parseInt(pos.count) || 1;
                for (let i = 0; i < count; i++) {
                    const roleLabel = `${pos.role}${count > 1 ? ` ${i + 1}` : ''}`.trim();
                    const rowData = [isFirstLineRow ? lineName : '', roleLabel];

                    scheduleDates.forEach(date => {
                        const shifts = getShiftsForDate(date);
                        const dayShift = shifts.find(s => String(s.type || '').toLowerCase().includes('день'));
                        const nightShift = shifts.find(s => String(s.type || '').toLowerCase().includes('ночь'));
                        rowData.push(resolveWorkerName(dayShift, lineName, pos.role, i));
                        rowData.push(resolveWorkerName(nightShift, lineName, pos.role, i));
                    });

                    const row = worksheet.addRow(rowData);
                    row.eachCell((cell, colNumber) => {
                        applyBorder(cell);
                        cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' };
                        if (colNumber === 1 && rowData[0]) {
                            cell.font = { bold: true };
                        }
                    });

                    scheduleDates.forEach((_, idx) => {
                        const dayCol = 3 + idx * 2;
                        const nightCol = dayCol + 1;
                        row.getCell(dayCol).fill = dayFill;
                        row.getCell(nightCol).fill = nightFill;
                    });

                    isFirstLineRow = false;
                }
            });
        });

        const collectFreeHands = (shift) => {
            if (!shift) return [];
            const items = [];
            (shift.unassignedPeople || []).forEach(p => {
                if (p?.isAvailable && p?.name) {
                    const role = p.role ? ` — ${p.role}` : '';
                    items.push(`${p.name}${role}`);
                }
            });
            (shift.floaters || []).forEach(f => {
                if (f?.name) {
                    const role = f.role ? ` — ${f.role}` : '';
                    items.push(`${f.name}${role}`);
                }
            });
            return Array.from(new Set(items));
        };

        const emptyRow = Array(2 + scheduleDates.length * 2).fill('');
        const spacerRow = worksheet.addRow(emptyRow);
        spacerRow.eachCell((cell) => applyBorder(cell));

        const labelRowData = ['Свободные руки', '', ...Array(scheduleDates.length * 2).fill('')];
        const labelRow = worksheet.addRow(labelRowData);
        worksheet.mergeCells(labelRow.number, 1, labelRow.number, 2);
        labelRow.getCell(1).font = { bold: true };
        labelRow.eachCell((cell) => applyBorder(cell));

        const freeHandsRow = ['', ''];
        scheduleDates.forEach(date => {
            const shifts = getShiftsForDate(date);
            const dayShift = shifts.find(s => String(s.type || '').toLowerCase().includes('день'));
            const nightShift = shifts.find(s => String(s.type || '').toLowerCase().includes('ночь'));
            const dayNames = collectFreeHands(dayShift).join('\n');
            const nightNames = collectFreeHands(nightShift).join('\n');
            freeHandsRow.push(dayNames, nightNames);
        });

        const freeHandsDataRow = worksheet.addRow(freeHandsRow);
        freeHandsDataRow.eachCell((cell, colNumber) => {
            applyBorder(cell);
            if (colNumber > 2) {
                cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
            }
        });
        scheduleDates.forEach((_, idx) => {
            const dayCol = 3 + idx * 2;
            const nightCol = dayCol + 1;
            freeHandsDataRow.getCell(dayCol).fill = dayFill;
            freeHandsDataRow.getCell(nightCol).fill = nightFill;
        });

        const autoFitColumn = (column, minWidth = 10, maxWidth = 40) => {
            let maxLen = minWidth;
            column.eachCell({ includeEmpty: true }, (cell) => {
                const value = cell.value;
                if (value == null) return;
                const text = typeof value === 'string' ? value : String(value);
                maxLen = Math.max(maxLen, text.length + 2);
            });
            column.width = Math.min(Math.max(maxLen, minWidth), maxWidth);
        };

        worksheet.columns.forEach((column, idx) => {
            const isTextColumn = idx === 0 || idx === 1;
            autoFitColumn(column, isTextColumn ? 12 : 8, isTextColumn ? 45 : 22);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `График_по_линиям_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(url);
    }, [scheduleDates, lineTemplates, getShiftsForDate, notify]);

    const exportChessTableToExcel = useCallback(async () => {
        if (USE_CHESS_WORKER && chessTableWorkerStatus.status === 'calculating') {
            notify({ type: 'info', message: 'Идёт расчёт табеля, подождите несколько секунд.' });
            return;
        }
        const tableData = calculateChessTable();
        if (!tableData) { notify({ type: 'error', message: 'Нет данных для экспорта' }); return; }
        try { await exportWithExcelJS(tableData); } 
        catch (err) { console.warn('ExcelJS export failed, trying XLSX:', err); exportWithXLSX(tableData); }
    }, [USE_CHESS_WORKER, chessTableWorkerStatus.status, calculateChessTable, notify]);

    const value = useMemo(() => ({
        // State
        file, loading, restoring, error, syncStatus,
        rawTables, scheduleDates, planHashes,
        savedPlans, currentPlanId,
        isLocked,
        lineTemplates, floaters, workerRegistry,
        step, setStep, viewMode, setViewMode, selectedDate, setSelectedDate,
        manualAssignments, setManualAssignments,
        factData, setFactData, factDates, setFactDates,
        targetScrollBrigadeId, setTargetScrollBrigadeId,
        draggedWorker, setDraggedWorker,
        updateReport, setUpdateReport,
        rvModalData, setRvModalData,
        editingWorker, setEditingWorker,
        chessFilterShift, setChessFilterShift,
        chessSearch, setChessSearch,
        isGlobalFill, setIsGlobalFill,
        autoReassignEnabled, setAutoReassignEnabled,
        chessDisplayLimit, setChessDisplayLimit,
        chessTableWorkerStatus,
        
        // Actions / Setters
        setWorkerRegistry, setLineTemplates, setFloaters,
        fileInputRef,
        
        // Functions
        processExcelFile,
        parseExcelToPlanData,
        saveCurrentAsNewPlan,
        loadPlan,
        setPlanType,
        deletePlan,
        importPlanFromJson,
        importPlanFromExcelFile,
        updateAssignments,
        comparePlanSnapshots,
        handleMatrixAssignment,
        handleWorkerEditSave, 
        handleWorkerDelete,
        getShiftsForDate,
        calculateDailyStats,
        globalWorkSchedule,
        handleDragStart, handleDragOver, handleDrop,
        handleAssignRv, handleRemoveAssignment, handleAutoFillFloaters,
        backupAssignments, restoreAssignments,
        calculateChessTable, exportChessTableToExcel, exportScheduleByLinesToExcel,
        unlockWithCode
        // Performance metrics are stored outside of Context to avoid app-wide render storms.
    }), [
        // ТОЛЬКО состояние, НЕ setState функции!
        file, loading, restoring, error, syncStatus,
        rawTables, scheduleDates, planHashes,
        savedPlans, currentPlanId,
        isLocked,
        lineTemplates, floaters, workerRegistry,
        step, viewMode, selectedDate,
        manualAssignments,
        factData, factDates,
        targetScrollBrigadeId,
        draggedWorker,
        updateReport,
        rvModalData,
        editingWorker,
        chessFilterShift,
        chessSearch,
        isGlobalFill,
        autoReassignEnabled,
        chessDisplayLimit,
        chessTableWorkerStatus,
        // Только мемоизированные функции
        parseExcelToPlanData,
        saveCurrentAsNewPlan,
        loadPlan,
        setPlanType,
        deletePlan,
        importPlanFromJson,
        importPlanFromExcelFile,
        comparePlanSnapshots,
        getShiftsForDate,
        calculateDailyStats,
        globalWorkSchedule,
        calculateChessTable,
        exportChessTableToExcel,
        exportScheduleByLinesToExcel,
        unlockWithCode,
        backupAssignments,
        restoreAssignments
        // ❌ УБРАНЫ: все немемоизированные функции
        // ❌ УБРАНЫ: все setState
    ]);

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
import { useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { STORAGE_KEYS } from '../../utils';
import { generatePlanId, restoreDemandDates, serializeWorkerRegistry, hydrateWorkerRegistry, normalizeLineTemplates, normalizeManualAssignments, normalizePlanData } from './planUtils';
import { preAnalyzeRoster, analyzeDataPure, buildPlanHashes } from './useDataAnalysis';
import { buildPlanSlots } from './useShiftsOperations';

/**
 * Хук для операций с планами
 * Принимает все необходимые зависимости из DataContext
 */
export const usePlanOperations = ({
    // State
    rawTables,
    scheduleDates,
    planHashes,
    lineTemplates,
    floaters,
    workerRegistry,
    manualAssignments,
    manualLines,
    assignmentClones,
    autoReassignEnabled,
    savedPlans,
    currentPlanId,
    selectedDate,
    // Setters
    setRawTables,
    setScheduleDates,
    setPlanHashes,
    setLineTemplates,
    setFloaters,
    setWorkerRegistry,
    setManualAssignments,
    setManualLines,
    setAssignmentClones,
    setAutoReassignEnabled,
    setSavedPlans,
    setCurrentPlanId,
    setSelectedDate,
    setStep,
    setPlanningStateToLoad,
    setPlanningStateVersion,
    // Refs
    savedPlansSourceRef,
    draftPlanIdRef,
    isLoadingPlanRef,
    // Utils
    persistStateKey,
    notify,
    isReadOnly
}) => {
    const TARGET_CONFIG = useMemo(() => ([
        { tableName: 'Сводная_По_Людям', expectedSheet: 'Расписание по сменам', type: 'demand' },
        { tableName: 'Люд', expectedSheet: 'Справочник', type: 'roster' }
    ]), []);

    /**
     * Создает снапшот текущего плана
     */
    const buildPlanSnapshot = useCallback(() => ({
        rawTables,
        scheduleDates,
        planHashes,
        lineTemplates,
        floaters,
        workerRegistry: serializeWorkerRegistry(workerRegistry),
        manualAssignments,
        manualLines,
        assignmentClones,
        autoReassignEnabled
    }), [rawTables, scheduleDates, planHashes, lineTemplates, floaters, workerRegistry, manualAssignments, manualLines, assignmentClones, autoReassignEnabled]);

    /**
     * Применяет данные плана к состоянию
     */
    const applyPlanData = useCallback((planData, { switchView = true } = {}) => {
        if (!planData) return;
        const nextRaw = { ...(planData.rawTables || {}) };
        if (nextRaw.demand) nextRaw.demand = restoreDemandDates(nextRaw.demand);

        // lineTemplates, floaters, workerRegistry восстанавливаем из roster — чтобы новые линии из Excel не терялись при смене плана
        let lineTemplatesToApply = normalizeLineTemplates(planData.lineTemplates || {});
        let floatersToApply = planData.floaters || { day: [], night: [] };
        let workerRegistryToApply = hydrateWorkerRegistry(planData.workerRegistry || {});
        if (nextRaw.demand && nextRaw.roster) {
            const analysis = analyzeDataPure(nextRaw.demand, nextRaw.roster);
            lineTemplatesToApply = analysis.lineTemplates;
            floatersToApply = analysis.floaters;
            workerRegistryToApply = analysis.workerRegistry;
        }

        setRawTables(nextRaw);
        setScheduleDates(planData.scheduleDates || []);
        setPlanHashes(planData.planHashes || {});
        setLineTemplates(lineTemplatesToApply);
        setFloaters(floatersToApply);
        setWorkerRegistry(workerRegistryToApply);
        persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, lineTemplatesToApply);
        persistStateKey(STORAGE_KEYS.FLOATERS, floatersToApply);
        const registryForStorage = {};
        Object.entries(workerRegistryToApply || {}).forEach(([k, v]) => {
            registryForStorage[k] = { ...v, competencies: Array.from(v?.competencies || []) };
        });
        persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
        setManualAssignments(normalizeManualAssignments(planData.manualAssignments || {}));
        const savedManualLines = planData.manualLines || {};
        setManualLines(savedManualLines);
        const savedClones = planData.assignmentClones || {};
        setAssignmentClones(savedClones);
        setAutoReassignEnabled(planData.autoReassignEnabled ?? true);
        if (planData.scheduleDates?.length > 0) {
            setSelectedDate(prev => planData.scheduleDates.includes(prev) ? prev : planData.scheduleDates[0]);
        }
        if (switchView) setStep('dashboard');
    }, [
        setRawTables, setScheduleDates, setPlanHashes, setLineTemplates, setFloaters, setWorkerRegistry,
        setManualAssignments, setManualLines, setAssignmentClones, setAutoReassignEnabled,
        setSelectedDate, setStep, persistStateKey
    ]);

    /**
     * Парсит Excel файл в данные плана
     */
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
    }, [TARGET_CONFIG]);

    /**
     * Сохраняет текущий план как новый
     */
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
    }, [buildPlanSnapshot, isReadOnly, savedPlans, notify, setSavedPlans, setCurrentPlanId, savedPlansSourceRef]);

    /**
     * Загружает план по ID
     */
    const loadPlan = useCallback((planId, { switchToDashboard = true } = {}) => {
        const plan = savedPlans.find(p => p.id === planId);
        if (!plan?.data) return;
        isLoadingPlanRef.current = true;
        applyPlanData(plan.data, { switchView: switchToDashboard });
        setCurrentPlanId(plan.id);
        if (plan.data.planningState) {
            persistStateKey(STORAGE_KEYS.PLANNING_STATE, plan.data.planningState);
            setPlanningStateToLoad(plan.data.planningState);
            setPlanningStateVersion(v => v + 1);
        }
        setTimeout(() => {
            isLoadingPlanRef.current = false;
        }, 0);
    }, [savedPlans, applyPlanData, setCurrentPlanId, persistStateKey, setPlanningStateToLoad, setPlanningStateVersion, isLoadingPlanRef]);

    /**
     * Загружает очередь планирования из плана
     */
    const loadPlanQueue = useCallback((planId) => {
        const plan = savedPlans.find(p => p.id === planId);
        if (!plan?.data?.planningState) return;
        setPlanningStateToLoad(plan.data.planningState);
        setPlanningStateVersion(v => v + 1);
    }, [savedPlans, setPlanningStateToLoad, setPlanningStateVersion]);

    /**
     * Обновляет оперативный таймлайн плана
     */
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

    /**
     * Обновляет оперативные факты плана
     */
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

    /**
     * Обновляет состояние планирования плана
     */
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

    /**
     * Устанавливает тип плана
     */
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
    }, [isReadOnly, notify, setSavedPlans, savedPlansSourceRef]);

    /**
     * Удаляет план
     */
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
            // СКУД не сбрасываем — один для всех планов
            setWorkerRegistry({});
            setLineTemplates({});
            setFloaters({ day: [], night: [] });
            setPlanningStateToLoad(null);
            setSelectedDate('');
        }
    }, [currentPlanId, isReadOnly, notify, setSavedPlans, setCurrentPlanId, setRawTables, setScheduleDates, setPlanHashes, setManualAssignments, setManualLines, setAssignmentClones, setWorkerRegistry, setLineTemplates, setFloaters, setPlanningStateToLoad, setSelectedDate, savedPlansSourceRef]);

    /**
     * Импортирует план из JSON
     */
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
        savedPlansSourceRef.current = 'importPlanFromJson';
        setSavedPlans(prev => [...prev, plan]);
        return plan.id;
    }, [isReadOnly, notify, setSavedPlans, savedPlansSourceRef]);

    /**
     * Импортирует план из Excel файла
     */
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
        savedPlansSourceRef.current = 'importPlanFromExcelFile';
        setSavedPlans(prev => [...prev, plan]);
        return plan.id;
    }, [isReadOnly, notify, parseExcelToPlanData, setSavedPlans, savedPlansSourceRef]);

    /**
     * Создает план из расписания
     */
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
        const planId = existingByName ? existingByName.id : (draftPlanIdRef.current || generatePlanId());
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
        draftPlanIdRef.current = null;
    }, [
        savedPlans, manualLines, assignmentClones, draftPlanIdRef,
        setRawTables, setPlanHashes, setScheduleDates, setLineTemplates, setFloaters, setWorkerRegistry,
        setManualAssignments, setSelectedDate, setSavedPlans, setCurrentPlanId, persistStateKey, savedPlansSourceRef
    ]);

    /**
     * Сравнивает два снапшота планов
     */
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

        // Слоты только в оперативном плане (РВ, ручные линии и т.д.) — считаем добавлениями
        operationalSlots.slots.forEach(slotB => {
            if (masterSlots.slotMap.has(slotB.slotId)) return;
            if (!slotB.assignedName || !slotB.assignedNorm) return;
            tempAdded.push({ ...slotB, name: slotB.assignedName });
        });

        slotIds.forEach(slotId => {
            const slotA = masterSlots.slotMap.get(slotId);
            const slotB = operationalSlots.slotMap.get(slotId);

            if (!slotA && !slotB) return;

            // Слот есть только в основном плане — в оперативном его нет (потеря)
            if (slotA && !slotB) {
                if (slotA.assignedName && slotA.assignedNorm) {
                    tempLost.push({ ...slotA, name: slotA.assignedName });
                }
                return;
            }

            // Слот есть только в оперативном — обработано выше в tempAdded
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
    }, []);

    return {
        buildPlanSnapshot,
        applyPlanData,
        parseExcelToPlanData,
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
        createPlanFromSchedule,
        comparePlanSnapshots
    };
};


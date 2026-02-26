import { useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { STORAGE_KEYS, normalizeExcelDate, formatDateLocal } from '../../utils';
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
    const buildPlanSnapshot = useCallback(() => {
        // В план сохраняем ТОЛЬКО то, что реально план-зависимо:
        // - demand (календарь/даты/включенные линии)
        // - хеши/список дат (производные от demand)
        // - расстановка (manualAssignments/manualLines/assignmentClones)
        // Всё, что относится к справочнику людей/линий, хранится глобально.
        const demandOnly = rawTables?.demand ? { demand: rawTables.demand } : {};
        if (rawTables?.planLineEvents) demandOnly.planLineEvents = rawTables.planLineEvents;
        return {
            rawTables: demandOnly,
            scheduleDates,
            planHashes,
            manualAssignments,
            manualLines,
            assignmentClones,
            autoReassignEnabled
        };
    }, [rawTables, scheduleDates, planHashes, manualAssignments, manualLines, assignmentClones, autoReassignEnabled]);

    /**
     * Применяет данные плана к состоянию
     */
    const applyPlanData = useCallback((planData, { switchView = true } = {}) => {
        if (!planData) return;
        const nextRaw = { ...(planData.rawTables || {}) };
        if (nextRaw.demand) nextRaw.demand = restoreDemandDates(nextRaw.demand);
        if (nextRaw.planLineEvents && Array.isArray(nextRaw.planLineEvents)) {
            nextRaw.planLineEvents = nextRaw.planLineEvents.map(({ lineName, rows }) => ({
                lineName,
                rows: (rows || []).map((r) => ({
                    start: r.start ? new Date(r.start) : null,
                    end: r.end ? new Date(r.end) : null
                })).filter((r) => r.start && r.end)
            }));
        }

        // lineTemplates, floaters, workerRegistry — только если в плане есть roster (demand+roster дают анализ).
        // Иначе не трогаем глобальные люди/линии, чтобы не затирать их пустыми значениями при загрузке плана без roster.
        const hasRosterInPlan = nextRaw.demand && nextRaw.roster;
        if (hasRosterInPlan) {
            const analysis = analyzeDataPure(nextRaw.demand, nextRaw.roster);
            const lineTemplatesToApply = analysis.lineTemplates;
            const floatersToApply = analysis.floaters;
            const workerRegistryToApply = analysis.workerRegistry;
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
        }

        setRawTables(nextRaw);
        setScheduleDates(planData.scheduleDates || []);
        setPlanHashes(planData.planHashes || {});
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
     * Применяет ТОЛЬКО расписание (demand -> scheduleDates/planHashes) из плана.
     * Всё, что относится к людям/линиям (roster, workerRegistry, lineTemplates, floaters) — остаётся глобальным.
     */
    const applyPlanScheduleOnly = useCallback((planData, { switchView = true } = {}) => {
        if (!planData) return;

        const planDemandRaw = planData.rawTables?.demand;
        if (!planDemandRaw) return;

        const restoredDemand = restoreDemandDates(planDemandRaw);

        // Обновляем только demand, roster оставляем как есть (глобальный). Восстанавливаем planLineEvents из плана при наличии.
        const nextRaw = { ...(rawTables || {}), demand: restoredDemand };
        if (planData.rawTables?.planLineEvents && Array.isArray(planData.rawTables.planLineEvents)) {
            nextRaw.planLineEvents = planData.rawTables.planLineEvents.map(({ lineName, rows }) => ({
                lineName,
                rows: (rows || []).map((r) => ({
                    start: r.start ? new Date(r.start) : null,
                    end: r.end ? new Date(r.end) : null
                })).filter((r) => r.start && r.end)
            }));
        }

        // scheduleDates: берём из плана (если есть), иначе считаем по demand (не зависит от roster)
        let nextScheduleDates = Array.isArray(planData.scheduleDates) ? planData.scheduleDates : [];
        if (nextScheduleDates.length === 0) {
            const rawDates = restoredDemand
                .slice(1)
                .map((row) => normalizeExcelDate(row?.[11]))
                .filter((d) => d);
            const uniqueTimestamps = [...new Set(rawDates.map((d) => d.getTime()))].sort((a, b) => a - b);
            nextScheduleDates = uniqueTimestamps.map((ts) => formatDateLocal(new Date(ts)));
        }

        // planHashes: берём из плана (если есть), иначе считаем, если есть roster (глобальный или legacy из плана)
        const rosterForHashes = nextRaw.roster || planData.rawTables?.roster;
        let nextHashes = {};
        if (planData.planHashes && typeof planData.planHashes === 'object' && Object.keys(planData.planHashes).length > 0) {
            nextHashes = planData.planHashes;
        } else if (rosterForHashes) {
            const { templates } = preAnalyzeRoster(rosterForHashes);
            nextHashes = buildPlanHashes(restoredDemand, templates);
        }

        // Расстановка: у каждого плана своя, берём напрямую из planData (без пересчёта по хешам)
        const nextAssignments = normalizeManualAssignments(planData.manualAssignments || {});
        const nextManualLines = planData.manualLines || {};
        const nextClones = planData.assignmentClones || {};
        const nextAutoReassignEnabled = planData.autoReassignEnabled ?? true;

        setRawTables(nextRaw);
        setScheduleDates(nextScheduleDates);
        setPlanHashes(nextHashes);
        setManualAssignments(nextAssignments);
        setManualLines(nextManualLines);
        setAssignmentClones(nextClones);
        setAutoReassignEnabled(nextAutoReassignEnabled);

        persistStateKey(STORAGE_KEYS.RAW_TABLES, nextRaw);
        persistStateKey(STORAGE_KEYS.SCHEDULE_DATES, nextScheduleDates);
        persistStateKey(STORAGE_KEYS.PLAN_HASHES, nextHashes);
        persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, nextAssignments);
        persistStateKey(STORAGE_KEYS.MANUAL_LINES, nextManualLines);
        persistStateKey(STORAGE_KEYS.ASSIGNMENT_CLONES, nextClones);
        persistStateKey(STORAGE_KEYS.AUTO_REASSIGN_ENABLED, nextAutoReassignEnabled);

        if (nextScheduleDates.length > 0) {
            setSelectedDate((prev) => (nextScheduleDates.includes(prev) ? prev : nextScheduleDates[0]));
        }
        if (switchView) setStep('dashboard');
    }, [
        rawTables,
        setRawTables,
        setScheduleDates,
        setPlanHashes,
        setManualAssignments,
        setManualLines,
        setAssignmentClones,
        setAutoReassignEnabled,
        setSelectedDate,
        setStep,
        persistStateKey
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

        // План-зависимо: только demand + производные, расстановка пустая.
        const restoredDemand = restoreDemandDates(loadedData['demand']);
        const rawDates = restoredDemand
            .slice(1)
            .map((row) => normalizeExcelDate(row?.[11]))
            .filter((d) => d);
        const uniqueTimestamps = [...new Set(rawDates.map((d) => d.getTime()))].sort((a, b) => a - b);
        const nextScheduleDates = uniqueTimestamps.map((ts) => formatDateLocal(new Date(ts)));

        // Хеши смен считаем на основе roster из файла (только для корректного сохранения/валидации),
        // но roster в план не сохраняем.
        const { templates: newTemplates } = preAnalyzeRoster(loadedData['roster']);
        const newHashes = buildPlanHashes(restoredDemand, newTemplates);

        return {
            rawTables: { demand: restoredDemand },
            planHashes: newHashes,
            scheduleDates: nextScheduleDates,
            manualAssignments: {},
            manualLines: {},
            assignmentClones: {},
            autoReassignEnabled: true
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
        applyPlanScheduleOnly(plan.data, { switchView: switchToDashboard });
        setCurrentPlanId(plan.id);
        setTimeout(() => {
            isLoadingPlanRef.current = false;
        }, 0);
    }, [savedPlans, applyPlanScheduleOnly, setCurrentPlanId, isLoadingPlanRef]);

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
            // Очищаем только план-зависимое (demand). roster/люди/линии — глобальные.
            setRawTables((prev) => {
                const roster = prev?.roster;
                return roster ? { roster } : {};
            });
            setScheduleDates([]);
            setPlanHashes({});
            setManualAssignments({});
            setManualLines({});
            setAssignmentClones({});
            setPlanningStateToLoad(null);
            setSelectedDate('');
        }
    }, [currentPlanId, isReadOnly, notify, setSavedPlans, setCurrentPlanId, setRawTables, setScheduleDates, setPlanHashes, setManualAssignments, setManualLines, setAssignmentClones, setPlanningStateToLoad, setSelectedDate, savedPlansSourceRef]);

    /**
     * (Опционально) Забирает справочник (люди/линии/привязки) из сохранённого плана и применяет ГЛОБАЛЬНО.
     * Нужен для совместимости со старыми планами, где roster/workerRegistry могли храниться в plan.data.
     */
    const pullRosterFromPlanToGlobal = useCallback((planId) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Импорт недоступен.' });
            return;
        }
        const plan = savedPlans.find(p => p.id === planId);
        const rosterFromPlan = plan?.data?.rawTables?.roster;
        if (!Array.isArray(rosterFromPlan) || rosterFromPlan.length === 0) {
            notify({ type: 'error', message: 'В этом плане нет справочника (roster).', duration: 5000 });
            return;
        }

        // Сохраняем roster глобально в rawTables (demand остаётся текущим)
        setRawTables(prev => {
            const next = { ...(prev || {}), roster: rosterFromPlan };
            persistStateKey(STORAGE_KEYS.RAW_TABLES, next);
            return next;
        });

        // Пересчитываем глобальные структуры (линии/подсобники/реестр) на основе текущего demand
        const demandForAnalysis = rawTables?.demand || plan?.data?.rawTables?.demand;
        if (Array.isArray(demandForAnalysis) && demandForAnalysis.length > 0) {
            const analysis = analyzeDataPure(demandForAnalysis, rosterFromPlan);
            setLineTemplates(analysis.lineTemplates);
            setFloaters(analysis.floaters);
            setWorkerRegistry(analysis.workerRegistry);
            persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, analysis.lineTemplates);
            persistStateKey(STORAGE_KEYS.FLOATERS, analysis.floaters);
            const registryForStorage = {};
            Object.entries(analysis.workerRegistry || {}).forEach(([k, v]) => {
                registryForStorage[k] = { ...v, competencies: Array.from(v?.competencies || []) };
            });
            persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
        } else {
            // Если demand отсутствует, хотя бы обновим roster.
            notify({ type: 'info', message: 'Справочник загружен глобально. Расписание отсутствует, поэтому шаблоны линий не пересчитаны.' });
        }

        notify({ type: 'success', message: 'Справочник (люди/линии) загружен глобально из плана.' });
    }, [
        isReadOnly,
        notify,
        savedPlans,
        rawTables,
        setRawTables,
        setLineTemplates,
        setFloaters,
        setWorkerRegistry,
        persistStateKey
    ]);

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
            // В план сохраняем только расписание и расстановку.
            // roster/lineTemplates/workerRegistry/floaters — глобальные.
            rawTables: { demand },
            planHashes: newHashes,
            scheduleDates: analysis.scheduleDates,
            manualAssignments: {},
            manualLines,
            assignmentClones,
            autoReassignEnabled,
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
        savedPlans, manualLines, assignmentClones, autoReassignEnabled, draftPlanIdRef,
        setRawTables, setPlanHashes, setScheduleDates, setLineTemplates, setFloaters, setWorkerRegistry,
        setManualAssignments, setSelectedDate, setSavedPlans, setCurrentPlanId, persistStateKey, savedPlansSourceRef
    ]);

    /**
     * Сравнивает два снапшота планов
     */
    const comparePlanSnapshots = useCallback((masterPlan, operationalPlan) => {
        // Для сравнения используем ГЛОБАЛЬНЫЙ справочник (линии/люди),
        // а из планов берём только расписание (demand) и расстановку (manualAssignments/...).
        const makeEffectiveForSlots = (plan) => {
            const normalized = normalizePlanData(plan || {});
            const demand = normalized.rawTables?.demand ? restoreDemandDates(normalized.rawTables.demand) : null;

            const rosterForSlots = (rawTables && rawTables.roster) ? rawTables.roster : normalized.rawTables?.roster;

            const hasGlobalTemplates = lineTemplates && Object.keys(lineTemplates).length > 0;
            const hasGlobalRegistry = workerRegistry && Object.keys(workerRegistry).length > 0;
            const hasGlobalFloaters = floaters && (
                (Array.isArray(floaters.day) && floaters.day.length > 0) ||
                (Array.isArray(floaters.night) && floaters.night.length > 0)
            );

            return {
                ...normalized,
                rawTables: {
                    ...(normalized.rawTables || {}),
                    demand: demand || normalized.rawTables?.demand,
                    roster: rosterForSlots
                },
                lineTemplates: hasGlobalTemplates ? lineTemplates : normalizeLineTemplates(normalized.lineTemplates || {}),
                floaters: hasGlobalFloaters ? floaters : (normalized.floaters || { day: [], night: [] }),
                workerRegistry: hasGlobalRegistry ? workerRegistry : hydrateWorkerRegistry(normalized.workerRegistry || {})
            };
        };

        const masterEffective = makeEffectiveForSlots(masterPlan);
        const operationalEffective = makeEffectiveForSlots(operationalPlan);

        const masterSlots = buildPlanSlots(masterEffective);
        const operationalSlots = buildPlanSlots(operationalEffective);

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
    }, [rawTables, lineTemplates, floaters, workerRegistry]);

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
        pullRosterFromPlanToGlobal,
        importPlanFromJson,
        importPlanFromExcelFile,
        createPlanFromSchedule,
        comparePlanSnapshots
    };
};


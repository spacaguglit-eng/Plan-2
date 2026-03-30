import React, { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useNotification } from '../components/common/Toast.jsx';
import {
    STORAGE_KEYS,
    cleanVal,
    extractShiftNumber,
    normalizeName,
    isLineMatch,
    checkWorkerAvailability,
    formatDateLocal,
    normalizeExcelDate
} from '../utils';
import { getDefaultLineNorms } from '../utils/normsComparison';
import { setRemoteFlushErrorCallback } from '../services/remoteStorage';
import { applyRemoteSnapshot as applyRemoteSnapshotFromService } from '../services/syncStateApplier';
import { useSync } from './SyncContext';
import { WorkersProvider, useWorkers } from './WorkersContext';
import { AssignmentsProvider, useAssignments } from './AssignmentsContext';
import { PlansProvider, usePlans } from './PlansContext';
import { PlanningProvider, usePlanning } from './PlanningContext';
import {
    generatePlanId,
    restoreDemandDates,
    serializeWorkerRegistry,
    hydrateWorkerRegistry,
    normalizeLineTemplates,
    normalizeManualAssignments,
    normalizePlanData,
    createManualSlotId,
    buildManualLineSlotIds
} from './modules/planUtils';
import {
    buildPlanHashes,
    preAnalyzeRoster,
    createAnalyzeData,
    analyzeDataPure
} from './modules/useDataAnalysis';
import { buildPlanSlots, useShiftsOperations } from './modules/useShiftsOperations';
import { usePlanOperations } from './modules/usePlanOperations';
import { useAssignmentsOperations } from './modules/useAssignmentsOperations';
import { useChessTable } from './modules/useChessTable';
import {
    exportWithExcelJS,
    exportWithXLSX,
    exportScheduleByLinesToExcel as exportScheduleByLinesToExcelFromModule,
    getLineTimelineRawData as getLineTimelineRawDataFromModule
} from './modules/exportUtils';
import { parsePlanLineSheets } from './modules/planLineSheetsParser';
import {
    loadProductionTabSnapshot,
    saveProductionTabResults,
    saveProductionTabExcluded,
    saveProductionTabNorms,
} from '../services/productionTabStorage';

const DATA_CONTEXT_DEFAULT = Object.freeze({ __DATA_PROVIDER: false });
const DataContext = createContext(DATA_CONTEXT_DEFAULT);

export const DataProvider = ({ children }) => {
    const sync = useSync();
    const { notify } = useNotification();
    const {
        syncStatus,
        setSyncStatus,
        syncLog,
        showSyncLog,
        setShowSyncLog,
        addSyncLogMessage,
        remoteSnapshot,
        pendingUpdates,
        setPendingUpdates,
        setPendingMeta,
        pendingUpdatesRef,
        pendingMetaRef,
        clientIdRef,
        unwrapSnapshotValue,
        persistStateKey: persistStateKeyFromSync,
        cloudStatus,
        isRemoteStorageEnabled,
        wipeRemoteStorage
    } = sync;

    const dataChangeLogRef = useRef([]);
    const [dataChangeLog, setDataChangeLog] = useState([]);
    const DATA_CHANGE_KEY_LABELS = {
        [STORAGE_KEYS.RAW_TABLES]: 'Расписание (сырые таблицы)',
        [STORAGE_KEYS.SCHEDULE_DATES]: 'Даты расписания',
        [STORAGE_KEYS.PLAN_HASHES]: 'Хеши плана',
        [STORAGE_KEYS.MANUAL_ASSIGNMENTS]: 'Ручная расстановка',
        [STORAGE_KEYS.MANUAL_LINES]: 'Ручные линии',
        [STORAGE_KEYS.ASSIGNMENT_CLONES]: 'Клоны расстановки',
        [STORAGE_KEYS.WORKER_REGISTRY]: 'Реестр сотрудников',
        [STORAGE_KEYS.LINE_TEMPLATES]: 'Шаблоны линий',
        [STORAGE_KEYS.FLOATERS]: 'Свободные руки',
        [STORAGE_KEYS.SAVED_PLANS]: 'Сохранённые планы',
        [STORAGE_KEYS.CURRENT_PLAN_ID]: 'Текущий план',
        [STORAGE_KEYS.AUTO_REASSIGN_ENABLED]: 'Автораспределение',
        [STORAGE_KEYS.FACT_DATA]: 'Данные СКУД',
        [STORAGE_KEYS.FACT_DATES]: 'Даты СКУД',
    };
    const persistStateKey = useCallback((key, value) => {
        const keyLabel = DATA_CHANGE_KEY_LABELS[key] || key;
        dataChangeLogRef.current = [{ id: Date.now(), ts: new Date().toISOString(), key, keyLabel }, ...dataChangeLogRef.current].slice(0, 100);
        setDataChangeLog([...dataChangeLogRef.current]);
        persistStateKeyFromSync(key, value);
    }, [persistStateKeyFromSync]);

    const clearDataChangeLog = useCallback(() => {
        dataChangeLogRef.current = [];
        setDataChangeLog([]);
    }, []);

    const wipeAllData = useCallback(async () => {
        if (window.confirm('ВНИМАНИЕ! Это действие удалит ВСЕ данные (планы, настройки, сотрудников) из облака. Восстановить данные будет невозможно. Продолжить?')) {
            try {
                if (isRemoteStorageEnabled()) {
                    await wipeRemoteStorage();
                }
                localStorage.clear();
                window.location.reload();
            } catch (e) {
                console.error(e);
                notify({ type: 'error', message: 'Ошибка при очистке данных' });
            }
        }
    }, [wipeRemoteStorage, isRemoteStorageEnabled, notify]);

    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(true);
    const [error, setError] = useState('');
    const [rawTables, setRawTables] = useState({});
    const [scheduleDates, setScheduleDates] = useState([]);
    const [planHashes, setPlanHashes] = useState({});

    // Multi-plan: при sync on — из облака (каждый план отдельный документ в БД), при sync off — пустой список
    const [savedPlans, setSavedPlans] = useState([]);
    const savedPlansSourceRef = useRef(null);
    const savedPlansRef = useRef([]);
    // Идентификатор активного плана приходит из облака (remoteSnapshot / syncStateApplier)
    const [currentPlanId, setCurrentPlanId] = useState(null);
    const [planningStateVersion, setPlanningStateVersion] = useState(0);
    const [planningStateToLoad, setPlanningStateToLoad] = useState(null);

    const [lineTemplates, setLineTemplates] = useState({});
    const [floaters, setFloaters] = useState({ day: [], night: [] });
    const [workerRegistry, setWorkerRegistry] = useState({});

    const [step, setStep] = useState('upload');
    const [viewMode, setViewMode] = useState('production');
    const [selectedDate, setSelectedDate] = useState('');
    
    const [targetScrollBrigadeId, setTargetScrollBrigadeId] = useState(null);
    const [manualAssignments, setManualAssignments] = useState({});
    
    const [manualLines, setManualLinesState] = useState({});
    const restoringRef = useRef(restoring);
    useEffect(() => { restoringRef.current = restoring; }, [restoring]);
    const setManualLines = useCallback((value) => {
        setManualLinesState((prev) => {
            const next = typeof value === 'function' ? value(prev) : value;
            const pending = pendingUpdatesRef?.current || {};
            if (!restoringRef.current) {
                persistStateKey(STORAGE_KEYS.MANUAL_LINES, next);
            }
            return next;
        });
    }, [persistStateKey, pendingUpdatesRef]);

    const [assignmentClones, setAssignmentClonesState] = useState({});
    const setAssignmentClones = useCallback((value) => {
        const next = typeof value === 'function' ? value(assignmentClones) : value;
        setAssignmentClonesState(next);
        if (!restoring) persistStateKey(STORAGE_KEYS.ASSIGNMENT_CLONES, next);
    }, [assignmentClones, restoring, persistStateKey]);

    const [draggedWorker, setDraggedWorker] = useState(null);
    const [updateReport, setUpdateReport] = useState(null);
    const [rvModalData, setRvModalData] = useState(null);
    const [editingWorker, setEditingWorker] = useState(null);

    const [chessFilterShift, setChessFilterShift] = useState('all');
    const [chessSearch, setChessSearch] = useState('');
    const [isGlobalFill, setIsGlobalFill] = useState(false);
    const [autoReassignEnabled, setAutoReassignEnabledState] = useState(true);
    const setAutoReassignEnabled = useCallback((value) => {
        const next = typeof value === 'function' ? value(autoReassignEnabled) : value;
        setAutoReassignEnabledState(next);
        if (!restoring) persistStateKey(STORAGE_KEYS.AUTO_REASSIGN_ENABLED, next);
    }, [autoReassignEnabled, restoring, persistStateKey]);
    const [chessDisplayLimit, setChessDisplayLimit] = useState(50);

    const USE_CHESS_WORKER = true;
    const [chessTableWorkerResult, setChessTableWorkerResult] = useState(null);
    const [chessTableWorkerStatusState, setChessTableWorkerStatus] = useState({ status: 'idle', error: null, requestId: 0 });

    // Verification (СКУД) — один для всех планов, сохраняется в облако
    const [factData, setFactDataState] = useState(null);
    const [factDates, setFactDatesState] = useState([]);
    const setFactData = useCallback((value) => {
        const next = typeof value === 'function' ? value(factData) : value;
        setFactDataState(next);
        if (!restoring) persistStateKey(STORAGE_KEYS.FACT_DATA, next);
    }, [factData, restoring, persistStateKey]);
    const setFactDates = useCallback((value) => {
        const next = typeof value === 'function' ? value(factDates) : value;
        setFactDatesState(next);
        if (!restoring) persistStateKey(STORAGE_KEYS.FACT_DATES, next);
    }, [factDates, restoring, persistStateKey]);

    const [allEmployees, setAllEmployeesState] = useState({});
    const [departmentMasterList, setDepartmentMasterListState] = useState(null);
    const [planningState, setPlanningStateState] = useState({});
    const [productionResults, setProductionResultsState] = useState(null);
    const [productionExcludedDowntimeTypes, setProductionExcludedDowntimeTypesState] = useState(null);
    const [productionLineNorms, setProductionLineNormsState] = useState(null);

    useEffect(() => {
        try {
            const snap = loadProductionTabSnapshot();
            if (snap.results != null) setProductionResultsState(snap.results);
            if (snap.excluded != null) setProductionExcludedDowntimeTypesState(snap.excluded);
            if (snap.norms != null) setProductionLineNormsState(snap.norms);
        } catch (e) {
            console.error('loadProductionTabSnapshot', e);
        }
    }, []);

    const setAllEmployees = useCallback((value) => {
        const next = typeof value === 'function' ? value(allEmployees) : value;
        setAllEmployeesState(next);
        if (!restoring) persistStateKey(STORAGE_KEYS.ALL_EMPLOYEES, next);
    }, [allEmployees, restoring, persistStateKey]);
    const setDepartmentMasterList = useCallback((value) => {
        const next = typeof value === 'function' ? value(departmentMasterList) : value;
        setDepartmentMasterListState(next);
        if (!restoring) persistStateKey(STORAGE_KEYS.DEPARTMENT_MASTER_LIST, next);
    }, [departmentMasterList, restoring, persistStateKey]);
    const setPlanningState = useCallback((value) => {
        const next = typeof value === 'function' ? value(planningState) : value;
        setPlanningStateState(next);
        if (!restoring) persistStateKey(STORAGE_KEYS.PLANNING_STATE, next);
    }, [planningState, restoring, persistStateKey]);
    const setProductionResults = useCallback((value) => {
        const next = typeof value === 'function' ? value(productionResults) : value;
        setProductionResultsState(next);
        if (!restoring) saveProductionTabResults(next);
    }, [productionResults, restoring]);
    const setProductionExcludedDowntimeTypes = useCallback((value) => {
        const next = typeof value === 'function' ? value(productionExcludedDowntimeTypes) : value;
        setProductionExcludedDowntimeTypesState(next);
        if (!restoring) saveProductionTabExcluded(next);
    }, [productionExcludedDowntimeTypes, restoring]);
    const setProductionLineNorms = useCallback((value) => {
        const next = typeof value === 'function' ? value(productionLineNorms) : value;
        setProductionLineNormsState(next);
        if (!restoring) saveProductionTabNorms(next);
    }, [productionLineNorms, restoring]);

    /**
     * Селективная очистка данных по конкретным ключам STORAGE_KEYS.
     * Используется из UI (модалка с чекбоксами по каждому ключу).
     */
    const wipeDataCategories = useCallback(async (keys) => {
        const keySet = new Set(keys || []);
        try {
            if (keySet.has(STORAGE_KEYS.SAVED_PLANS)) {
                setSavedPlans([]);
                persistStateKey(STORAGE_KEYS.SAVED_PLANS, []);
            }
            if (keySet.has(STORAGE_KEYS.CURRENT_PLAN_ID)) {
                setCurrentPlanId(null);
                persistStateKey(STORAGE_KEYS.CURRENT_PLAN_ID, null);
                setSelectedDate('');
                setStep('upload');
            }
            if (keySet.has(STORAGE_KEYS.RAW_TABLES)) {
                setRawTables({});
                persistStateKey(STORAGE_KEYS.RAW_TABLES, {});
            }
            if (keySet.has(STORAGE_KEYS.SCHEDULE_DATES)) {
                setScheduleDates([]);
                persistStateKey(STORAGE_KEYS.SCHEDULE_DATES, []);
            }
            if (keySet.has(STORAGE_KEYS.PLAN_HASHES)) {
                setPlanHashes({});
                persistStateKey(STORAGE_KEYS.PLAN_HASHES, {});
            }
            if (keySet.has(STORAGE_KEYS.MANUAL_ASSIGNMENTS)) {
                setManualAssignments({});
                persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, {});
            }
            if (keySet.has(STORAGE_KEYS.MANUAL_LINES)) {
                setManualLinesState({});
                persistStateKey(STORAGE_KEYS.MANUAL_LINES, {});
            }
            if (keySet.has(STORAGE_KEYS.ASSIGNMENT_CLONES)) {
                setAssignmentClonesState({});
                persistStateKey(STORAGE_KEYS.ASSIGNMENT_CLONES, {});
            }
            if (keySet.has(STORAGE_KEYS.PLANNING_STATE)) {
                setPlanningStateState({});
                persistStateKey(STORAGE_KEYS.PLANNING_STATE, {});
            }

            if (keySet.has(STORAGE_KEYS.WORKER_REGISTRY)) {
                setWorkerRegistry({});
                persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, {});
            }
            if (keySet.has(STORAGE_KEYS.LINE_TEMPLATES)) {
                setLineTemplates({});
                persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, {});
            }
            if (keySet.has(STORAGE_KEYS.FLOATERS)) {
                const emptyFloaters = { day: [], night: [] };
                setFloaters(emptyFloaters);
                persistStateKey(STORAGE_KEYS.FLOATERS, emptyFloaters);
            }
            if (keySet.has(STORAGE_KEYS.ALL_EMPLOYEES)) {
                setAllEmployeesState({});
                persistStateKey(STORAGE_KEYS.ALL_EMPLOYEES, {});
            }
            if (keySet.has(STORAGE_KEYS.DEPARTMENT_MASTER_LIST)) {
                setDepartmentMasterListState(null);
                persistStateKey(STORAGE_KEYS.DEPARTMENT_MASTER_LIST, null);
            }

            if (keySet.has(STORAGE_KEYS.FACT_DATA)) {
                setFactDataState(null);
                persistStateKey(STORAGE_KEYS.FACT_DATA, null);
            }
            if (keySet.has(STORAGE_KEYS.FACT_DATES)) {
                setFactDatesState([]);
                persistStateKey(STORAGE_KEYS.FACT_DATES, []);
            }

            if (keySet.has(STORAGE_KEYS.PRODUCTION_RESULTS)) {
                setProductionResultsState(null);
                saveProductionTabResults(null);
            }
            if (keySet.has(STORAGE_KEYS.PRODUCTION_EXCLUDED_DOWNTIME_TYPES)) {
                setProductionExcludedDowntimeTypesState(null);
                saveProductionTabExcluded(null);
            }
            if (keySet.has(STORAGE_KEYS.PRODUCTION_LINE_NORMS)) {
                setProductionLineNormsState(null);
                saveProductionTabNorms(null);
            }

            notify({ type: 'success', message: 'Выбранные ключи очищены' });
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Ошибка при очистке данных' });
        }
    }, [
        setSavedPlans,
        setCurrentPlanId,
        setSelectedDate,
        setStep,
        setRawTables,
        setScheduleDates,
        setPlanHashes,
        setManualAssignments,
        setManualLinesState,
        setAssignmentClonesState,
        setPlanningStateState,
        setWorkerRegistry,
        setLineTemplates,
        setFloaters,
        setAllEmployeesState,
        setDepartmentMasterListState,
        setFactDataState,
        setFactDatesState,
        setProductionResultsState,
        setProductionExcludedDowntimeTypesState,
        setProductionLineNormsState,
        persistStateKey,
        notify
    ]);

    useEffect(() => {
        setRemoteFlushErrorCallback((err, failedKeys) => {
            if (!failedKeys?.length) return;
            setSyncStatus('error');
            notify({ type: 'error', message: 'Ошибка синхронизации с облаком. Проверьте подключение.', duration: 5000 });
            const pending = pendingUpdatesRef.current;
            if (failedKeys.includes(STORAGE_KEYS.MANUAL_ASSIGNMENTS) && !(STORAGE_KEYS.MANUAL_ASSIGNMENTS in pending)) {
                const cached = unwrapSnapshotValue(remoteSnapshot?.[STORAGE_KEYS.MANUAL_ASSIGNMENTS]).value;
                if (cached != null) setManualAssignments(cached);
            }
            if (failedKeys.includes(STORAGE_KEYS.SAVED_PLANS) && !(STORAGE_KEYS.SAVED_PLANS in pending)) {
                const cached = unwrapSnapshotValue(remoteSnapshot?.[STORAGE_KEYS.SAVED_PLANS]).value;
                if (Array.isArray(cached)) setSavedPlans(cached);
            }
            if (failedKeys.includes(STORAGE_KEYS.FACT_DATA) && !(STORAGE_KEYS.FACT_DATA in pending)) {
                const cached = unwrapSnapshotValue(remoteSnapshot?.[STORAGE_KEYS.FACT_DATA]).value;
                if (cached != null) setFactData(cached);
            }
            if (failedKeys.includes(STORAGE_KEYS.FACT_DATES) && !(STORAGE_KEYS.FACT_DATES in pending)) {
                const cached = unwrapSnapshotValue(remoteSnapshot?.[STORAGE_KEYS.FACT_DATES]).value;
                if (Array.isArray(cached)) setFactDates(cached);
            }
        });
        return () => setRemoteFlushErrorCallback(null);
    }, [remoteSnapshot, notify, unwrapSnapshotValue, setSyncStatus, setFactData, setFactDates]);

    const isReadOnly = false;

    const fileInputRef = useRef(null);
    const isLoadingPlanRef = useRef(false);
    const hasAutoLoadedLastPlanRef = useRef(false);
    const lastSavedPlansSerializedRef = useRef(null);
    const draftPlanIdRef = useRef(null);

    const TARGET_CONFIG = useMemo(() => ([
        { tableName: 'Сводная_По_Людям', expectedSheet: 'Расписание по сменам', type: 'demand' },
        { tableName: 'Люд', expectedSheet: 'Справочник', type: 'roster' }
    ]), []);

    const planOperations = usePlanOperations({
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
        savedPlansSourceRef,
        draftPlanIdRef,
        isLoadingPlanRef,
        persistStateKey,
        notify,
        isReadOnly
    });

    const {
        buildPlanSnapshot,
        applyPlanData,
        parseExcelToPlanData: parseExcelToPlanDataFromModule,
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
    } = planOperations;

    useEffect(() => {
        if (!isRemoteStorageEnabled()) setRestoring(false);
        else setRestoring(true);
    }, []);

    useEffect(() => {
        if (isRemoteStorageEnabled()) return;
        
        try {
            const savedPlansStr = localStorage.getItem(STORAGE_KEYS.SAVED_PLANS);
            if (savedPlansStr) {
                const parsed = JSON.parse(savedPlansStr);
                if (Array.isArray(parsed)) {
                    setSavedPlans(parsed);
                }
            }
            
            const currentPlanIdStr = localStorage.getItem(STORAGE_KEYS.CURRENT_PLAN_ID);
            if (currentPlanIdStr) {
                setCurrentPlanId(currentPlanIdStr);
            }
            
            // Расстановка план-зависимая: восстанавливаем только если есть активный план.
            if (currentPlanIdStr) {
                const manualAssignmentsStr = localStorage.getItem(STORAGE_KEYS.MANUAL_ASSIGNMENTS);
                if (manualAssignmentsStr) {
                    try {
                        const parsed = JSON.parse(manualAssignmentsStr);
                        if (parsed && typeof parsed === 'object') {
                            setManualAssignments(parsed);
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
        }
        
        setRestoring(false);
    }, [isRemoteStorageEnabled, setSavedPlans, setCurrentPlanId, setManualAssignments]);

    // Если нет активного плана — план-зависимое состояние должно быть пустым (а roster/люди — глобальные).
    useEffect(() => {
        if (restoring) return;
        if (currentPlanId) return;

        // Сохраняем глобальный roster, чистим только demand и всё план-зависимое.
        setRawTables((prev) => {
            const roster = prev?.roster;
            const next = roster ? { roster } : {};
            persistStateKey(STORAGE_KEYS.RAW_TABLES, next);
            return next;
        });
        setScheduleDates([]);
        setPlanHashes({});
        setManualAssignments({});
        setManualLinesState({});
        setAssignmentClonesState({});
        setSelectedDate('');

        persistStateKey(STORAGE_KEYS.SCHEDULE_DATES, []);
        persistStateKey(STORAGE_KEYS.PLAN_HASHES, {});
        persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, {});
        persistStateKey(STORAGE_KEYS.MANUAL_LINES, {});
        persistStateKey(STORAGE_KEYS.ASSIGNMENT_CLONES, {});
    }, [currentPlanId, restoring, persistStateKey, setRawTables, setScheduleDates, setPlanHashes, setManualAssignments, setSelectedDate]);

    useEffect(() => {
        if (restoring) return;
        const serialized = JSON.stringify(savedPlans);
        if (lastSavedPlansSerializedRef.current === serialized) return;
        lastSavedPlansSerializedRef.current = serialized;
        savedPlansSourceRef.current = null;
        persistStateKey(STORAGE_KEYS.SAVED_PLANS, savedPlans);
    }, [savedPlans, restoring, persistStateKey]);

    useEffect(() => {
        if (restoring) return;
        persistStateKey(STORAGE_KEYS.CURRENT_PLAN_ID, currentPlanId);
    }, [currentPlanId, restoring, persistStateKey]);

    const hasAppliedRemoteRef = useRef(false);
    const lastAppliedRemoteRevRef = useRef({});
    const migrationAttemptedRef = useRef(false);
    useEffect(() => {
        if (!remoteSnapshot) return;
        const pending = pendingUpdatesRef.current;
        const pendingMetaMap = pendingMetaRef.current;
        const setLineTemplatesNorm = (updater) => setLineTemplates((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            return (next != null && typeof next === 'object' && !Array.isArray(next) ? normalizeLineTemplates(next) : next) ?? prev;
        });
        const setManualAssignmentsNorm = (updater) => setManualAssignments((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            return (next != null && typeof next === 'object' && !Array.isArray(next) ? normalizeManualAssignments(next) : next) ?? prev;
        });
        applyRemoteSnapshotFromService(remoteSnapshot, {
            setSavedPlans,
            setCurrentPlanId,
            setManualAssignments: setManualAssignmentsNorm,
            setManualLines: setManualLinesState,
            setAssignmentClones: setAssignmentClonesState,
            setAutoReassignEnabled: setAutoReassignEnabledState,
            setFactData,
            setFactDates,
            setRawTables,
            setScheduleDates,
            setPlanHashes,
            setLineTemplates: setLineTemplatesNorm,
            setFloaters,
            setWorkerRegistry,
            setAllEmployees: setAllEmployeesState,
            setDepartmentMasterList: setDepartmentMasterListState,
            setPlanningState: setPlanningStateState,
            applyPlanData,
            getCurrentPlans: () => savedPlansRef.current,
            hydrateWorkerRegistry,
            serializeWorkerRegistry,
            setSavedPlansSourceRef: (value) => { savedPlansSourceRef.current = value; },
            getPendingUpdates: () => pendingUpdatesRef.current,
            getPendingMeta: () => pendingMetaRef.current,
            pendingUpdates: pending,
            pendingMeta: pendingMetaMap,
            currentClientId: clientIdRef.current,
            currentPlanId,
            addSyncLogMessage
        });
        const nextPending = {};
        for (const k of Object.keys(pendingUpdatesRef.current)) {
            const remoteEntry = unwrapSnapshotValue(remoteSnapshot?.[k]);
            const remoteVal = remoteEntry.value;
            const prevK = pendingUpdatesRef.current[k];
            const match = k === STORAGE_KEYS.WORKER_REGISTRY
                ? JSON.stringify(serializeWorkerRegistry(prevK)) === JSON.stringify(remoteVal)
                : JSON.stringify(remoteVal) === JSON.stringify(prevK);
            if (!match) nextPending[k] = prevK;
        }
        const remainingPending = Object.keys(nextPending);
        pendingUpdatesRef.current = nextPending;
        setPendingUpdates(() => nextPending);
        const nextMeta = { ...pendingMetaRef.current };
        Object.keys(nextMeta).forEach((k) => {
            const remoteEntry = unwrapSnapshotValue(remoteSnapshot?.[k]);
            const remoteMetaRev = Number(remoteEntry.meta?.rev ?? 0);
            const localRev = Number(nextMeta[k]?.rev ?? 0);
            if (remoteMetaRev >= localRev) delete nextMeta[k];
        });
        pendingMetaRef.current = nextMeta;
        setPendingMeta(() => nextMeta);
        Object.keys(remoteSnapshot || {}).forEach((k) => {
            if (k === 'updatedAt') return;
            const entry = unwrapSnapshotValue(remoteSnapshot[k]);
            const rev = Number(entry.meta?.rev ?? 0);
            lastAppliedRemoteRevRef.current[k] = rev;
        });
        if (restoring) {
            hasAppliedRemoteRef.current = true;
            setRestoring(false);
        }
    }, [restoring, remoteSnapshot, unwrapSnapshotValue, currentPlanId]);

    // Миграция старых локальных данных (localStorage → облако) один раз на старт
    useEffect(() => {
        if (!isRemoteStorageEnabled()) return;
        if (!remoteSnapshot) return;
        if (migrationAttemptedRef.current) return;
        if (typeof localStorage === 'undefined') return;

        migrationAttemptedRef.current = true;

        const migrateKeyIfMissing = (key) => {
            if (remoteSnapshot[key] != null) return;
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                persistStateKey(key, parsed);
                // После отправки в облако больше не держим эти данные локально
                localStorage.removeItem(key);
            } catch (e) {
                console.error(`Failed to migrate ${key} from localStorage:`, e);
            }
        };

        const keysToMigrate = [
            STORAGE_KEYS.SAVED_PLANS,
            STORAGE_KEYS.MANUAL_ASSIGNMENTS,
            STORAGE_KEYS.MANUAL_LINES,
            STORAGE_KEYS.ASSIGNMENT_CLONES,
            STORAGE_KEYS.RAW_TABLES,
            STORAGE_KEYS.SCHEDULE_DATES,
            STORAGE_KEYS.PLAN_HASHES,
            STORAGE_KEYS.ALL_EMPLOYEES,
            STORAGE_KEYS.DEPARTMENT_MASTER_LIST,
            STORAGE_KEYS.PLANNING_STATE,
            STORAGE_KEYS.WORKER_REGISTRY
        ];

        keysToMigrate.forEach(migrateKeyIfMissing);
    }, [remoteSnapshot, isRemoteStorageEnabled, persistStateKey]);

    useEffect(() => {
        if (restoring) return;
        if (step !== 'upload') return;
        const plans = unwrapSnapshotValue(remoteSnapshot?.[STORAGE_KEYS.SAVED_PLANS]).value;
        if (Array.isArray(plans) && plans.length > 0) {
            setStep('dashboard');
        }
    }, [restoring, step, remoteSnapshot, unwrapSnapshotValue]);

    savedPlansRef.current = savedPlans;

    const saveSourceDataToLocal = (tables, hashes) => {
        try {
            persistStateKey(STORAGE_KEYS.RAW_TABLES, tables);
            persistStateKey(STORAGE_KEYS.PLAN_HASHES, hashes);
        } catch (e) {
            setError("Ошибка сохранения данных.");
        }
    };

    const handleMatrixAssignment = useCallback((targetLineName, targetPosIdx, shiftId, newWorkerNames) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Редактирование недоступно.' });
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
                    persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
                    return nextReg;
                });
            }, 0);

            persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, newTemplates);
            return newTemplates;
        });
    }, []);

    const handleWorkerEditSave = useCallback(({ oldName, newName, competencies, status, fiveDay }) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Редактирование недоступно.' });
            return;
        }
        setWorkerRegistry(prev => {
            const next = { ...prev };
            if (oldName && oldName !== newName) {
                const data = next[oldName];
                delete next[oldName];
                next[newName] = { ...data, name: newName, competencies, status, fiveDay: fiveDay ?? data?.fiveDay };
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
                const existing = next[newName];
                next[newName] = {
                    name: newName,
                    role: existing?.role || 'Сотрудник',
                    homeLine: existing?.homeLine || '',
                    competencies,
                    status,
                    fiveDay: fiveDay ?? existing?.fiveDay
                };
            }
            const registryForStorage = {};
            Object.entries(next).forEach(([key, value]) => {
                registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
            });
            persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
            return next;
        });
        setEditingWorker(null);
    }, [isReadOnly]);

    const handleWorkerDelete = useCallback((name) => {
        if (isReadOnly) {
            notify({ type: 'error', message: 'Вы вошли как гость. Удаление недоступно.' });
            return;
        }
        setWorkerRegistry(prev => {
            const next = { ...prev };
            delete next[name];
            const registryForStorage = {};
            Object.entries(next).forEach(([key, value]) => {
                registryForStorage[key] = { ...value, competencies: Array.from(value.competencies || []) };
            });
            persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
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
            persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, newLt);
            return newLt;
        });
    }, [isReadOnly]);

    const analyzeData = createAnalyzeData({
        setScheduleDates,
        setLineTemplates,
        setFloaters,
        setWorkerRegistry,
        setSelectedDate,
        persistStateKey,
        STORAGE_KEYS
    });

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

                const demandData = loadedData['demand'];
                const rawDates = (demandData.slice(1) || []).map(row => normalizeExcelDate(row[11])).filter(d => d);
                const uniqueTimestamps = [...new Set(rawDates.map(d => d.getTime()))].sort((a, b) => a - b);
                const scheduleDatesFromDemand = uniqueTimestamps.map(ts => formatDateLocal(new Date(ts)));
                loadedData.planLineEvents = parsePlanLineSheets(workbook, scheduleDatesFromDemand);

                const { templates: newTemplates } = preAnalyzeRoster(loadedData['roster']);
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
                const planEvents = loadedData.planLineEvents || [];
                if (planEvents.length > 0) {
                    const totalRows = planEvents.reduce((acc, p) => acc + (p.rows?.length || 0), 0);
                    notify({ type: 'info', message: `Загружено расписание. События с листов линий плана: ${totalRows} интервалов (${planEvents.length} линий).` });
                }
                analyzeData(loadedData['demand'], loadedData['roster']);
                saveSourceDataToLocal(loadedData, newHashes);
                persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, keptAssignments);
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
                    savedPlansSourceRef.current = 'parseExcelToPlanData';
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

    /**
     * Частичный импорт Excel-файла в текущий план по выбранным частям.
     * options:
     * - importCalendar: расписание (дни, смены, хеши)
     * - importRoster: штат и линии (lineTemplates/floaters/workerRegistry)
     */
    const importPlanFromExcelFilePartial = useCallback(
        async (file, options) => {
            if (!file) return;
            if (isReadOnly) {
                notify({ type: 'error', message: 'Вы вошли как гость. Импорт недоступен.' });
                return;
            }

            const { importCalendar, importRoster } = options || {};

            setLoading(true);
            setError('');

            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(new Uint8Array(data), {
                    type: 'array',
                    cellDates: false,
                    cellNF: true
                });

                const loadedData = {};
                TARGET_CONFIG.forEach(target => {
                    const sheetName = workbook.SheetNames.find(s =>
                        s.toLowerCase().includes(
                            target.expectedSheet.toLowerCase().split('.')[0]
                        )
                    );
                    if (sheetName) {
                        loadedData[target.type] = XLSX.utils.sheet_to_json(
                            workbook.Sheets[sheetName],
                            { header: 1, raw: false }
                        );
                    }
                });

                const hasDemand = !!loadedData['demand'];
                const hasRoster = !!loadedData['roster'];

                if ((importCalendar && !hasDemand) || (importRoster && !hasRoster)) {
                    throw new Error('Файл Excel не содержит ожидаемые листы (Расписание/Справочник).');
                }

                const currentRaw = rawTables || {};
                let nextRaw = { ...currentRaw };

                if (importCalendar && hasDemand) {
                    nextRaw = { ...nextRaw, demand: loadedData['demand'] };
                }
                if (importRoster && hasRoster) {
                    nextRaw = { ...nextRaw, roster: loadedData['roster'] };
                }
                let datesForPlan = scheduleDates || [];
                if (loadedData['demand']) {
                    const rawDates = (loadedData['demand'].slice(1) || []).map(row => normalizeExcelDate(row[11])).filter(d => d);
                    const uniqueTimestamps = [...new Set(rawDates.map(d => d.getTime()))].sort((a, b) => a - b);
                    datesForPlan = uniqueTimestamps.map(ts => formatDateLocal(new Date(ts)));
                }
                nextRaw.planLineEvents = parsePlanLineSheets(workbook, datesForPlan);

                let nextPlanHashes = { ...planHashes };
                let keptAssignments = manualAssignments || {};
                let nextScheduleDates = scheduleDates || [];

                const demandToUse = nextRaw.demand;
                const rosterToUse = nextRaw.roster;

                // 1) Пересчёт календаря и справочника, если есть и demand, и roster
                if (demandToUse && rosterToUse) {
                    const analysis = analyzeDataPure(demandToUse, rosterToUse);
                    nextScheduleDates = analysis.scheduleDates;
                    setScheduleDates(analysis.scheduleDates);
                    setLineTemplates(analysis.lineTemplates);
                    setFloaters(analysis.floaters);
                    setWorkerRegistry(analysis.workerRegistry);

                    const registryForStorage = {};
                    Object.entries(analysis.workerRegistry || {}).forEach(([key, value]) => {
                        registryForStorage[key] = {
                            ...value,
                            competencies: Array.from(value.competencies || [])
                        };
                    });
                    persistStateKey(STORAGE_KEYS.LINE_TEMPLATES, analysis.lineTemplates);
                    persistStateKey(STORAGE_KEYS.FLOATERS, analysis.floaters);
                    persistStateKey(STORAGE_KEYS.WORKER_REGISTRY, registryForStorage);
                    persistStateKey(STORAGE_KEYS.SCHEDULE_DATES, analysis.scheduleDates);
                } else if (demandToUse && !rosterToUse) {
                    // Только календарь: считаем scheduleDates напрямую из demand
                    const rawDates = (demandToUse.slice(1) || [])
                        .map(row => normalizeExcelDate(row[11]))
                        .filter(d => d);
                    const uniqueTimestamps = [...new Set(rawDates.map(d => d.getTime()))].sort((a, b) => a - b);
                    const sortedStringDates = uniqueTimestamps.map(ts => formatDateLocal(new Date(ts)));
                    nextScheduleDates = sortedStringDates;
                    setScheduleDates(sortedStringDates);
                    persistStateKey(STORAGE_KEYS.SCHEDULE_DATES, sortedStringDates);
                }

                // 2) Пересчёт хешей смен и сохранение ручных назначений, когда есть и demand, и roster
                if (demandToUse && rosterToUse) {
                    const { templates: newTemplates } = preAnalyzeRoster(rosterToUse);
                    const newHashes = buildPlanHashes(demandToUse, newTemplates);

                    const oldHashes = planHashes || {};
                    const newManual = {};
                    const changedDaysSet = new Set();
                    let preservedCount = 0;

                    Object.entries(manualAssignments || {}).forEach(([key, assignment]) => {
                        const parts = key.split('_');
                        const date = parts[0];
                        const shift = parts[1];
                        const compositeKey = `${date}_${shift}`;
                        if (newHashes[compositeKey] && newHashes[compositeKey] === oldHashes[compositeKey]) {
                            newManual[key] = assignment;
                            preservedCount++;
                        } else {
                            changedDaysSet.add(JSON.stringify({ date, shift }));
                        }
                    });

                    keptAssignments = newManual;
                    nextPlanHashes = newHashes;

                    const changedDays = Array.from(changedDaysSet).map(s => JSON.parse(s));
                    let sameDaysCount = 0;
                    Object.keys(newHashes).forEach(k => {
                        if (oldHashes[k] === newHashes[k]) sameDaysCount++;
                    });

                    if (Object.keys(oldHashes).length > 0) {
                        setUpdateReport({
                            savedDays: sameDaysCount,
                            savedAssignmentsCount: preservedCount,
                            changedDays
                        });
                    }

                    setManualAssignments(newManual);
                    persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, newManual);
                    setPlanHashes(newHashes);
                    persistStateKey(STORAGE_KEYS.PLAN_HASHES, newHashes);
                }

                setRawTables(nextRaw);
                persistStateKey(STORAGE_KEYS.RAW_TABLES, nextRaw);

                if (nextScheduleDates && nextScheduleDates.length > 0) {
                    setSelectedDate(prev =>
                        nextScheduleDates.includes(prev) ? prev : nextScheduleDates[0]
                    );
                }

                // Если нет активного плана и мы импортировали календарь — создаём новый план автоматически,
                // чтобы не было ситуации «нет активного плана, но расписание есть».
                if (!currentPlanId && importCalendar && demandToUse) {
                    const createdAt = new Date().toISOString();
                    const name = file?.name || 'Новый план';
                    const nextPlan = {
                        id: generatePlanId(),
                        name,
                        createdAt,
                        type: 'Operational',
                        data: {
                            rawTables: { demand: demandToUse },
                            scheduleDates: nextScheduleDates || [],
                            planHashes: nextPlanHashes || {},
                            manualAssignments: {},
                            manualLines: {},
                            assignmentClones: {},
                            autoReassignEnabled: true
                        }
                    };
                    savedPlansSourceRef.current = 'importPlanFromExcelFilePartial';
                    setSavedPlans((prev) => {
                        const cleared = prev.map(p => (p.type === 'Operational' ? { ...p, type: null } : p));
                        return [...cleared, nextPlan];
                    });
                    setCurrentPlanId(nextPlan.id);
                }

                setStep('dashboard');
            } catch (err) {
                setError(err?.message || 'Ошибка загрузки файла');
            } finally {
                setLoading(false);
            }
        },
        [
            isReadOnly,
            notify,
            rawTables,
            currentPlanId,
            planHashes,
            manualAssignments,
            scheduleDates,
            setScheduleDates,
            setLineTemplates,
            setFloaters,
            setWorkerRegistry,
            setManualAssignments,
            setPlanHashes,
            setRawTables,
            setSelectedDate,
            setStep,
            persistStateKey,
            setSavedPlans,
            setCurrentPlanId,
            savedPlansSourceRef
        ]
    );

    const parseExcelToPlanData = parseExcelToPlanDataFromModule;

    const addPlan = useCallback((plan) => {
        savedPlansSourceRef.current = 'addPlan';
        setSavedPlans(prev => {
            const cleared = plan.type ? prev.map(p => (p.type === plan.type ? { ...p, type: null } : p)) : prev;
            return [...cleared, plan];
        });
    }, []);

    useEffect(() => {
        if (!currentPlanId) return;
        if (isLoadingPlanRef.current) return;
        
        const snapshot = buildPlanSnapshot();
        savedPlansSourceRef.current = 'useEffect(buildPlanSnapshot автосохр.)';
        setSavedPlans(prev => {
            const idx = prev.findIndex(p => p.id === currentPlanId);
            if (idx === -1) return prev;
            
            const existingPlanningState = prev[idx]?.data?.planningState;
            const existingOperationalTimeline = prev[idx]?.data?.operationalTimeline;
            const existingOperationalFacts = prev[idx]?.data?.operationalFacts;
            const mergedData = {
                ...snapshot,
                planningState: existingPlanningState ?? snapshot.planningState ?? null,
                operationalTimeline: existingOperationalTimeline ?? null,
                operationalFacts: existingOperationalFacts ?? null
            };
            const currentDataStr = JSON.stringify(prev[idx].data);
            const newDataStr = JSON.stringify(mergedData);
            if (currentDataStr === newDataStr) return prev;

            const next = [...prev];
            next[idx] = {
                ...next[idx],
                data: mergedData,
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
        manualAssignments,
        manualLines
    ]);

    // Автозагрузка последнего активного плана после восстановления из localStorage (только если облако отключено)
    useEffect(() => {
        if (restoring) return;
        if (hasAutoLoadedLastPlanRef.current) return;
        if (isRemoteStorageEnabled()) return;
        
        let planIdToLoad = currentPlanId;
        if (!planIdToLoad) {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_PLAN_ID);
                if (stored) {
                    planIdToLoad = stored;
                    setCurrentPlanId(stored);
                }
            } catch (e) {}
        }
        
        if (!planIdToLoad) return;
        
        let plansToUse = savedPlans;
        if (!plansToUse.length) {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.SAVED_PLANS);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        plansToUse = parsed;
                        setSavedPlans(parsed);
                    }
                }
            } catch (e) {}
        }
        
        if (!plansToUse.length) return;
        
        const plan = plansToUse.find(p => p.id === planIdToLoad);
        if (!plan?.data) return;
        
        hasAutoLoadedLastPlanRef.current = true;
        loadPlan(planIdToLoad, { switchToDashboard: false });
    }, [restoring, currentPlanId, savedPlans, loadPlan, isRemoteStorageEnabled, setCurrentPlanId, setSavedPlans]);

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

    const shiftsOperations = useShiftsOperations({
        rawTables,
        scheduleDates,
        lineTemplates,
        floaters,
        workerRegistry,
        manualAssignments,
        manualLines,
        assignmentClones,
        demandIndex,
        createManualSlotId,
        updateAssignments: null // Will be set after assignmentsOperations
    });

    const {
        getShiftsForDate: getShiftsForDateFromModule,
        shiftsByDate: shiftsByDateFromModule,
        applyAutoReassignForDate: applyAutoReassignForDateFromModule,
        calculateDailyStats: calculateDailyStatsFromModule,
        globalWorkSchedule: globalWorkScheduleFromModule
    } = shiftsOperations;

    const getShiftsForDate = getShiftsForDateFromModule;
    const shiftsByDate = shiftsByDateFromModule;
    const calculateDailyStats = calculateDailyStatsFromModule;
    const globalWorkSchedule = globalWorkScheduleFromModule;

    const assignmentsOperations = useAssignmentsOperations({
        manualAssignments,
        assignmentClones,
        manualLines,
        draggedWorker,
        selectedDate,
        viewMode,
        workerRegistry,
        scheduleDates,
        setManualAssignments,
        setAssignmentClones,
        setManualLines,
        setDraggedWorker,
        persistStateKey,
        notify,
        isReadOnly,
        getShiftsForDate
    });

    const {
        updateAssignments,
        handleDragStart: handleDragStartFromModule,
        handleDragOver: handleDragOverFromModule,
        handleDragEnd: handleDragEndFromModule,
        handleDrop: handleDropFromModule,
        handleAssignRv: handleAssignRvFromModule,
        handleRemoveAssignment: handleRemoveAssignmentFromModule,
        cloneAssignedWorker: cloneAssignedWorkerFromModule,
        removeCloneEntry: removeCloneEntryFromModule,
        updateCloneEntry: updateCloneEntryFromModule,
        addManualLine: addManualLineFromModule,
        removeManualLine: removeManualLineFromModule,
        handleAutoFillFloaters: handleAutoFillFloatersFromModule
    } = assignmentsOperations;

    const handleDragStart = handleDragStartFromModule;
    const handleDragOver = handleDragOverFromModule;
    const handleDragEnd = handleDragEndFromModule;
    const handleDrop = handleDropFromModule;
    const handleAssignRv = handleAssignRvFromModule;
    const handleRemoveAssignment = handleRemoveAssignmentFromModule;
    const cloneAssignedWorker = cloneAssignedWorkerFromModule;
    const removeCloneEntry = removeCloneEntryFromModule;
    const updateCloneEntry = updateCloneEntryFromModule;
    const addManualLine = addManualLineFromModule;
    const removeManualLine = removeManualLineFromModule;
    const handleAutoFillFloaters = handleAutoFillFloatersFromModule;

    const applyAutoReassignForDate = useCallback((dateStr) => {
        applyAutoReassignForDateFromModule(dateStr, getShiftsForDate, manualAssignments, updateAssignments, workerRegistry);
    }, [getShiftsForDate, manualAssignments, updateAssignments, workerRegistry, applyAutoReassignForDateFromModule]);

    const resetAssignmentsForShift = useCallback((dateStr, shiftId) => {
        if (!dateStr || !shiftId) return;
        setManualAssignments((prev) => {
            const next = { ...prev };
            const prefix = `${dateStr}_${shiftId}_`;
            Object.keys(next).forEach((key) => {
                if (key.startsWith(prefix)) {
                    delete next[key];
                }
            });
            persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, next);
            return next;
        });
    }, [setManualAssignments, persistStateKey]);

    const resetAssignmentsForDay = useCallback((dateStr) => {
        if (!dateStr) return;
        setManualAssignments((prev) => {
            const next = { ...prev };
            const prefix = `${dateStr}_`;
            Object.keys(next).forEach((key) => {
                if (key.startsWith(prefix)) {
                    delete next[key];
                }
            });
            persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, next);
            return next;
        });
    }, [setManualAssignments, persistStateKey]);

    const resetAssignmentsAll = useCallback(() => {
        setManualAssignments({});
        persistStateKey(STORAGE_KEYS.MANUAL_ASSIGNMENTS, {});
    }, [setManualAssignments, persistStateKey]);

    const assignmentClonesForDisplay = pendingUpdates[STORAGE_KEYS.ASSIGNMENT_CLONES] ?? assignmentClones;
    const cloneCountsByName = useMemo(() => {
        const counts = {};
        Object.values(assignmentClonesForDisplay).forEach(dateMap => {
            Object.values(dateMap).forEach(cloneList => {
                cloneList.forEach(clone => {
                    if (!clone?.name) return;
                    counts[clone.name] = (counts[clone.name] || 0) + 1;
                });
            });
        });
        return counts;
    }, [assignmentClonesForDisplay]);

    const cloneDatesByName = useMemo(() => {
        const map = {};
        Object.entries(assignmentClonesForDisplay).forEach(([date, dateEntry]) => {
            if (!dateEntry) return;
            Object.values(dateEntry).forEach(cloneList => {
                cloneList.forEach(clone => {
                    if (!clone?.name) return;
                    if (!map[date]) map[date] = {};
                    map[date][clone.name] = true;
                });
            });
        });
        return map;
    }, [assignmentClonesForDisplay]);

    const chessTableOperations = useChessTable({
        viewMode,
        rawTables,
                scheduleDates,
                lineTemplates,
                floaters,
        workerRegistry,
                factData,
        manualAssignments,
                manualLines,
                autoReassignEnabled,
        assignmentClones,
        shiftsByDate,
        getShiftsForDate,
        cloneCountsByName,
        USE_CHESS_WORKER,
        chessTableWorkerResult,
        chessTableWorkerStatus: chessTableWorkerStatusState,
        setChessTableWorkerResult,
        setChessTableWorkerStatus
    });

    const {
        calculateChessTable: calculateChessTableFromModule,
        chessTableBase: chessTableBaseFromModule,
        chessTableWorkerStatus: chessTableWorkerStatusFromModule
    } = chessTableOperations;

    const calculateChessTable = calculateChessTableFromModule;
    const chessTableBase = chessTableBaseFromModule;
    const chessTableWorkerStatus = chessTableWorkerStatusFromModule;

    const exportScheduleByLinesToExcel = useCallback(async (mode = 'full') => {
        return exportScheduleByLinesToExcelFromModule({
            scheduleDates,
            lineTemplates,
            getShiftsForDate,
            notify,
            mode,
            productionResults,
            demandTable: rawTables?.demand ?? null,
            planLineEvents: rawTables?.planLineEvents ?? []
        });
    }, [scheduleDates, lineTemplates, getShiftsForDate, notify, productionResults, rawTables]);

    const getLineTimelineRawData = useCallback(() => {
        return getLineTimelineRawDataFromModule(rawTables?.demand ?? null, productionResults ?? [], scheduleDates ?? [], rawTables?.planLineEvents ?? []);
    }, [rawTables?.demand, rawTables?.planLineEvents, productionResults, scheduleDates]);

    const exportChessTableToExcel = useCallback(async () => {
        if (USE_CHESS_WORKER && chessTableWorkerStatus.status === 'calculating') {
            notify({ type: 'info', message: 'Идёт расчёт табеля, подождите несколько секунд.' });
            return;
        }
        const tableData = calculateChessTable();
        if (!tableData) { notify({ type: 'error', message: 'Нет данных для экспорта' }); return; }
        try { 
            await exportWithExcelJS(tableData, chessSearch, chessFilterShift); 
        } catch (err) { 
            console.warn('ExcelJS export failed, trying XLSX:', err); 
            exportWithXLSX(tableData, chessSearch, chessFilterShift); 
        }
    }, [USE_CHESS_WORKER, chessTableWorkerStatus.status, calculateChessTable, notify, chessSearch, chessFilterShift]);

    const display = useMemo(() => {
        const effectivePlanId = pendingUpdates[STORAGE_KEYS.CURRENT_PLAN_ID] ?? currentPlanId;
        return {
        manualAssignments: pendingUpdates[STORAGE_KEYS.MANUAL_ASSIGNMENTS] ?? manualAssignments,
        manualLines: pendingUpdates[STORAGE_KEYS.MANUAL_LINES] ?? manualLines,
        assignmentClones: pendingUpdates[STORAGE_KEYS.ASSIGNMENT_CLONES] ?? assignmentClones,
        savedPlans: pendingUpdates[STORAGE_KEYS.SAVED_PLANS] ?? savedPlans,
        currentPlanId: effectivePlanId,
        autoReassignEnabled: pendingUpdates[STORAGE_KEYS.AUTO_REASSIGN_ENABLED] ?? autoReassignEnabled,
        factData: pendingUpdates[STORAGE_KEYS.FACT_DATA] ?? factData,
        factDates: pendingUpdates[STORAGE_KEYS.FACT_DATES] ?? factDates,
        rawTables: pendingUpdates[STORAGE_KEYS.RAW_TABLES] ?? rawTables,
        scheduleDates: pendingUpdates[STORAGE_KEYS.SCHEDULE_DATES] ?? scheduleDates,
        planHashes: pendingUpdates[STORAGE_KEYS.PLAN_HASHES] ?? planHashes,
        lineTemplates: pendingUpdates[STORAGE_KEYS.LINE_TEMPLATES] ?? lineTemplates,
        floaters: pendingUpdates[STORAGE_KEYS.FLOATERS] ?? floaters,
        workerRegistry: pendingUpdates[STORAGE_KEYS.WORKER_REGISTRY] ?? workerRegistry,
        allEmployees: pendingUpdates[STORAGE_KEYS.ALL_EMPLOYEES] ?? allEmployees,
        departmentMasterList: pendingUpdates[STORAGE_KEYS.DEPARTMENT_MASTER_LIST] ?? departmentMasterList,
        planningState: effectivePlanId ? (pendingUpdates[STORAGE_KEYS.PLANNING_STATE] ?? planningState) : null,
        productionResults,
        productionExcludedDowntimeTypes,
        productionLineNorms: productionLineNorms ?? getDefaultLineNorms([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        };
    }, [
        pendingUpdates,
        manualAssignments, manualLines, assignmentClones, savedPlans, currentPlanId,
        autoReassignEnabled, factData, factDates, rawTables, scheduleDates, planHashes,
        lineTemplates, floaters, workerRegistry,
        allEmployees, departmentMasterList, planningState, productionResults, productionExcludedDowntimeTypes, productionLineNorms
    ]);

    const workersValue = useMemo(() => ({
        lineTemplates: display.lineTemplates,
        floaters: display.floaters,
        workerRegistry: display.workerRegistry,
        setWorkerRegistry,
        setLineTemplates,
        setFloaters,
        handleWorkerEditSave,
        handleWorkerDelete
    }), [display.lineTemplates, display.floaters, display.workerRegistry, handleWorkerEditSave, handleWorkerDelete]);

    const assignmentsValue = useMemo(() => ({
        manualAssignments: display.manualAssignments, setManualAssignments, manualLines: display.manualLines, setManualLines, assignmentClones: display.assignmentClones,
        updateAssignments, addManualLine, removeManualLine,
        handleMatrixAssignment, handleDragStart, handleDragOver, handleDragEnd, handleDrop,
        handleAssignRv, handleRemoveAssignment, handleAutoFillFloaters,
        cloneAssignedWorker, removeCloneEntry,
        cloneCountsByName, cloneDatesByName
    }), [
        display.manualAssignments, display.manualLines, display.assignmentClones, updateAssignments, addManualLine, removeManualLine,
        handleMatrixAssignment, handleDragStart, handleDragOver, handleDragEnd, handleDrop,
        handleAssignRv, handleRemoveAssignment, handleAutoFillFloaters,
        cloneAssignedWorker, removeCloneEntry,
        cloneCountsByName, cloneDatesByName
    ]);

    const plansValue = useMemo(() => ({
        savedPlans: display.savedPlans, currentPlanId: display.currentPlanId,
        setCurrentPlanId,
        processExcelFile, parseExcelToPlanData, saveCurrentAsNewPlan,
        loadPlan, loadPlanQueue, updateOperationalTimeline, updateOperationalFacts, updatePlanPlanningState, setPlanType, deletePlan,
        importPlanFromJson, importPlanFromExcelFile,
        pullRosterFromPlanToGlobal,
        importPlanFromExcelFilePartial,
        createPlanFromSchedule, comparePlanSnapshots, buildPlanSlots
    }), [
        display.savedPlans, display.currentPlanId,
        processExcelFile, parseExcelToPlanData, saveCurrentAsNewPlan,
        loadPlan, loadPlanQueue, updateOperationalTimeline, updateOperationalFacts, updatePlanPlanningState, setPlanType, deletePlan,
        importPlanFromJson, importPlanFromExcelFile, pullRosterFromPlanToGlobal, importPlanFromExcelFilePartial,
        createPlanFromSchedule, comparePlanSnapshots, buildPlanSlots
    ]);

    const planningValue = useMemo(() => ({
        planningStateVersion, planningStateToLoad, setPlanningStateToLoad
    }), [planningStateVersion, planningStateToLoad]);

    const value = useMemo(() => ({
        file, loading, restoring, error, syncStatus, syncLog, showSyncLog, setShowSyncLog, remoteSnapshot, isReadOnly,
        rawTables: display.rawTables, scheduleDates: display.scheduleDates, planHashes: display.planHashes,
        savedPlans: display.savedPlans, currentPlanId: display.currentPlanId, planningStateVersion, planningStateToLoad, setPlanningStateToLoad,
        lineTemplates: display.lineTemplates, floaters: display.floaters, workerRegistry: display.workerRegistry,
        step, setStep, viewMode, setViewMode, selectedDate, setSelectedDate,
        manualAssignments: display.manualAssignments, setManualAssignments,
        manualLines: display.manualLines, setManualLines,
        assignmentClones: display.assignmentClones,
        cloneCountsByName,
        cloneDatesByName,
        factData: display.factData, setFactData, factDates: display.factDates, setFactDates,
        allEmployees: display.allEmployees, setAllEmployees,
        departmentMasterList: display.departmentMasterList, setDepartmentMasterList,
        planningState: display.planningState, setPlanningState,
        productionResults: display.productionResults, setProductionResults,
        productionExcludedDowntimeTypes: display.productionExcludedDowntimeTypes, setProductionExcludedDowntimeTypes,
        productionLineNorms: display.productionLineNorms, setProductionLineNorms,
        targetScrollBrigadeId, setTargetScrollBrigadeId,
        draggedWorker, setDraggedWorker,
        updateReport, setUpdateReport,
        rvModalData, setRvModalData,
        editingWorker, setEditingWorker,
        chessFilterShift, setChessFilterShift,
        chessSearch, setChessSearch,
        isGlobalFill, setIsGlobalFill,
        autoReassignEnabled: display.autoReassignEnabled, setAutoReassignEnabled,
        chessDisplayLimit, setChessDisplayLimit,
        chessTableWorkerStatus,
        setSyncStatus,
        persistStateKey,
        dataChangeLog,
        clearDataChangeLog,
        cloudStatus,
        pendingUpdates,
        wipeAllData,
        wipeDataCategories,
        setCurrentPlanId,
        setWorkerRegistry, setLineTemplates, setFloaters,
        fileInputRef,
        processExcelFile,
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
        pullRosterFromPlanToGlobal,
        importPlanFromExcelFilePartial,
        updateAssignments,
        addManualLine,
        removeManualLine,
        createPlanFromSchedule,
        comparePlanSnapshots,
        buildPlanSlots,
        handleMatrixAssignment,
        handleWorkerEditSave, 
        handleWorkerDelete,
        getShiftsForDate,
        calculateDailyStats,
        globalWorkSchedule,
        handleDragStart, handleDragOver, handleDragEnd, handleDrop,
        handleAssignRv, handleRemoveAssignment, handleAutoFillFloaters,
        cloneAssignedWorker,
        removeCloneEntry,
        calculateChessTable, exportChessTableToExcel, exportScheduleByLinesToExcel,
        getLineTimelineRawData,
        applyAutoReassignForDate,
        resetAssignmentsForShift,
        resetAssignmentsForDay,
        resetAssignmentsAll
    }), [
        file, loading, restoring, error, syncStatus, syncLog, showSyncLog, setShowSyncLog, remoteSnapshot, cloudStatus, pendingUpdates, isReadOnly, wipeAllData, dataChangeLog, clearDataChangeLog,
        display,
        planningStateVersion, planningStateToLoad, setPlanningStateToLoad,
        step, viewMode, selectedDate,
        cloneCountsByName,
        cloneDatesByName,
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
        pullRosterFromPlanToGlobal,
        importPlanFromExcelFilePartial,
        comparePlanSnapshots,
        addManualLine,
        removeManualLine,
        createPlanFromSchedule,
        getShiftsForDate,
        applyAutoReassignForDate,
        calculateDailyStats,
        globalWorkSchedule,
        calculateChessTable,
        cloneAssignedWorker,
        removeCloneEntry,
        exportChessTableToExcel,
        exportScheduleByLinesToExcel,
        getLineTimelineRawData,
        persistStateKey,
        wipeDataCategories
    ]);

    const contextValue = value != null ? { ...value, __DATA_PROVIDER: true } : { __DATA_PROVIDER: true };
    return (
        <DataContext.Provider value={contextValue}>
            <WorkersProvider value={workersValue}>
                <AssignmentsProvider value={assignmentsValue}>
                    <PlansProvider value={plansValue}>
                        <PlanningProvider value={planningValue}>
                            {children}
                        </PlanningProvider>
                    </PlansProvider>
                </AssignmentsProvider>
            </WorkersProvider>
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (context == null || typeof context !== 'object' || context.__DATA_PROVIDER !== true) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
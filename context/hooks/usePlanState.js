import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSync } from '../SyncContext';
import { useNotification } from '../../components/common/Toast';
import { STORAGE_KEYS } from '../../utils';
import { setRemoteFlushErrorCallback } from '../../services/remoteStorage';
import { applyRemoteSnapshot as applyRemoteSnapshotFromService } from '../../services/syncStateApplier';
import {
    normalizeLineTemplates,
    normalizeManualAssignments,
    hydrateWorkerRegistry,
    serializeWorkerRegistry,
    restoreDemandDates,
    analyzeDataPure
} from '../dataContextUtils';

export function usePlanState() {
    const sync = useSync();
    const { notify } = useNotification();
    const {
        useRemoteStorage,
        setUseRemoteStorage,
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
        persistStateKey,
        pushLocalToCloud: syncPushLocalToCloud,
        cloudStatus,
        isRemoteStorageEnabled,
        wipeRemoteStorage
    } = sync;

    // --- STATE ---
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(true);
    const [error, setError] = useState('');
    const [userRole, setUserRole] = useState('guest');

    const [rawTables, setRawTables] = useState({});
    const [scheduleDates, setScheduleDates] = useState([]);
    const [planHashes, setPlanHashes] = useState({});

    const [savedPlans, setSavedPlans] = useState([]);
    const savedPlansSourceRef = useRef(null);
    const [currentPlanId, setCurrentPlanId] = useState(null);
    const [planningStateVersion, setPlanningStateVersion] = useState(0);
    const [planningStateToLoad, setPlanningStateToLoad] = useState(null);
    const [isLocked, setIsLocked] = useState(false);

    const [lineTemplates, setLineTemplates] = useState({});
    const [floaters, setFloaters] = useState({ day: [], night: [] });
    const [workerRegistry, setWorkerRegistry] = useState({});

    const [step, setStep] = useState('upload');
    const [viewMode, setViewMode] = useState('dashboard');
    const [selectedDate, setSelectedDate] = useState('');

    const [targetScrollBrigadeId, setTargetScrollBrigadeId] = useState(null);
    const [manualAssignments, setManualAssignments] = useState({});

    const [manualLines, setManualLinesState] = useState({});
    const setManualLines = useCallback((value) => {
        const next = typeof value === 'function' ? value(manualLines) : value;
        setManualLinesState(next);
        if (!restoring) persistStateKey(STORAGE_KEYS.MANUAL_LINES, next);
    }, [manualLines, restoring, persistStateKey]);

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

    const [factData, setFactData] = useState(null);
    const [factDates, setFactDates] = useState([]);

    const [planningState, setPlanningState] = useState(null);
    const [productionResults, setProductionResults] = useState(null);
    const [productionExcludedDowntimeTypes, setProductionExcludedDowntimeTypes] = useState(() => new Set());
    const [assignmentsBackup, setAssignmentsBackup] = useState(null);
    const [allEmployees, setAllEmployees] = useState(null);
    const [departmentMasterList, setDepartmentMasterList] = useState(null);

    const isReadOnly = userRole === 'guest';
    const lastSavedPlansSerializedRef = useRef(null);
    const hasAppliedRemoteRef = useRef(false);
    const lastAppliedRemoteRevRef = useRef({});

    const wipeAllData = useCallback(async () => {
        if (window.confirm('ВНИМАНИЕ! Это действие удалит ВСЕ данные (планы, настройки, сотрудников) из облака. Восстановить данные будет невозможно. Продолжить?')) {
            try {
                if (isRemoteStorageEnabled()) {
                    await wipeRemoteStorage();
                }
                window.location.reload();
            } catch (e) {
                console.error(e);
                notify({ type: 'error', message: 'Ошибка при очистке данных' });
            }
        }
    }, [wipeRemoteStorage, isRemoteStorageEnabled, notify]);

    // Error callback
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
        });
        return () => setRemoteFlushErrorCallback(null);
    }, [remoteSnapshot, notify, unwrapSnapshotValue, setSyncStatus, pendingUpdatesRef]);

    // Apply Plan Data Helper
    const applyPlanData = useCallback((planData, { switchView = true } = {}) => {
        if (!planData) return;
        const nextRaw = { ...(planData.rawTables || {}) };
        if (nextRaw.demand) nextRaw.demand = restoreDemandDates(nextRaw.demand);

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
        const savedManualLines = planData.manualLines ?? manualLines;
        setManualLines(savedManualLines);
        const savedClones = planData.assignmentClones ?? assignmentClones;
        setAssignmentClones(savedClones);
        setAutoReassignEnabled(planData.autoReassignEnabled ?? true);
        if (planData.scheduleDates?.length > 0) {
            setSelectedDate(prev => planData.scheduleDates.includes(prev) ? prev : planData.scheduleDates[0]);
        }
        if (switchView) setStep('dashboard');
    }, [manualLines, assignmentClones, persistStateKey, setManualLines, setAssignmentClones, setAutoReassignEnabled]);

    // Restoring logic
    useEffect(() => {
        if (!isRemoteStorageEnabled()) setRestoring(false);
        else setRestoring(true);
    }, [isRemoteStorageEnabled]);

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

    useEffect(() => {
        const activePlan = savedPlans.find(plan => plan.id === currentPlanId);
        setIsLocked(activePlan?.type === 'Master');
    }, [currentPlanId, savedPlans]);

    // Apply Remote Snapshot
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
            setPlanningState,
            setProductionResults,
            setProductionExcludedDowntimeTypes,
            setAssignmentsBackup,
            setAllEmployees,
            setDepartmentMasterList,
            applyPlanData,
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
    }, [restoring, remoteSnapshot, unwrapSnapshotValue, currentPlanId, pendingUpdatesRef, pendingMetaRef, setPendingUpdates, setPendingMeta, clientIdRef, addSyncLogMessage, applyPlanData]);

    useEffect(() => {
        if (!useRemoteStorage || restoring) return;
        if (step !== 'upload') return;
        const plans = unwrapSnapshotValue(remoteSnapshot?.[STORAGE_KEYS.SAVED_PLANS]).value;
        if (Array.isArray(plans) && plans.length > 0) {
            setStep('dashboard');
        }
    }, [useRemoteStorage, restoring, step, remoteSnapshot, unwrapSnapshotValue]);

    const pushLocalToCloud = useCallback(async () => {
        if (!isRemoteStorageEnabled()) {
            notify({ type: 'error', message: 'Синхронизация недоступна (нет конфига Firebase).' });
            return;
        }
        const result = await syncPushLocalToCloud(() => {
            const reg = pendingUpdates[STORAGE_KEYS.WORKER_REGISTRY] ?? workerRegistry;
            const stateObj = {
                [STORAGE_KEYS.SAVED_PLANS]: pendingUpdates[STORAGE_KEYS.SAVED_PLANS] ?? savedPlans,
                [STORAGE_KEYS.CURRENT_PLAN_ID]: pendingUpdates[STORAGE_KEYS.CURRENT_PLAN_ID] ?? currentPlanId,
                [STORAGE_KEYS.MANUAL_ASSIGNMENTS]: pendingUpdates[STORAGE_KEYS.MANUAL_ASSIGNMENTS] ?? manualAssignments,
                [STORAGE_KEYS.MANUAL_LINES]: pendingUpdates[STORAGE_KEYS.MANUAL_LINES] ?? manualLines,
                [STORAGE_KEYS.ASSIGNMENT_CLONES]: pendingUpdates[STORAGE_KEYS.ASSIGNMENT_CLONES] ?? assignmentClones,
                [STORAGE_KEYS.AUTO_REASSIGN_ENABLED]: pendingUpdates[STORAGE_KEYS.AUTO_REASSIGN_ENABLED] ?? autoReassignEnabled,
                [STORAGE_KEYS.RAW_TABLES]: pendingUpdates[STORAGE_KEYS.RAW_TABLES] ?? rawTables,
                [STORAGE_KEYS.SCHEDULE_DATES]: pendingUpdates[STORAGE_KEYS.SCHEDULE_DATES] ?? scheduleDates,
                [STORAGE_KEYS.PLAN_HASHES]: pendingUpdates[STORAGE_KEYS.PLAN_HASHES] ?? planHashes,
                [STORAGE_KEYS.LINE_TEMPLATES]: pendingUpdates[STORAGE_KEYS.LINE_TEMPLATES] ?? lineTemplates,
                [STORAGE_KEYS.FLOATERS]: pendingUpdates[STORAGE_KEYS.FLOATERS] ?? floaters,
                [STORAGE_KEYS.WORKER_REGISTRY]: serializeWorkerRegistry(reg),
                [STORAGE_KEYS.FACT_DATA]: pendingUpdates[STORAGE_KEYS.FACT_DATA] ?? factData,
                [STORAGE_KEYS.FACT_DATES]: pendingUpdates[STORAGE_KEYS.FACT_DATES] ?? factDates,
                [STORAGE_KEYS.PLANNING_STATE]: pendingUpdates[STORAGE_KEYS.PLANNING_STATE] ?? planningState,
                [STORAGE_KEYS.PRODUCTION_RESULTS]: pendingUpdates[STORAGE_KEYS.PRODUCTION_RESULTS] ?? productionResults,
                [STORAGE_KEYS.PRODUCTION_EXCLUDED_DOWNTIME_TYPES]: pendingUpdates[STORAGE_KEYS.PRODUCTION_EXCLUDED_DOWNTIME_TYPES] ?? (productionExcludedDowntimeTypes instanceof Set ? Array.from(productionExcludedDowntimeTypes) : productionExcludedDowntimeTypes),
                [STORAGE_KEYS.ASSIGNMENTS_BACKUP]: pendingUpdates[STORAGE_KEYS.ASSIGNMENTS_BACKUP] ?? assignmentsBackup,
                [STORAGE_KEYS.ALL_EMPLOYEES]: pendingUpdates[STORAGE_KEYS.ALL_EMPLOYEES] ?? allEmployees,
                [STORAGE_KEYS.DEPARTMENT_MASTER_LIST]: pendingUpdates[STORAGE_KEYS.DEPARTMENT_MASTER_LIST] ?? departmentMasterList
            };
            return { stateObj, revsPerKey: { ...lastAppliedRemoteRevRef.current } };
        });
        if (result?.ok) {
            if (result.keysWritten === 0) {
                notify({ type: 'info', message: 'В облаке более свежие данные. Обновите страницу.', duration: 5000 });
            } else {
                notify({ type: 'success', message: 'Локальные данные загружены в облако.' });
            }
        } else if (result?.error && result.error !== 'no_config') {
            notify({ type: 'error', message: `Ошибка загрузки в облако: ${result.error}` });
        }
    }, [syncPushLocalToCloud, isRemoteStorageEnabled, pendingUpdates, savedPlans, currentPlanId, manualAssignments, manualLines, assignmentClones, autoReassignEnabled, rawTables, scheduleDates, planHashes, lineTemplates, floaters, workerRegistry, factData, factDates, planningState, productionResults, productionExcludedDowntimeTypes, assignmentsBackup, allEmployees, departmentMasterList, notify]);

    return {
        // State
        file, setFile,
        loading, setLoading,
        restoring, setRestoring,
        error, setError,
        userRole, setUserRole,
        isReadOnly,
        rawTables, setRawTables,
        scheduleDates, setScheduleDates,
        planHashes, setPlanHashes,
        savedPlans, setSavedPlans, savedPlansSourceRef,
        currentPlanId, setCurrentPlanId,
        planningStateVersion, setPlanningStateVersion,
        planningStateToLoad, setPlanningStateToLoad,
        isLocked, setIsLocked,
        lineTemplates, setLineTemplates,
        floaters, setFloaters,
        workerRegistry, setWorkerRegistry,
        step, setStep,
        viewMode, setViewMode,
        selectedDate, setSelectedDate,
        targetScrollBrigadeId, setTargetScrollBrigadeId,
        manualAssignments, setManualAssignments,
        manualLines, setManualLines,
        assignmentClones, setAssignmentClones,
        draggedWorker, setDraggedWorker,
        updateReport, setUpdateReport,
        rvModalData, setRvModalData,
        editingWorker, setEditingWorker,
        chessFilterShift, setChessFilterShift,
        chessSearch, setChessSearch,
        isGlobalFill, setIsGlobalFill,
        autoReassignEnabled, setAutoReassignEnabled,
        chessDisplayLimit, setChessDisplayLimit,
        factData, setFactData,
        factDates, setFactDates,
        planningState, setPlanningState,
        productionResults, setProductionResults,
        productionExcludedDowntimeTypes, setProductionExcludedDowntimeTypes,
        assignmentsBackup, setAssignmentsBackup,
        allEmployees, setAllEmployees,
        departmentMasterList, setDepartmentMasterList,
        lastAppliedRemoteRevRef,
        
        // Sync
        sync,
        wipeAllData,
        pushLocalToCloud,
        applyPlanData,
        persistStateKey
    };
}

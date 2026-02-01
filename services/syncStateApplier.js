import { STORAGE_KEYS } from '../utils';

const hasPlanEvents = (p) =>
    (p?.data?.planningState?.products?.length ?? 0) + (p?.data?.planningState?.cipBetween?.length ?? 0) > 0;

/**
 * Применяет удалённый снапшот к состоянию приложения.
 * @param {Object} snapshot — распарсенный объект из Firestore (ключи STORAGE_KEYS, значения уже объекты/массивы)
 * @param {Object} ctx — контекст: сеттеры (setSavedPlans, setCurrentPlanId, …), applyPlanData, loadFromLocalStorage, hydrateWorkerRegistry, serializeWorkerRegistry, setSavedPlansSourceRef, debugPlans
 */
export function applyRemoteSnapshot(snapshot, ctx) {
    if (!snapshot) return;

    const {
        setSavedPlans,
        setCurrentPlanId,
        setManualAssignments,
        setManualLines,
        setAssignmentClones,
        setAutoReassignEnabled,
        setFactData,
        setFactDates,
        setRawTables,
        setScheduleDates,
        setPlanHashes,
        setLineTemplates,
        setFloaters,
        setWorkerRegistry,
        applyPlanData,
        loadFromLocalStorage,
        hydrateWorkerRegistry,
        serializeWorkerRegistry,
        setSavedPlansSourceRef,
        debugPlans
    } = ctx;

    const applyField = (key, setter) => {
        const value = snapshot[key];
        if (value === undefined || value === null) return;
        setter((prev) => {
            const stringifiedPrev = JSON.stringify(prev);
            const stringifiedNext = JSON.stringify(value);
            return stringifiedPrev === stringifiedNext ? prev : value;
        });
    };

    const remotePlans = snapshot[STORAGE_KEYS.SAVED_PLANS];
    if (Array.isArray(remotePlans)) {
        debugPlans?.('REMOTE SYNC получено из Firebase', remotePlans);
        setSavedPlansSourceRef?.('applyRemoteSnapshot');
        setSavedPlans((prev) => {
            const local = prev ?? [];
            if (!Array.isArray(local) || local.length === 0) return remotePlans;
            if (JSON.stringify(local) === JSON.stringify(remotePlans)) return prev;
            const localHasMorePlans = local.length > remotePlans.length;
            const localHasEvents = local.some(hasPlanEvents);
            const remoteHasEmptyPlans = remotePlans.some((rp) => !hasPlanEvents(rp));
            if (localHasMorePlans || (localHasEvents && remoteHasEmptyPlans)) {
                debugPlans?.('REMOTE SYNC: предпочитаем ЛОКАЛЬНЫЕ планы', local);
                return local.map((lp) => {
                    const remote = remotePlans.find((rp) => rp.id === lp.id);
                    if (!remote) return lp;
                    if (hasPlanEvents(lp) && !hasPlanEvents(remote)) return lp;
                    return remote;
                });
            }
            return remotePlans.map((rp) => {
                const localPlan = local.find((p) => p.id === rp.id);
                if (hasPlanEvents(localPlan) && !hasPlanEvents(rp)) {
                    return { ...rp, data: { ...rp.data, planningState: localPlan.data.planningState } };
                }
                return rp;
            });
        });

        const preferLocal = (() => {
            const local = loadFromLocalStorage(STORAGE_KEYS.SAVED_PLANS, []);
            if (!Array.isArray(local) || local.length === 0) return false;
            if (local.length > remotePlans.length) return true;
            if (remotePlans.some((rp) => !hasPlanEvents(rp)) && local.some(hasPlanEvents)) return true;
            return false;
        })();

        if (!preferLocal) {
            debugPlans?.('REMOTE SYNC: применены планы из Firebase', remotePlans);
            const remotePlanId = snapshot[STORAGE_KEYS.CURRENT_PLAN_ID];
            if (remotePlanId) {
                setCurrentPlanId((prev) => (prev === remotePlanId ? prev : remotePlanId));
                const planToLoad = remotePlans.find((p) => p.id === remotePlanId);
                if (planToLoad?.data) applyPlanData(planToLoad.data);
            }
        }
    }

    applyField(STORAGE_KEYS.MANUAL_ASSIGNMENTS, setManualAssignments);
    applyField(STORAGE_KEYS.MANUAL_LINES, setManualLines);
    applyField(STORAGE_KEYS.ASSIGNMENT_CLONES, setAssignmentClones);
    applyField(STORAGE_KEYS.AUTO_REASSIGN_ENABLED, setAutoReassignEnabled);
    applyField(STORAGE_KEYS.FACT_DATA, setFactData);
    applyField(STORAGE_KEYS.FACT_DATES, setFactDates);
    applyField(STORAGE_KEYS.RAW_TABLES, setRawTables);
    applyField(STORAGE_KEYS.SCHEDULE_DATES, setScheduleDates);
    applyField(STORAGE_KEYS.PLAN_HASHES, setPlanHashes);
    applyField(STORAGE_KEYS.LINE_TEMPLATES, setLineTemplates);
    applyField(STORAGE_KEYS.FLOATERS, setFloaters);

    const serializedRegistry = snapshot[STORAGE_KEYS.WORKER_REGISTRY];
    if (serializedRegistry) {
        setWorkerRegistry((prev) => {
            const hydrated = hydrateWorkerRegistry(serializedRegistry);
            const stringifiedPrev = JSON.stringify(serializeWorkerRegistry(prev));
            const stringifiedNext = JSON.stringify(serializedRegistry);
            return stringifiedPrev === stringifiedNext ? prev : hydrated;
        });
    }
}

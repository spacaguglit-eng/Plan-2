import { STORAGE_KEYS } from '../utils';

const hasPlanEvents = (p) =>
    (p?.data?.planningState?.products?.length ?? 0) + (p?.data?.planningState?.cipBetween?.length ?? 0) > 0;

function maybeMergePendingPlanningState(plans, currentPlanId, pendingPlanningState) {
    if (!Array.isArray(plans) || !currentPlanId || pendingPlanningState == null) return plans;
    const idx = plans.findIndex((p) => p.id === currentPlanId);
    if (idx === -1) return plans;
    const plan = plans[idx];
    const merged = {
        ...plan,
        data: { ...plan.data, planningState: pendingPlanningState }
    };
    const next = [...plans];
    next[idx] = merged;
    return next;
}

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
        debugPlans,
        getPendingUpdates,
        getPendingMeta,
        pendingUpdates: pendingUpdatesState,
        pendingMeta: pendingMetaState,
        currentClientId,
        currentPlanId,
        addSyncLogMessage
    } = ctx;

    const pending = (typeof getPendingUpdates === 'function' ? getPendingUpdates() : pendingUpdatesState) || {};
    const pendingMetaMap = (typeof getPendingMeta === 'function' ? getPendingMeta() : pendingMetaState) || {};
    const skippedKeys = [];
    const pendingKeysList = Object.keys(pending);
    console.log('[SYNC] applyRemoteSnapshot: ключи в snapshot:', Object.keys(snapshot || {}));
    console.log('[SYNC] applyRemoteSnapshot: pending ключи', pendingKeysList.length ? pendingKeysList : '(нет)', 'currentPlanId:', currentPlanId);

    const unwrap = (entry) => {
        if (entry && typeof entry === 'object' && 'value' in entry) {
            return { value: entry.value, meta: entry._meta || null };
        }
        return { value: entry, meta: null };
    };

    const shouldSkip = (key, remoteEntry) => {
        const { value: remoteVal, meta: remoteMeta } = unwrap(remoteEntry);
        const localMeta = pendingMetaMap[key];
        if (localMeta) {
            const remoteRev = Number(remoteMeta?.rev ?? 0);
            const localRev = Number(localMeta.rev ?? 0);
            if (remoteRev <= localRev) {
                skippedKeys.push(`${key}(rev ${remoteRev}<=${localRev})`);
                console.log('[SYNC] shouldSkip: пропуск по rev', key, 'remoteRev', remoteRev, '<= localRev', localRev);
                return true;
            }
        }
        if (key in pending) {
            try {
                const same = JSON.stringify(pending[key]) === JSON.stringify(remoteVal);
                if (!same) {
                    skippedKeys.push(`${key}(pending mismatch)`);
                    console.log('[SYNC] shouldSkip: пропуск по pending mismatch', key);
                    return true;
                }
            } catch {
                // Если сравнение не удалось — стараемся применить
            }
        }
        return false;
    };

    const applyField = (key, setter) => {
        const entry = snapshot[key];
        if (entry === undefined || entry === null) return;
        if (shouldSkip(key, entry)) return;
        console.log('[SYNC] applyField: применяем из снапшота', key);
        const { value: valueToSet } = unwrap(entry);
        setter((prev) => {
            const stringifiedPrev = JSON.stringify(prev);
            const stringifiedNext = JSON.stringify(valueToSet);
            return stringifiedPrev === stringifiedNext ? prev : valueToSet;
        });
    };

    const remotePlansEntry = snapshot[STORAGE_KEYS.SAVED_PLANS];
    const remotePlansUnwrapped = unwrap(remotePlansEntry);
    const remotePlans = Array.isArray(remotePlansUnwrapped.value) ? remotePlansUnwrapped.value : null;
    const pendingPlanningState = pending[STORAGE_KEYS.PLANNING_STATE];
    const hasPendingPlanningState = pendingPlanningState != null && typeof pendingPlanningState === 'object';
    if (hasPendingPlanningState) {
        console.log('[SYNC] Есть pending PLANNING_STATE — будем подмешивать в текущий план');
    }

    if (remotePlans) {
        if (shouldSkip(STORAGE_KEYS.SAVED_PLANS, remotePlansEntry)) {
            console.log('[SYNC] SAVED_PLANS: пропуск (pending/ревизия новее локально)');
            debugPlans?.('REMOTE SYNC: пропустили SAVED_PLANS (pending/ревизия новее локально)');
        } else {
            debugPlans?.('REMOTE SYNC получено из Firebase', remotePlans);
            setSavedPlansSourceRef?.('applyRemoteSnapshot');
            setSavedPlans((prev) => {
                const local = prev ?? [];
                if (!Array.isArray(local) || local.length === 0) {
                    return maybeMergePendingPlanningState(remotePlans, currentPlanId, pendingPlanningState);
                }
                if (JSON.stringify(local) === JSON.stringify(remotePlans)) return prev;
                const localHasMorePlans = local.length > remotePlans.length;
                const localHasEvents = local.some(hasPlanEvents);
                const remoteHasEmptyPlans = remotePlans.some((rp) => !hasPlanEvents(rp));
                let next;
                if (localHasMorePlans || (localHasEvents && remoteHasEmptyPlans)) {
                    debugPlans?.('REMOTE SYNC: предпочитаем ЛОКАЛЬНЫЕ планы', local);
                    next = local.map((lp) => {
                        const remote = remotePlans.find((rp) => rp.id === lp.id);
                        if (!remote) return lp;
                        if (hasPlanEvents(lp) && !hasPlanEvents(remote)) return lp;
                        return remote;
                    });
                } else {
                    next = remotePlans.map((rp) => {
                        const localPlan = local.find((p) => p.id === rp.id);
                        if (hasPlanEvents(localPlan) && !hasPlanEvents(rp)) {
                            return { ...rp, data: { ...rp.data, planningState: localPlan.data.planningState } };
                        }
                        return rp;
                    });
                }
                return maybeMergePendingPlanningState(next, currentPlanId, pendingPlanningState);
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
                const remotePlanIdEntry = snapshot[STORAGE_KEYS.CURRENT_PLAN_ID];
                const { value: remotePlanId } = unwrap(remotePlanIdEntry);
                if (remotePlanId) {
                    setCurrentPlanId((prev) => (prev === remotePlanId ? prev : remotePlanId));
                    const planToLoad = remotePlans.find((p) => p.id === remotePlanId);
                    if (planToLoad?.data) {
                        let dataToApply = planToLoad.data;
                        if (currentPlanId === remotePlanId && (hasPendingPlanningState || pending[STORAGE_KEYS.MANUAL_LINES] != null || pending[STORAGE_KEYS.MANUAL_ASSIGNMENTS] != null)) {
                            const merged = [];
                            if (hasPendingPlanningState) merged.push('planningState');
                            if (pending[STORAGE_KEYS.MANUAL_LINES] != null) merged.push('manualLines');
                            if (pending[STORAGE_KEYS.MANUAL_ASSIGNMENTS] != null) merged.push('manualAssignments');
                            console.log('[SYNC] applyPlanData: подмешиваем локальный pending в данные плана:', merged);
                            dataToApply = {
                                ...planToLoad.data,
                                ...(hasPendingPlanningState && { planningState: pendingPlanningState }),
                                ...(pending[STORAGE_KEYS.MANUAL_LINES] != null && { manualLines: pending[STORAGE_KEYS.MANUAL_LINES] }),
                                ...(pending[STORAGE_KEYS.MANUAL_ASSIGNMENTS] != null && { manualAssignments: pending[STORAGE_KEYS.MANUAL_ASSIGNMENTS] })
                            };
                        }
                        applyPlanData(dataToApply);
                    }
                }
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
        if (shouldSkip(STORAGE_KEYS.WORKER_REGISTRY, serializedRegistry)) {
            debugPlans?.('REMOTE SYNC: пропустили WORKER_REGISTRY (pending/ревизия новее локально)');
        } else {
            const { value: registryVal } = unwrap(serializedRegistry);
            setWorkerRegistry((prev) => {
                const hydrated = hydrateWorkerRegistry(registryVal);
                const stringifiedPrev = JSON.stringify(serializeWorkerRegistry(prev));
                const stringifiedNext = JSON.stringify(registryVal);
                return stringifiedPrev === stringifiedNext ? prev : hydrated;
            });
        }
    }

    if (skippedKeys.length > 0) {
        const msg = `REMOTE SYNC: пропущены поля (локальные pending/ревизия новее) [${currentClientId ?? 'unknown'}]: ${skippedKeys.join(', ')}`;
        console.log('[SYNC] Итого пропущенные поля:', skippedKeys);
        debugPlans?.(msg);
        if (typeof addSyncLogMessage === 'function') {
            addSyncLogMessage({ id: `sync-skip-${Date.now()}`, type: 'info', message: msg, timestamp: new Date().toISOString() });
        }
    }
}

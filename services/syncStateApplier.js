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
 * @param {Object} ctx — контекст: сеттеры, applyPlanData, getCurrentPlans (текущие планы в памяти), hydrateWorkerRegistry, serializeWorkerRegistry, setSavedPlansSourceRef
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
        setAllEmployees,
        setDepartmentMasterList,
        setPlanningState,
        setProductionResults,
        setProductionExcludedDowntimeTypes,
        applyPlanData,
        getCurrentPlans,
        hydrateWorkerRegistry,
        serializeWorkerRegistry,
        setSavedPlansSourceRef,
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
                // В лог пользователя только если облако реально старее (rev <), иначе это наш же пуш — не спамим
                if (remoteRev < localRev) {
                    skippedKeys.push(`${key}(rev ${remoteRev}<${localRev})`);
                }
                return true;
            }
        }
        if (key in pending) {
            try {
                const same = JSON.stringify(pending[key]) === JSON.stringify(remoteVal);
                if (!same) {
                    skippedKeys.push(`${key}(pending mismatch)`);
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
    if (remotePlans) {
        if (shouldSkip(STORAGE_KEYS.SAVED_PLANS, remotePlansEntry)) {
            // пропуск (pending/ревизия новее локально)
        } else {
            setSavedPlansSourceRef?.('applyRemoteSnapshot');
            setSavedPlans((prev) => {
                const local = prev ?? [];
                if (!Array.isArray(local) || local.length === 0) {
                    return maybeMergePendingPlanningState(remotePlans, currentPlanId, pendingPlanningState);
                }
                if (JSON.stringify(local) === JSON.stringify(remotePlans)) return prev;
                // UNION LOGIC: объединяем планы, отдавая приоритет remote, но сохраняя локальные, которых нет в облаке
                const next = [];
                const processed = new Set();

                // 1. Проходим по remote: берем их (или мержим с local)
                remotePlans.forEach((rp) => {
                    processed.add(rp.id);
                    const lp = local.find((p) => p.id === rp.id);
                    if (lp) {
                        // Конфликт: есть и там и там.
                        // Если локальный "содержательный", а удаленный "пустой" — берем локальный.
                        if (hasPlanEvents(lp) && !hasPlanEvents(rp)) {
                            next.push(lp);
                        } else {
                            // Иначе remote побеждает (или мы берем remote, но подмешиваем planningState, как было в старой логике)
                            // Старая логика (ветка else) делала микс:
                            // return { ...rp, data: { ...rp.data, planningState: localPlan.data.planningState } };
                            // Но ветка if (localHasMorePlans) просто возвращала remote.
                            // Для надежности берем remote, так как это источник правды.
                            next.push(rp);
                        }
                    } else {
                        // Только в remote — оставляем (не даем удалить, если удалено локально, пока нет явного delete-флага)
                        next.push(rp);
                    }
                });

                // 2. Добавляем локальные, которых нет в remote (новые загруженные/созданные)
                local.forEach((lp) => {
                    if (!processed.has(lp.id)) {
                        next.push(lp);
                    }
                });
                return maybeMergePendingPlanningState(next, currentPlanId, pendingPlanningState);
            });

            const preferLocal = (() => {
                const local = (typeof getCurrentPlans === 'function' ? getCurrentPlans() : null) || [];
                if (!Array.isArray(local) || local.length === 0) return false;
                if (local.length > remotePlans.length) return true;
                if (remotePlans.some((rp) => !hasPlanEvents(rp)) && local.some(hasPlanEvents)) return true;
                return false;
            })();

            if (!preferLocal) {
                const remotePlanIdEntry = snapshot[STORAGE_KEYS.CURRENT_PLAN_ID];
                if (!shouldSkip(STORAGE_KEYS.CURRENT_PLAN_ID, remotePlanIdEntry)) {
                    const { value: remotePlanId } = unwrap(remotePlanIdEntry);
                    if (remotePlanId) {
                        setCurrentPlanId((prev) => (prev === remotePlanId ? prev : remotePlanId));
                        const planToLoad = remotePlans.find((p) => p.id === remotePlanId);
                        if (planToLoad?.data) {
                            let dataToApply = planToLoad.data;
                            if (currentPlanId === remotePlanId && (hasPendingPlanningState || pending[STORAGE_KEYS.MANUAL_LINES] != null || pending[STORAGE_KEYS.MANUAL_ASSIGNMENTS] != null)) {
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
    }

    applyField(STORAGE_KEYS.MANUAL_ASSIGNMENTS, setManualAssignments);
    applyField(STORAGE_KEYS.MANUAL_LINES, setManualLines);
    applyField(STORAGE_KEYS.ASSIGNMENT_CLONES, setAssignmentClones);
    applyField(STORAGE_KEYS.AUTO_REASSIGN_ENABLED, setAutoReassignEnabled);
    applyField(STORAGE_KEYS.CURRENT_PLAN_ID, setCurrentPlanId);
    applyField(STORAGE_KEYS.FACT_DATA, setFactData);
    applyField(STORAGE_KEYS.FACT_DATES, setFactDates);
    applyField(STORAGE_KEYS.RAW_TABLES, setRawTables);
    applyField(STORAGE_KEYS.SCHEDULE_DATES, setScheduleDates);
    applyField(STORAGE_KEYS.PLAN_HASHES, setPlanHashes);
    applyField(STORAGE_KEYS.LINE_TEMPLATES, setLineTemplates);
    applyField(STORAGE_KEYS.FLOATERS, setFloaters);
    if (setAllEmployees) applyField(STORAGE_KEYS.ALL_EMPLOYEES, setAllEmployees);
    if (setDepartmentMasterList) applyField(STORAGE_KEYS.DEPARTMENT_MASTER_LIST, setDepartmentMasterList);
    if (setPlanningState) applyField(STORAGE_KEYS.PLANNING_STATE, setPlanningState);
    if (setProductionResults) applyField(STORAGE_KEYS.PRODUCTION_RESULTS, setProductionResults);
    if (setProductionExcludedDowntimeTypes) applyField(STORAGE_KEYS.PRODUCTION_EXCLUDED_DOWNTIME_TYPES, setProductionExcludedDowntimeTypes);

    const serializedRegistry = snapshot[STORAGE_KEYS.WORKER_REGISTRY];
    if (serializedRegistry) {
        if (!shouldSkip(STORAGE_KEYS.WORKER_REGISTRY, serializedRegistry)) {
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
        const msg = `REMOTE SYNC: пропущены поля (pending/ревизия новее) [${currentClientId ?? 'unknown'}]: ${skippedKeys.join(', ')}`;
        if (typeof addSyncLogMessage === 'function') {
            addSyncLogMessage({ id: `sync-skip-${Date.now()}`, type: 'info', message: msg, timestamp: new Date().toISOString() });
        }
    }
}

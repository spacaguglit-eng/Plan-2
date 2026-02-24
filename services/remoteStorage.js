import { STORAGE_KEYS } from '../utils';
import {
    readFirestoreCollection,
    writeFirestoreDoc,
    deleteFirestoreDoc,
    isFirebaseConfigured,
    subscribeToFirestoreCollection
} from './firebaseService';

const FIRESTORE_COLLECTION = import.meta.env.VITE_FIREBASE_STATE_COLLECTION || 'plan_state';
const FIRESTORE_DOCUMENT = import.meta.env.VITE_FIREBASE_STATE_DOC_ID || 'shared';
const DOC_PREFIX = `${FIRESTORE_DOCUMENT}_`;
const PLAN_LIST_DOC_ID = `${DOC_PREFIX}plan_list`;
/** Ид документа плана в Firestore = planId (например plan_123_abc). Отличаем от shared-ключей: shared всегда с DOC_PREFIX. */
const isPlanDocId = (id) => id && id.startsWith('plan_') && !id.startsWith(DOC_PREFIX);
const CLIENT_ID_KEY = 'plan_sync_client_id';

/** Собирает из массива документов коллекции объект state. Shared-ключи: shared_key → key. Каждый план — отдельный документ planId → value. */
const mergeDocsToState = (docs) => {
    const state = {};
    if (!Array.isArray(docs)) return state;
    docs.forEach(({ id, data }) => {
        if (id.startsWith(DOC_PREFIX)) {
            const key = id.slice(DOC_PREFIX.length);
            if (data && typeof data.value !== 'undefined') {
                state[key] = data.value;
            }
        } else if (id === FIRESTORE_DOCUMENT && data && typeof data === 'object') {
            Object.keys(data).forEach((k) => {
                if (k === 'updatedAt') return;
                state[k] = data[k];
            });
        } else if (isPlanDocId(id) && data && typeof data.value !== 'undefined') {
            state[id] = data.value;
        }
    });
    return state;
};

let cachedClientId = null;
const ensureClientId = () => {
    if (cachedClientId) return cachedClientId;
    try {
        const stored = localStorage.getItem(CLIENT_ID_KEY);
        if (stored) {
            cachedClientId = stored;
            return cachedClientId;
        }
        const generated = `client_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
        localStorage.setItem(CLIENT_ID_KEY, generated);
        cachedClientId = generated;
    } catch {
        cachedClientId = `client_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
    }
    return cachedClientId;
};

export const getClientId = () => ensureClientId();

const revisionCounters = {};
const nextRevision = (key) => {
    const now = Date.now();
    revisionCounters[key] = (revisionCounters[key] || 0) + 1;
    return now * 1000 + revisionCounters[key]; // монотонно, с локальным счётчиком
};

const buildEnvelope = (key, value, meta) => {
    const clientId = meta?.clientId || getClientId();
    const rev = Number(meta?.rev ?? nextRevision(key));
    const ts = Number(meta?.ts ?? Date.now());
    return { value, _meta: { clientId, rev, ts } };
};

const normalizeEnvelope = (raw) => {
    if (raw && typeof raw === 'object' && 'value' in raw) {
        return { value: raw.value, _meta: raw._meta || null };
    }
    return { value: raw, _meta: null };
};

/** Из сырой строки или объекта конверта получить ревизию (для сравнения "облако новее?"). */
const getRevFromRaw = (raw) => {
    if (raw == null) return 0;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const rev = Number(parsed?._meta?.rev ?? parsed?.rev ?? 0);
        return rev;
    } catch {
        return 0;
    }
};

// NOTE: принудительно считаем облачное хранилище включённым.
// Это отключает все проверки "настроен ли Firebase" на уровне UI/логики.
// Если Firebase реально не настроен, низкоуровневые функции в firebaseService
// вернут null/пустые значения и операции записи/чтения станут no-op.
export const isRemoteStorageEnabled = () => true;

let logCallback = null;
export const setRemoteLogCallback = (cb) => { logCallback = cb; };

let flushErrorCallback = null;
export const setRemoteFlushErrorCallback = (cb) => { flushErrorCallback = cb; };

let flushSuccessCallback = null;
export const setRemoteFlushSuccessCallback = (cb) => { flushSuccessCallback = cb; };

const addLog = (type, message) => {
    if (logCallback) {
        logCallback({
            id: Date.now() + Math.random(),
            type,
            message,
            timestamp: new Date().toLocaleTimeString()
        });
    }
};

/** Запись планов в Firestore: один документ plan_list (метаданные) + один документ на каждый план. Удаление документов удалённых планов. */
const writePlansToFirestore = async (plans) => {
    if (!Array.isArray(plans)) return;
    const docs = await readFirestoreCollection(FIRESTORE_COLLECTION);
    const existingPlanIds = docs.filter((d) => isPlanDocId(d.id)).map((d) => d.id);
    const newPlanIds = plans.map((p) => p.id);
    const toDelete = existingPlanIds.filter((id) => !newPlanIds.includes(id));
    for (const id of toDelete) {
        await deleteFirestoreDoc(FIRESTORE_COLLECTION, id);
    }
    const planListMeta = plans.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, type: p.type }));
    const planListEnvelope = buildEnvelope(STORAGE_KEYS.SAVED_PLANS, planListMeta);
    await writeFirestoreDoc(FIRESTORE_COLLECTION, PLAN_LIST_DOC_ID, { value: JSON.stringify(planListEnvelope) });
    for (const plan of plans) {
        const envelope = buildEnvelope(plan.id, plan);
        await writeFirestoreDoc(FIRESTORE_COLLECTION, plan.id, { value: JSON.stringify(envelope) });
    }
};

// Queue for debounced updates
let updateQueue = {};
let syncTimeout = null;
let lastKnownState = {}; // Cache to prevent sync loops (serialized envelopes)
let lastKnownValueContent = {}; // По содержимому value — не пушить, если не изменилось

const flushQueue = async () => {
    if (Object.keys(updateQueue).length === 0) return;

    const dataToSave = { ...updateQueue };
    updateQueue = {}; // Clear queue

    try {
        const docs = await readFirestoreCollection(FIRESTORE_COLLECTION);
        const freshData = mergeDocsToState(docs);
        if (Object.keys(freshData).length > 0) {
            Object.keys(freshData).forEach((key) => {
                lastKnownState[key] = freshData[key];
                try {
                    const raw = freshData[key];
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (parsed && typeof parsed.value !== 'undefined') {
                        lastKnownValueContent[key] = JSON.stringify(parsed.value);
                    }
                } catch (_) { }
            });
        }

        const trulyChangedData = {};
        Object.keys(dataToSave).forEach((key) => {
            const ourRaw = dataToSave[key];
            const remoteRaw = lastKnownState[key];
            const ourRev = getRevFromRaw(ourRaw);
            const remoteRev = getRevFromRaw(remoteRaw);
            if (remoteRev > ourRev) return;
            if (ourRaw !== lastKnownState[key]) {
                trulyChangedData[key] = ourRaw;
                lastKnownState[key] = ourRaw;
            }
        });

        if (Object.keys(trulyChangedData).length === 0) return;

        const savedPlansRaw = trulyChangedData[STORAGE_KEYS.SAVED_PLANS];
        if (savedPlansRaw) {
            try {
                const envelope = JSON.parse(savedPlansRaw);
                const plans = envelope?.value;
                if (Array.isArray(plans)) {
                    addLog('syncing', `Синхронизация планов (${plans.length} шт.)...`);
                    await writePlansToFirestore(plans);
                    lastKnownState[STORAGE_KEYS.SAVED_PLANS] = savedPlansRaw;
                    lastKnownValueContent[STORAGE_KEYS.SAVED_PLANS] = JSON.stringify(plans);
                    delete trulyChangedData[STORAGE_KEYS.SAVED_PLANS];
                }
            } catch (e) {
                console.error('writePlansToFirestore failed:', e);
            }
        }

        Object.keys(trulyChangedData).forEach((key) => {
            try {
                const envelope = JSON.parse(trulyChangedData[key]);
                if (envelope && typeof envelope.value !== 'undefined') {
                    lastKnownValueContent[key] = JSON.stringify(envelope.value);
                }
            } catch (_) { }
        });
        const keysToSync = Object.keys(trulyChangedData);
        if (keysToSync.length > 0) {
            addLog('syncing', `Синхронизация изменений (${keysToSync.join(', ')})...`);
            for (const key of keysToSync) {
                const docId = `${DOC_PREFIX}${key}`;
                await writeFirestoreDoc(FIRESTORE_COLLECTION, docId, { value: trulyChangedData[key] });
            }
        }
        addLog('success', 'Облако успешно обновлено');
        const allSyncedKeys = savedPlansRaw ? [STORAGE_KEYS.SAVED_PLANS, ...keysToSync] : keysToSync;
        flushSuccessCallback?.(allSyncedKeys);
    } catch (err) {
        console.error('Batch sync failed:', err);
        addLog('error', `Ошибка синхронизации: ${err.message}`);
        flushErrorCallback?.(err, Object.keys(dataToSave));
    }
};

export const saveRemoteStateKey = async (key, value, meta) => {
    if (!isRemoteStorageEnabled()) return;

    const valueContentStr = JSON.stringify(value);
    if (lastKnownValueContent[key] === valueContentStr) {
        if (updateQueue[key]) {
            delete updateQueue[key];
            if (Object.keys(updateQueue).length === 0 && syncTimeout) {
                clearTimeout(syncTimeout);
                syncTimeout = null;
            }
        }
        return;
    }

    const envelope = buildEnvelope(key, value, meta);
    const serializedValue = JSON.stringify(envelope);
    const queuedValue = updateQueue[key];

    if (lastKnownState[key] === serializedValue) {
        if (queuedValue) delete updateQueue[key];
        if (Object.keys(updateQueue).length === 0 && syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
        }
        return;
    }

    updateQueue[key] = serializedValue;

    // Мгновенная запись в фоне: батчинг только в рамках одного тика (без задержки 400ms)
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(flushQueue, 0);
};

export const loadRemoteState = async () => {
    if (!isRemoteStorageEnabled()) return null;
    try {
        addLog('syncing', 'Загрузка данных из облака...');
        const docs = await readFirestoreCollection(FIRESTORE_COLLECTION);
        const data = mergeDocsToState(docs);
        if (Object.keys(data).length > 0) {
            Object.keys(data).forEach(key => {
                lastKnownState[key] = data[key];
                try {
                    const raw = data[key];
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (parsed && typeof parsed.value !== 'undefined') {
                        lastKnownValueContent[key] = JSON.stringify(parsed.value);
                    }
                } catch (_) { }
            });
        }
        const parsed = parseRemoteData(data);
        const savedPlans = parsed[STORAGE_KEYS.SAVED_PLANS]?.value;
        if (Array.isArray(savedPlans)) {
            lastKnownValueContent[STORAGE_KEYS.SAVED_PLANS] = JSON.stringify(savedPlans);
        }
        return parsed;
    } catch (err) {
        console.error('Failed to load remote state:', err);
        addLog('error', `Ошибка загрузки: ${err.message}`);
        return null;
    }
};

/** Собирает массив планов из plan_list + отдельных документов планов. Поддержка legacy: один документ plan_saved_plans. */
const buildSavedPlansFromState = (data) => {
    const planListRaw = data?.plan_list;
    if (planListRaw != null) {
        let metaList;
        try {
            const parsed = typeof planListRaw === 'string' ? JSON.parse(planListRaw) : planListRaw;
            metaList = (parsed && typeof parsed.value !== 'undefined') ? parsed.value : parsed;
        } catch {
            metaList = null;
        }
        if (Array.isArray(metaList) && metaList.length > 0) {
            const plans = [];
            for (const meta of metaList) {
                const planId = meta?.id;
                if (!planId) continue;
                const raw = data[planId];
                if (raw == null) continue;
                try {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    const envelope = normalizeEnvelope(parsed);
                    if (envelope.value != null) plans.push(envelope.value);
                } catch {
                    // пропуск битого плана
                }
            }
            if (plans.length > 0) return plans;
        }
    }
    const legacyRaw = data?.plan_saved_plans;
    if (legacyRaw != null) {
        try {
            const parsed = typeof legacyRaw === 'string' ? JSON.parse(legacyRaw) : legacyRaw;
            const envelope = normalizeEnvelope(parsed);
            if (Array.isArray(envelope.value)) return envelope.value;
        } catch { }
    }
    return null;
};

const parseRemoteData = (data) => {
    if (!data) return null;
    const parsedData = {};
    Object.keys(data).forEach(key => {
        if (key === 'updatedAt') {
            parsedData[key] = data[key];
            return;
        }
        // Пропускаем plan_list и ID планов, но НЕ пропускаем ключи состояния (STORAGE_KEYS), даже если они начинаются с 'plan_'
        if (key === 'plan_list' || (isPlanDocId(key) && !Object.values(STORAGE_KEYS).includes(key))) return;
        try {
            const val = data[key];
            const parsedVal = typeof val === 'string' ? JSON.parse(val) : val;
            parsedData[key] = normalizeEnvelope(parsedVal);
        } catch (e) {
            parsedData[key] = normalizeEnvelope(data[key]);
        }
    });
    const savedPlans = buildSavedPlansFromState(data);
    if (savedPlans != null) {
        parsedData[STORAGE_KEYS.SAVED_PLANS] = { value: savedPlans, _meta: null };
    }
    return parsedData;
};

export const subscribeToRemoteState = (callback) => {
    if (!isRemoteStorageEnabled()) return () => { };
    return subscribeToFirestoreCollection(FIRESTORE_COLLECTION, (docs, metadata = {}) => {
        const { fromCache = false, hasPendingWrites = false } = metadata;
        if (fromCache || hasPendingWrites) return;
        const data = mergeDocsToState(docs);
        Object.keys(data).forEach(key => {
            lastKnownState[key] = data[key];
            try {
                const raw = data[key];
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (parsed && typeof parsed.value !== 'undefined') {
                    lastKnownValueContent[key] = JSON.stringify(parsed.value);
                }
            } catch (_) { }
        });
        const parsed = parseRemoteData(data);
        const savedPlans = parsed[STORAGE_KEYS.SAVED_PLANS]?.value;
        if (Array.isArray(savedPlans)) {
            lastKnownValueContent[STORAGE_KEYS.SAVED_PLANS] = JSON.stringify(savedPlans);
        }
        callback(parsed);
    });
};

export const loadRemoteStateKey = async (key, defaultValue = null) => {
    const state = await loadRemoteState();
    if (!state) return defaultValue;
    return state[key] ?? defaultValue;
};

/**
 * Записать полный снимок состояния в облако (merge).
 * Не перезаписывает ключи, у которых в облаке ревизия новее, чем revsPerKey[key] (защита при нескольких клиентах).
 * @param {Object} stateObj — объект { [key]: value, ... }
 * @param {Object} [revsPerKey] — опционально { [key]: number } — ревизия, которую мы считаем «нашей»; если в облаке rev больше — ключ не перезаписываем
 */
export const writeFullRemoteState = async (stateObj, revsPerKey = {}) => {
    if (!isRemoteStorageEnabled()) return 0;
    if (!stateObj || typeof stateObj !== 'object') return 0;

    const docs = await readFirestoreCollection(FIRESTORE_COLLECTION);
    const remoteData = mergeDocsToState(docs);
    Object.keys(remoteData).forEach((key) => {
        lastKnownState[key] = remoteData[key];
        try {
            const raw = remoteData[key];
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed.value !== 'undefined') {
                lastKnownValueContent[key] = JSON.stringify(parsed.value);
            }
        } catch (_) { }
    });

    const serialized = {};
    let plansToWrite = null;
    Object.keys(stateObj).forEach((key) => {
        if (key === 'updatedAt') return;
        if (key === STORAGE_KEYS.SAVED_PLANS) {
            const val = stateObj[key];
            if (Array.isArray(val)) plansToWrite = val;
            return;
        }
        const ourRev = Number(revsPerKey[key] ?? 0);
        const remoteRev = getRevFromRaw(remoteData?.[key]);
        if (remoteRev > ourRev) return;
        const val = stateObj[key];
        const envelope = buildEnvelope(key, val);
        serialized[key] = JSON.stringify(envelope ?? null);
    });
    if (Object.keys(serialized).length === 0 && !(plansToWrite && plansToWrite.length > 0)) {
        addLog('info', 'Загрузка в облако: все ключи новее в облаке, ничего не перезаписываем');
        return 0;
    }
    addLog('syncing', 'Запись состояния в облако...');
    try {
        if (plansToWrite && plansToWrite.length > 0) {
            await writePlansToFirestore(plansToWrite);
            lastKnownValueContent[STORAGE_KEYS.SAVED_PLANS] = JSON.stringify(plansToWrite);
        }
        for (const key of Object.keys(serialized)) {
            await writeFirestoreDoc(FIRESTORE_COLLECTION, `${DOC_PREFIX}${key}`, { value: serialized[key] });
        }
        Object.keys(serialized).forEach((k) => {
            lastKnownState[k] = serialized[k];
            try {
                const envelope = JSON.parse(serialized[k]);
                if (envelope && typeof envelope.value !== 'undefined') {
                    lastKnownValueContent[k] = JSON.stringify(envelope.value);
                }
            } catch (_) { }
        });
        addLog('success', 'Данные загружены в облако');
        return Object.keys(serialized).length + (plansToWrite?.length ? 1 : 0);
    } catch (err) {
        console.error('writeFullRemoteState failed:', err);
        addLog('error', `Ошибка: ${err.message}`);
        throw err;
    }
};

export const wipeRemoteStorage = async () => {
    if (!isRemoteStorageEnabled()) return;
    try {
        addLog('syncing', 'Очистка облачного хранилища...');
        const docs = await readFirestoreCollection(FIRESTORE_COLLECTION);
        if (!docs || docs.length === 0) {
            addLog('success', 'Облако уже пусто');
            return;
        }

        const deletePromises = docs.map(d => deleteFirestoreDoc(FIRESTORE_COLLECTION, d.id));
        await Promise.all(deletePromises);

        // Clear local caches
        Object.keys(lastKnownState).forEach(k => delete lastKnownState[k]);
        Object.keys(lastKnownValueContent).forEach(k => delete lastKnownValueContent[k]);
        updateQueue = {};

        addLog('success', 'Облачное хранилище очищено');
    } catch (err) {
        console.error('wipeRemoteStorage failed:', err);
        addLog('error', `Ошибка очистки облака: ${err.message}`);
        throw err;
    }
};

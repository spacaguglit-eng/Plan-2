import {
    readFirestoreDoc,
    readFirestoreCollection,
    writeFirestoreDoc,
    deleteFirestoreDoc,
    isFirebaseConfigured,
    subscribeToFirestoreDoc,
    subscribeToFirestoreCollection
} from './firebaseService';

const FIRESTORE_COLLECTION = import.meta.env.VITE_FIREBASE_STATE_COLLECTION || 'plan_state';
const FIRESTORE_DOCUMENT = import.meta.env.VITE_FIREBASE_STATE_DOC_ID || 'shared';
const DOC_PREFIX = `${FIRESTORE_DOCUMENT}_`;
const CLIENT_ID_KEY = 'plan_sync_client_id';

/** Собирает из массива документов коллекции один объект { key: rawEnvelope }. Поддерживает старый один документ "shared" и новый формат shared_key. */
const mergeDocsToState = (docs) => {
    const state = {};
    if (!Array.isArray(docs)) return state;
    docs.forEach(({ id, data }) => {
        if (id.startsWith(DOC_PREFIX)) {
            const key = id.slice(DOC_PREFIX.length);
            if (data && typeof data.value !== 'undefined') state[key] = data.value;
        } else if (id === FIRESTORE_DOCUMENT && data && typeof data === 'object') {
            Object.keys(data).forEach((k) => {
                if (k === 'updatedAt') return;
                state[k] = data[k];
            });
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

let isUserRemoteEnabled = true;
export const setRemoteEnabledByUser = (enabled) => { isUserRemoteEnabled = enabled; };

export const isRemoteStorageEnabled = () => isFirebaseConfigured() && isUserRemoteEnabled;

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
                } catch (_) {}
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

        Object.keys(trulyChangedData).forEach((key) => {
            try {
                const envelope = JSON.parse(trulyChangedData[key]);
                if (envelope && typeof envelope.value !== 'undefined') {
                    lastKnownValueContent[key] = JSON.stringify(envelope.value);
                }
            } catch (_) {}
        });
        addLog('syncing', `Синхронизация изменений (${Object.keys(trulyChangedData).join(', ')})...`);
        for (const key of Object.keys(trulyChangedData)) {
            await writeFirestoreDoc(FIRESTORE_COLLECTION, `${DOC_PREFIX}${key}`, { value: trulyChangedData[key] });
        }
        addLog('success', 'Облако успешно обновлено');
        flushSuccessCallback?.(Object.keys(trulyChangedData));
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
    
    // Reset debounce timer — короткая задержка для бесшовной синхронизации
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(flushQueue, 400);
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
                } catch (_) {}
            });
        }
        return parseRemoteData(data);
    } catch (err) {
        console.error('Failed to load remote state:', err);
        addLog('error', `Ошибка загрузки: ${err.message}`);
        return null;
    }
};

const parseRemoteData = (data) => {
    if (!data) return null;
    const parsedData = {};
    Object.keys(data).forEach(key => {
        if (key === 'updatedAt') {
            parsedData[key] = data[key];
            return;
        }
        try {
            const val = data[key];
            const parsedVal = typeof val === 'string' ? JSON.parse(val) : val;
            parsedData[key] = normalizeEnvelope(parsedVal);
        } catch (e) {
            parsedData[key] = normalizeEnvelope(data[key]);
        }
    });
    return parsedData;
};

export const subscribeToRemoteState = (callback) => {
    if (!isRemoteStorageEnabled()) return () => {};
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
            } catch (_) {}
        });
        const parsed = parseRemoteData(data);
        callback(parsed);
    });
};

export const loadRemoteStateKey = async (key, defaultValue = null) => {
    const state = await loadRemoteState();
    if (!state) return defaultValue;
    return state[key] ?? defaultValue;
};

/**
 * Записать полный снимок состояния в облако (merge). Для кнопки «Загрузить локальные данные в облако».
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
        } catch (_) {}
    });

    const serialized = {};
    Object.keys(stateObj).forEach((key) => {
        if (key === 'updatedAt') return;
        const ourRev = Number(revsPerKey[key] ?? 0);
        const remoteRev = getRevFromRaw(remoteData?.[key]);
        if (remoteRev > ourRev) return;
        const val = stateObj[key];
        const envelope = buildEnvelope(key, val);
        serialized[key] = JSON.stringify(envelope ?? null);
    });
    if (Object.keys(serialized).length === 0) {
        addLog('info', 'Загрузка в облако: все ключи новее в облаке, ничего не перезаписываем');
        return 0;
    }
    addLog('syncing', 'Загрузка локальных данных в облако...');
    try {
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
            } catch (_) {}
        });
        addLog('success', 'Данные загружены в облако');
        return Object.keys(serialized).length;
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

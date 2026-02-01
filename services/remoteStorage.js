import { readFirestoreDoc, writeFirestoreDoc, isFirebaseConfigured, subscribeToFirestoreDoc } from './firebaseService';

const FIRESTORE_COLLECTION = import.meta.env.VITE_FIREBASE_STATE_COLLECTION || 'plan_state';
const FIRESTORE_DOCUMENT = import.meta.env.VITE_FIREBASE_STATE_DOC_ID || 'shared';

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
let lastKnownState = {}; // Cache to prevent sync loops

const flushQueue = async () => {
    if (Object.keys(updateQueue).length === 0) return;
    
    const dataToSave = { ...updateQueue };
    updateQueue = {}; // Clear queue
    
    try {
        // Final check: filter out items that match lastKnownState
        const trulyChangedData = {};
        Object.keys(dataToSave).forEach(key => {
            if (dataToSave[key] !== lastKnownState[key]) {
                trulyChangedData[key] = dataToSave[key];
                lastKnownState[key] = dataToSave[key]; // Update cache
            }
        });

        if (Object.keys(trulyChangedData).length === 0) return;

        addLog('syncing', `Синхронизация изменений (${Object.keys(trulyChangedData).join(', ')})...`);
        await writeFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT, trulyChangedData);
        addLog('success', 'Облако успешно обновлено');
        flushSuccessCallback?.();
    } catch (err) {
        console.error('Batch sync failed:', err);
        addLog('error', `Ошибка синхронизации: ${err.message}`);
        flushErrorCallback?.(err, Object.keys(trulyChangedData || dataToSave));
    }
};

export const saveRemoteStateKey = async (key, value) => {
    if (!isRemoteStorageEnabled()) return;
    
    const serializedValue = JSON.stringify(value);
    
    // If value is identical to what we last sent or received, skip it
    if (lastKnownState[key] === serializedValue) return;
    
    // Add to queue
    updateQueue[key] = serializedValue;
    
    // Reset debounce timer — короткая задержка для бесшовной синхронизации
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(flushQueue, 400);
};

export const loadRemoteState = async () => {
    if (!isRemoteStorageEnabled()) return null;
    try {
        addLog('syncing', 'Загрузка данных из облака...');
        const data = await readFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT);
        
        // Update cache with raw serialized strings from server
        if (data) {
            Object.keys(data).forEach(key => {
                if (key !== 'updatedAt') lastKnownState[key] = data[key];
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
            parsedData[key] = typeof val === 'string' ? JSON.parse(val) : val;
        } catch (e) {
            parsedData[key] = data[key];
        }
    });
    return parsedData;
};

export const subscribeToRemoteState = (callback) => {
    if (!isRemoteStorageEnabled()) return () => {};
    
    return subscribeToFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT, (data, metadata = {}) => {
        if (!data) return;
        const { fromCache = false, hasPendingWrites = false } = metadata;
        // Применяем только серверные данные: не из кэша и без незакоммиченных локальных записей.
        // Иначе кэш/pending перезаписывают только что сделанные изменения (например автоподстановку).
        if (fromCache || hasPendingWrites) return;
        Object.keys(data).forEach(key => {
            if (key !== 'updatedAt') lastKnownState[key] = data[key];
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
 * @param {Object} stateObj — объект { [key]: value, ... }, значения сериализуются в JSON
 */
export const writeFullRemoteState = async (stateObj) => {
    if (!isRemoteStorageEnabled()) return;
    if (!stateObj || typeof stateObj !== 'object') return;
    const serialized = {};
    Object.keys(stateObj).forEach((key) => {
        if (key === 'updatedAt') return;
        const val = stateObj[key];
        serialized[key] = typeof val === 'string' ? val : JSON.stringify(val ?? null);
    });
    if (Object.keys(serialized).length === 0) return;
    addLog('syncing', 'Загрузка локальных данных в облако...');
    try {
        await writeFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT, serialized);
        Object.keys(serialized).forEach((k) => { lastKnownState[k] = serialized[k]; });
        addLog('success', 'Данные загружены в облако');
    } catch (err) {
        console.error('writeFullRemoteState failed:', err);
        addLog('error', `Ошибка: ${err.message}`);
        throw err;
    }
};

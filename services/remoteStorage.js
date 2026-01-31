import { readFirestoreDoc, writeFirestoreDoc, isFirebaseConfigured } from './firebaseService';

const FIRESTORE_COLLECTION = import.meta.env.VITE_FIREBASE_STATE_COLLECTION || 'plan_state';
const FIRESTORE_DOCUMENT = import.meta.env.VITE_FIREBASE_STATE_DOC_ID || 'shared';

let isUserRemoteEnabled = true;
export const setRemoteEnabledByUser = (enabled) => { isUserRemoteEnabled = enabled; };

export const isRemoteStorageEnabled = () => isFirebaseConfigured() && isUserRemoteEnabled;

let logCallback = null;
export const setRemoteLogCallback = (cb) => { logCallback = cb; };

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

const flushQueue = async () => {
    if (Object.keys(updateQueue).length === 0) return;
    
    const dataToSave = { ...updateQueue };
    updateQueue = {}; // Clear queue
    
    try {
        addLog('syncing', `Синхронизация изменений (${Object.keys(dataToSave).join(', ')})...`);
        await writeFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT, dataToSave);
        addLog('success', 'Облако успешно обновлено');
    } catch (err) {
        console.error('Batch sync failed:', err);
        addLog('error', `Ошибка синхронизации: ${err.message}`);
        // Put failed items back in queue for next attempt? 
        // For now just fail to avoid infinite loops
    }
};

export const saveRemoteStateKey = async (key, value) => {
    if (!isRemoteStorageEnabled()) return;
    
    // Add to queue and stringify immediately to capture state
    updateQueue[key] = JSON.stringify(value);
    
    // Reset debounce timer
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(flushQueue, 2000); // Wait 2 seconds of inactivity
};

export const loadRemoteState = async () => {
    if (!isRemoteStorageEnabled()) return null;
    try {
        addLog('syncing', 'Загрузка данных из облака...');
        const data = await readFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT);
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
    
    return subscribeToFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT, (data) => {
        if (data) {
            const parsed = parseRemoteData(data);
            callback(parsed);
        }
    });
};

export const loadRemoteStateKey = async (key, defaultValue = null) => {
    const state = await loadRemoteState();
    if (!state) return defaultValue;
    return state[key] ?? defaultValue;
};

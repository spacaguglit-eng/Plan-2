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

export const saveRemoteStateKey = async (key, value) => {
    if (!isRemoteStorageEnabled()) return;
    try {
        addLog('syncing', `Сохранение ${key}...`);
        
        // Firestore doesn't support nested arrays (like Excel tables).
        // We stringify the value to ensure it can be saved regardless of depth.
        const serializedValue = JSON.stringify(value);
        
        await writeFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT, { [key]: serializedValue });
        addLog('success', `Успешно сохранено: ${key}`);
    } catch (err) {
        console.error(`Failed to save ${key} to Firebase:`, err);
        addLog('error', `Ошибка сохранения ${key}: ${err.message}`);
        throw err;
    }
};

export const loadRemoteState = async () => {
    if (!isRemoteStorageEnabled()) return null;
    try {
        addLog('syncing', 'Загрузка данных из облака...');
        const data = await readFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT);
        if (!data) return null;

        // Parse serialized values back to objects
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

        addLog('success', 'Данные из облака успешно загружены');
        return parsedData;
    } catch (err) {
        console.error('Failed to load remote state:', err);
        addLog('error', `Ошибка загрузки: ${err.message}`);
        return null;
    }
};

export const loadRemoteStateKey = async (key, defaultValue = null) => {
    const state = await loadRemoteState();
    if (!state) return defaultValue;
    return state[key] ?? defaultValue;
};

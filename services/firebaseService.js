import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore,
    doc,
    collection,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp
} from 'firebase/firestore';

const FIREBASE_CONFIG = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const isConfigReady = () => Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.appId
);

let firestoreInstance = null;

const ensureApp = () => {
    if (getApps().length === 0) {
        if (!isConfigReady()) {
            console.warn('Firebase config is missing, remote storage disabled.');
            return null;
        }
        initializeApp(FIREBASE_CONFIG);
    }
    return getApp();
};

export const getFirestoreInstance = () => {
    if (firestoreInstance) return firestoreInstance;
    const app = ensureApp();
    if (!app) return null;
    firestoreInstance = getFirestore(app);
    return firestoreInstance;
};

const getDocRef = (collectionName, docId) => {
    const db = getFirestoreInstance();
    if (!db) return null;
    return doc(db, collectionName, docId);
};

export const readFirestoreDoc = async (collectionName, docId) => {
    const docRef = getDocRef(collectionName, docId);
    if (!docRef) return null;
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? snapshot.data() : null;
};

export const writeFirestoreDoc = async (collectionName, docId, data = {}) => {
    const docRef = getDocRef(collectionName, docId);
    if (!docRef) return;
    await setDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    }, { merge: true });
};

export const deleteFirestoreDoc = async (collectionName, docId) => {
    const docRef = getDocRef(collectionName, docId);
    if (!docRef) return;
    await deleteDoc(docRef);
};

export const subscribeToFirestoreDoc = (collectionName, docId, callback) => {
    const docRef = getDocRef(collectionName, docId);
    if (!docRef) return () => { };
    return onSnapshot(docRef, snapshot => {
        const data = snapshot.exists() ? snapshot.data() : null;
        const fromCache = snapshot.metadata?.fromCache ?? false;
        const hasPendingWrites = snapshot.metadata?.hasPendingWrites ?? false;
        callback(data, { fromCache, hasPendingWrites });
    });
};

/** Читает все документы коллекции. Возвращает массив { id, data }. */
export const readFirestoreCollection = async (collectionName) => {
    const db = getFirestoreInstance();
    if (!db) return [];
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
};

/** Подписка на изменения всей коллекции. callback(docs: { id, data }[]) вызывается при любом изменении. */
export const subscribeToFirestoreCollection = (collectionName, callback) => {
    const db = getFirestoreInstance();
    if (!db) return () => { };
    const colRef = collection(db, collectionName);
    return onSnapshot(colRef, snapshot => {
        const docs = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
        const fromCache = snapshot.metadata?.fromCache ?? false;
        const hasPendingWrites = snapshot.metadata?.hasPendingWrites ?? false;
        callback(docs, { fromCache, hasPendingWrites });
    });
};

export const isFirebaseConfigured = () => isConfigReady();

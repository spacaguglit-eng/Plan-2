import React, { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { STORAGE_KEYS } from '../utils';
import {
    subscribeToRemoteState,
    isRemoteStorageEnabled,
    setRemoteLogCallback,
    setRemoteEnabledByUser,
    setRemoteFlushSuccessCallback,
    saveRemoteStateKey,
    writeFullRemoteState,
    getClientId,
    wipeRemoteStorage
} from '../services/remoteStorage';
const SyncContext = createContext(null);

/**
 * Синхронизация только с облаком (Firestore).
 * - подписка на удалённый снапшот
 * - persistStateKey — только в облако
 * - статус и лог синхронизации
 */
export const SyncProvider = ({ children }) => {
    const useRemoteStorage = true; // всегда облако, локальное хранилище отключено
    const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'saved' | 'error'
    const [syncLog, setSyncLog] = useState([]);
    const [showSyncLog, setShowSyncLog] = useState(false);
    const [remoteSnapshot, setRemoteSnapshot] = useState(null);
    const [pendingUpdates, setPendingUpdates] = useState({});
    const [pendingMeta, setPendingMeta] = useState({});

    const pendingUpdatesRef = useRef({});
    const pendingMetaRef = useRef({});
    const clientIdRef = useRef(getClientId());

    const unwrapSnapshotValue = useCallback((entry) => {
        if (entry && typeof entry === 'object' && 'value' in entry) {
            return { value: entry.value, meta: entry._meta || null };
        }
        return { value: entry, meta: null };
    }, []);

    // Подписка на удалённый снапшот
    useEffect(() => {
        setRemoteEnabledByUser(true);
        if (!isRemoteStorageEnabled()) {
            setRemoteSnapshot(null);
            return () => {};
        }
        const unsubscribe = subscribeToRemoteState((parsed) => {
            setRemoteSnapshot(parsed);
        });
        return () => unsubscribe();
    }, []);

    // Лог сообщений от remoteStorage
    useEffect(() => {
        setRemoteLogCallback((log) => {
            setSyncLog((prev) => [log, ...prev].slice(0, 50));
        });
        return () => setRemoteLogCallback(null);
    }, []);

    // Успешная запись в облако — сбрасываем статус
    useEffect(() => {
        setRemoteFlushSuccessCallback((keys) => {
            setSyncStatus('idle');
        });
        return () => setRemoteFlushSuccessCallback(null);
    }, []);

    const persistStateKey = useCallback((key, value) => {
        const meta = { clientId: clientIdRef.current, rev: Date.now(), ts: Date.now() };
        pendingUpdatesRef.current = { ...pendingUpdatesRef.current, [key]: value };
        pendingMetaRef.current = { ...pendingMetaRef.current, [key]: meta };
        setPendingUpdates((prev) => ({ ...prev, [key]: value }));
        setPendingMeta((prev) => ({ ...prev, [key]: meta }));
        saveRemoteStateKey(key, value, meta).catch((err) =>
            console.error(`Error saving ${key} to remote:`, err)
        );
    }, []);

    const pushLocalToCloud = useCallback(
        async (getFullState) => {
            if (!isRemoteStorageEnabled()) {
                return { ok: false, error: 'no_config' };
            }
            if (typeof getFullState !== 'function') {
                return { ok: false, error: 'no_getter' };
            }
            setSyncStatus('syncing');
            try {
                const result = getFullState();
                const stateObj = result?.stateObj != null ? result.stateObj : result;
                const revsPerKey = result?.revsPerKey != null ? result.revsPerKey : {};
                const keysWritten = await writeFullRemoteState(stateObj, revsPerKey);
                setSyncStatus('saved');
                setTimeout(() => setSyncStatus('idle'), 1200);
                return { ok: true, keysWritten: keysWritten ?? 0 };
            } catch (err) {
                setSyncStatus('error');
                return { ok: false, error: err?.message };
            }
        },
        []
    );

    const cloudStatus = useMemo(() => {
        if (!isRemoteStorageEnabled()) return { status: 'off' };
        if (remoteSnapshot === null) return { status: 'loading' };
        const plans = unwrapSnapshotValue(remoteSnapshot?.[STORAGE_KEYS.SAVED_PLANS]).value;
        if (Array.isArray(plans) && plans.length > 0) return { status: 'has_data', planCount: plans.length };
        const keys = Object.keys(remoteSnapshot || {}).filter((k) => k !== 'updatedAt');
        if (keys.length > 0) return { status: 'has_data' };
        return { status: 'empty' };
    }, [remoteSnapshot, unwrapSnapshotValue]);

    const value = useMemo(
        () => ({
            useRemoteStorage,
            setUseRemoteStorage: () => {}, // no-op, всегда облако
            syncStatus,
            setSyncStatus,
            syncLog,
            setSyncLog,
            showSyncLog,
            setShowSyncLog,
            addSyncLogMessage: (log) => setSyncLog((prev) => [log, ...prev].slice(0, 50)),
            remoteSnapshot,
            pendingUpdates,
            setPendingUpdates,
            pendingMeta,
            setPendingMeta,
            pendingUpdatesRef,
            pendingMetaRef,
            clientIdRef,
            unwrapSnapshotValue,
            persistStateKey,
            pushLocalToCloud,
            cloudStatus,
            isRemoteStorageEnabled,
            wipeRemoteStorage
        }),
        [
            syncStatus,
            syncLog,
            showSyncLog,
            remoteSnapshot,
            pendingUpdates,
            pendingMeta,
            unwrapSnapshotValue,
            persistStateKey,
            pushLocalToCloud,
            cloudStatus
        ]
    );

    return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export const useSync = () => {
    const context = useContext(SyncContext);
    if (context == null || typeof context !== 'object') {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
};

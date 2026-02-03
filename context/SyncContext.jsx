import React, { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { STORAGE_KEYS, saveToLocalStorage, loadFromLocalStorage } from '../utils';
import {
    subscribeToRemoteState,
    isRemoteStorageEnabled,
    setRemoteLogCallback,
    setRemoteEnabledByUser,
    setRemoteFlushSuccessCallback,
    saveRemoteStateKey,
    writeFullRemoteState,
    getClientId
} from '../services/remoteStorage';
import { log as debugLog } from '../utils/debug';

const SyncContext = createContext(null);

/**
 * Вся логика синхронизации с облаком в одном месте:
 * - подписка на удалённый снапшот
 * - pending-обновления и их сброс при совпадении с remote
 * - persistStateKey (облако или localStorage)
 * - pushLocalToCloud (полная выгрузка локального состояния)
 * - статус и лог синхронизации
 */
export const SyncProvider = ({ children }) => {
    const [useRemoteStorage, setUseRemoteStorage] = useState(() =>
        loadFromLocalStorage(STORAGE_KEYS.STORAGE_MODE, true)
    );
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
        if (!isRemoteStorageEnabled() || !useRemoteStorage) {
            setRemoteSnapshot(null);
            return () => {};
        }
        const unsubscribe = subscribeToRemoteState((parsed) => {
            setRemoteSnapshot(parsed);
        });
        return () => unsubscribe();
    }, [useRemoteStorage]);

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
            if (Array.isArray(keys) && keys.length > 0) {
                debugLog('sync', 'Успешная запись в облако:', keys);
            }
        });
        return () => setRemoteFlushSuccessCallback(null);
    }, []);

    // Режим облака: синхронизируем с localStorage и сервисом
    useEffect(() => {
        setRemoteEnabledByUser(useRemoteStorage);
        saveToLocalStorage(STORAGE_KEYS.STORAGE_MODE, useRemoteStorage);
    }, [useRemoteStorage]);

    const persistStateKey = useCallback((key, value) => {
        if (useRemoteStorage) {
            const meta = { clientId: clientIdRef.current, rev: Date.now(), ts: Date.now() };
            pendingUpdatesRef.current = { ...pendingUpdatesRef.current, [key]: value };
            pendingMetaRef.current = { ...pendingMetaRef.current, [key]: meta };
            debugLog('sync', 'persistStateKey: добавлен в pending', key, 'rev:', meta.rev);
            setPendingUpdates((prev) => ({ ...prev, [key]: value }));
            setPendingMeta((prev) => ({ ...prev, [key]: meta }));
            saveRemoteStateKey(key, value, meta).catch((err) =>
                console.error(`Error saving ${key} to remote:`, err)
            );
        } else {
            saveToLocalStorage(key, value);
        }
    }, [useRemoteStorage]);

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
        if (!useRemoteStorage || !isRemoteStorageEnabled()) return { status: 'off' };
        if (remoteSnapshot === null) return { status: 'loading' };
        const plans = unwrapSnapshotValue(remoteSnapshot?.[STORAGE_KEYS.SAVED_PLANS]).value;
        if (Array.isArray(plans) && plans.length > 0) return { status: 'has_data', planCount: plans.length };
        const keys = Object.keys(remoteSnapshot || {}).filter((k) => k !== 'updatedAt');
        if (keys.length > 0) return { status: 'has_data' };
        return { status: 'empty' };
    }, [useRemoteStorage, remoteSnapshot, unwrapSnapshotValue]);

    const value = useMemo(
        () => ({
            useRemoteStorage,
            setUseRemoteStorage,
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
            isRemoteStorageEnabled
        }),
        [
            useRemoteStorage,
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

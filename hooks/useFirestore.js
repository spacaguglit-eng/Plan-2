import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    readFirestoreDoc,
    writeFirestoreDoc,
    isFirebaseConfigured,
    subscribeToFirestoreDoc
} from '../services/firebaseService';

const FIRESTORE_COLLECTION = import.meta.env.VITE_FIREBASE_STATE_COLLECTION || 'plan_state';
const FIRESTORE_DOCUMENT = import.meta.env.VITE_FIREBASE_STATE_DOC_ID || 'shared';

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

const fetchRemoteState = async () => {
    const data = await readFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT);
    return parseRemoteData(data);
};

/**
 * Подписка на Firestore-документ с кэшированием через React Query.
 * Реал-тайм обновления через onSnapshot.
 */
export function useFirestoreDoc(options = {}) {
    const { collection = FIRESTORE_COLLECTION, docId = FIRESTORE_DOCUMENT, enabled = true } = options;
    const queryClient = useQueryClient();
    const queryKey = ['firestore', collection, docId];
    const unsubRef = useRef(null);

    const query = useQuery({
        queryKey,
        queryFn: fetchRemoteState,
        enabled: enabled && isFirebaseConfigured(),
        staleTime: 30_000,
        retry: 2
    });

    useEffect(() => {
        if (!enabled || !isFirebaseConfigured()) return;
        unsubRef.current = subscribeToFirestoreDoc(collection, docId, (rawData) => {
            const parsed = parseRemoteData(rawData);
            queryClient.setQueryData(queryKey, parsed);
        });
        return () => {
            if (unsubRef.current) unsubRef.current();
        };
    }, [collection, docId, enabled, queryClient, queryKey]);

    return query;
}

/**
 * Мутация для записи в Firestore. Поддерживает optimistic updates.
 */
export function useFirestoreMutation(options = {}) {
    const queryClient = useQueryClient();
    const queryKey = ['firestore', FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT];

    return useMutation({
        mutationFn: async ({ key, value, fullData }) => {
            if (fullData) {
                const serialized = {};
                Object.keys(fullData).forEach(k => {
                    if (k !== 'updatedAt') serialized[k] = typeof fullData[k] === 'string' ? fullData[k] : JSON.stringify(fullData[k]);
                });
                await writeFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT, serialized);
            } else if (key != null) {
                const serialized = typeof value === 'string' ? value : JSON.stringify(value);
                await writeFirestoreDoc(FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT, { [key]: serialized });
            }
        },
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData(queryKey);
            if (variables.fullData) {
                queryClient.setQueryData(queryKey, variables.fullData);
            } else if (variables.key != null && variables.optimisticValue !== undefined) {
                queryClient.setQueryData(queryKey, prev => ({
                    ...prev,
                    [variables.key]: variables.optimisticValue
                }));
            }
            return { previous };
        },
        onError: (err, variables, context) => {
            if (context?.previous != null) {
                queryClient.setQueryData(queryKey, context.previous);
            }
            options.onError?.(err, variables, context);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
            options.onSettled?.();
        },
        ...options
    });
}

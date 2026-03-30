/**
 * Данные вкладки «Производство» только в localStorage, без синхронизации с облаком.
 * Ключи отделены от остальных STORAGE_KEYS приложения.
 */
import { STORAGE_KEYS } from '../utils';

const K = {
    RESULTS: 'plan_scheduler_production_tab.results.v1',
    EXCLUDED: 'plan_scheduler_production_tab.excludedDowntimeTypes.v1',
    NORMS: 'plan_scheduler_production_tab.lineNorms.v1',
};

function safeSet(key, value) {
    if (typeof localStorage === 'undefined') return;
    try {
        if (value === null || value === undefined) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error('productionTabStorage write', key, e);
    }
}

function safeGet(key) {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** Однократный перенос со старых ключей (те же имена, что раньше шли в облако/localStorage). */
function migrateLegacyIfEmpty() {
    if (typeof localStorage === 'undefined') return;
    try {
        if (localStorage.getItem(K.RESULTS) != null) return;

        const r = localStorage.getItem(STORAGE_KEYS.PRODUCTION_RESULTS);
        const e = localStorage.getItem(STORAGE_KEYS.PRODUCTION_EXCLUDED_DOWNTIME_TYPES);
        const n = localStorage.getItem(STORAGE_KEYS.PRODUCTION_LINE_NORMS);
        if (r == null && e == null && n == null) return;

        if (r != null) {
            const parsed = JSON.parse(r);
            localStorage.setItem(K.RESULTS, JSON.stringify(parsed));
        }
        if (e != null) localStorage.setItem(K.EXCLUDED, e);
        if (n != null) localStorage.setItem(K.NORMS, n);

        localStorage.removeItem(STORAGE_KEYS.PRODUCTION_RESULTS);
        localStorage.removeItem(STORAGE_KEYS.PRODUCTION_EXCLUDED_DOWNTIME_TYPES);
        localStorage.removeItem(STORAGE_KEYS.PRODUCTION_LINE_NORMS);
    } catch (err) {
        console.error('productionTabStorage migrate', err);
    }
}

export function loadProductionTabSnapshot() {
    migrateLegacyIfEmpty();
    return {
        results: safeGet(K.RESULTS),
        excluded: safeGet(K.EXCLUDED),
        norms: safeGet(K.NORMS),
    };
}

export function saveProductionTabResults(value) {
    safeSet(K.RESULTS, value);
}

export function saveProductionTabExcluded(value) {
    safeSet(K.EXCLUDED, value);
}

export function saveProductionTabNorms(value) {
    safeSet(K.NORMS, value);
}

export function clearProductionTabStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(K.RESULTS);
        localStorage.removeItem(K.EXCLUDED);
        localStorage.removeItem(K.NORMS);
    } catch (_) {}
}

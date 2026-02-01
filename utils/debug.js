/**
 * Модуль отладки: категории логов с описаниями, включаемые/выключаемые отдельно.
 * Состояние хранится в localStorage.
 */

const STORAGE_KEY = 'plan_debug_enabled';

export const DEBUG_CATEGORIES = {
    plans: {
        label: 'Планы',
        description: 'Загрузка/сохранение планов, RESTORE, CREATE, LOAD, DELETE, REMOTE SYNC с Firebase'
    },
    roster: {
        label: 'Справочник (Roster)',
        description: 'Парсинг листа Люд, создание линий, позиций, резерв'
    },
    optimization: {
        label: 'Оптимизация переходов',
        description: 'Line products, transition rules, CIP durations перед запуском оптимизатора'
    },
    workerTransition: {
        label: 'Worker: Transition Optimizer',
        description: 'Правила переходов в воркере оптимизации'
    }
};

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('debug: не удалось сохранить состояние', e);
    }
}

let _state = loadState();

export function isEnabled(key) {
    return _state[key] === true;
}

export function setEnabled(key, value) {
    _state[key] = !!value;
    saveState(_state);
}

export function getState() {
    return { ..._state };
}

export function getDebugFlagsForWorker() {
    return {
        workerTransition: isEnabled('workerTransition')
    };
}

/**
 * Логирует в console.log, если категория включена.
 * @param {string} key - ключ категории (plans, roster, optimization, workerTransition)
 * @param {...any} args - аргументы для console.log
 */
export function log(key, ...args) {
    if (isEnabled(key)) {
        const label = DEBUG_CATEGORIES[key]?.label || key;
        console.log(`[${label}]`, ...args);
    }
}

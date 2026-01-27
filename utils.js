// src/utils.js

// --- CONSTANTS ---
export const STORAGE_KEYS = {
    RAW_TABLES: 'plan_raw_tables',
    MANUAL_ASSIGNMENTS: 'plan_manual_assignments',
    PLAN_HASHES: 'plan_hashes',
    LINE_TEMPLATES: 'plan_line_templates',
    WORKER_REGISTRY: 'plan_worker_registry',
    FLOATERS: 'plan_floaters',
    SCHEDULE_DATES: 'plan_schedule_dates',
    FACT_DATA: 'plan_fact_data',
    FACT_DATES: 'plan_fact_dates',
    ALL_EMPLOYEES: 'plan_all_employees',
    SAVED_PLANS: 'plan_saved_plans',
    CURRENT_PLAN_ID: 'plan_current_plan_id',
    AUTO_REASSIGN_ENABLED: 'plan_auto_reassign_enabled',
    ASSIGNMENTS_BACKUP: 'plan_assignments_backup',
    DEPARTMENT_MASTER_LIST: 'plan_department_master_list',
    PLANNING_STATE: 'plan_planning_state'
};

// --- LOCAL STORAGE HELPERS ---
export const saveToLocalStorage = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving to localStorage:', e);
    }
};

export const loadFromLocalStorage = (key, defaultValue = null) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.error('Error loading from localStorage:', e);
        return defaultValue;
    }
};

// --- GENERAL HELPERS ---
export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

export const cleanVal = (val) => String(val ?? '').trim();

export const extractShiftNumber = (str) => (String(str).match(/\d+/) || [])[0] || null;

export const normalizeName = (name) => {
    return String(name).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я]/g, '');
};

export const matchNames = (name1, name2) => {
    if (!name1 || !name2) return false;

    const n1 = String(name1).toLowerCase().trim();
    const n2 = String(name2).toLowerCase().trim();

    if (normalizeName(n1) === normalizeName(n2)) return true;

    const parts1 = n1.split(/\s+/).filter(p => p.length > 0);
    const parts2 = n2.split(/\s+/).filter(p => p.length > 0);

    if (parts1.length === 0 || parts2.length === 0) return false;

    const surname1 = normalizeName(parts1[0]);
    const surname2 = normalizeName(parts2[0]);

    if (surname1 !== surname2) return false;
    if (parts1.length === 1 && parts2.length === 1) return true;

    const firstName1 = parts1.length >= 2 ? parts1[1].replace(/\./g, '').trim() : '';
    const firstName2 = parts2.length >= 2 ? parts2[1].trim() : '';
    const middleName1 = parts1.length >= 3 ? parts1[2].replace(/\./g, '').trim() : '';
    const middleName2 = parts2.length >= 3 ? parts2[2].trim() : '';

    let firstNameMatch = false;
    if (firstName1 && firstName2) {
        if ((firstName1.length === 1 && firstName2.length > 1) || 
            (firstName1.length > 1 && firstName2.length === 1) || 
            (firstName1[0] === firstName2[0])) {
            firstNameMatch = firstName1[0] === firstName2[0];
        }
    } else if (!firstName1 && !firstName2) {
        firstNameMatch = true;
    }

    let middleNameMatch = false;
    if (middleName1 && middleName2) {
        if ((middleName1.length === 1 && middleName2.length > 1) || 
            (middleName1.length > 1 && middleName2.length === 1) || 
            (middleName1[0] === middleName2[0])) {
            middleNameMatch = middleName1[0] === middleName2[0];
        }
    } else if (!middleName1 && !middleName2) {
        middleNameMatch = true;
    } else if ((!middleName1 && middleName2) || (middleName1 && !middleName2)) {
        middleNameMatch = true;
    }

    if (firstNameMatch) {
        if (middleName1 || middleName2) {
            return middleNameMatch;
        }
        return true;
    }

    if (firstName1 && firstName2 && firstName1[0] === firstName2[0]) {
        if (middleName1 && middleName2 && middleName1[0] === middleName2[0]) {
            return true;
        } else if (!middleName1 && !middleName2) {
            return true;
        }
    }

    const n1Clean = normalizeName(n1);
    const n2Clean = normalizeName(n2);
    if (n1Clean.length > 8 && n2Clean.length > 8) {
        if (n1Clean.includes(n2Clean) || n2Clean.includes(n1Clean)) return true;
    }

    return false;
};

export const isLineMatch = (planLine, rosterLine) => {
    if (!planLine || !rosterLine) return false;
    const p = String(planLine).toLowerCase().trim();
    const r = String(rosterLine).toLowerCase().trim();
    const pClean = p.replace(/[^a-zа-я0-9]/g, '');
    const rClean = r.replace(/[^a-zа-я0-9]/g, '');
    if (pClean === rClean) return true;
    if (pClean.length > 3 && rClean.length > 3) {
        if (pClean.includes(rClean) || rClean.includes(pClean)) return true;
    }
    const pNums = p.match(/\d+/g);
    const rNums = r.match(/\d+/g);
    if (pNums && rNums) {
        return pNums.some(pn => rNums.includes(pn));
    }
    return false;
};

export const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

export const parseWorkerStatus = (statusStr) => {
    if (!statusStr || statusStr.length < 5) return null;
    const lower = statusStr.toLowerCase();

    let type = null;
    if (lower.includes('отпуск')) type = 'vacation';
    else if (lower.includes('больничный')) type = 'sick';
    else if (lower.includes('увольнение') || lower.includes('уволен')) type = 'fired';

    if (!type) return null;

    const dateMatch = statusStr.match(/(\d{1,2})[\.\/](\d{1,2})\s*[-–—]\s*(\d{1,2})[\.\/](\d{1,2})/);

    if (dateMatch) {
        const currentYear = new Date().getFullYear();
        const fromDate = new Date(currentYear, parseInt(dateMatch[2]) - 1, parseInt(dateMatch[1]));
        let toDate = new Date(currentYear, parseInt(dateMatch[4]) - 1, parseInt(dateMatch[3]));
        if (toDate < fromDate) toDate.setFullYear(currentYear + 1);
        return { type, from: fromDate, to: toDate, raw: statusStr };
    }
    if (type === 'fired') return { type, raw: statusStr, permanent: true };
    return { type, raw: statusStr, permanent: false };
};

export const checkWorkerAvailability = (workerName, dateStr, registry) => {
    if (!registry || !registry[workerName]) return { available: true };
    const statusData = registry[workerName].status;
    if (!statusData) return { available: true };

    const [d, m, y] = dateStr.split('.').map(Number);
    const targetDate = new Date(y, m - 1, d);

    const s = statusData;
    if (s.permanent) return { available: false, reason: s.raw, type: s.type };

    if (s.from && s.to) {
        targetDate.setHours(0, 0, 0, 0);
        const from = new Date(s.from); from.setHours(0, 0, 0, 0);
        const to = new Date(s.to); to.setHours(0, 0, 0, 0);
        if (targetDate >= from && targetDate <= to) return { available: false, reason: s.raw, type: s.type };
    }
    return { available: true };
};

export const getRealNeighborDateStrings = (dateStr) => {
    const [d, m, y] = dateStr.split('.').map(Number);
    const date = new Date(y, m - 1, d);

    const prevDate = new Date(date);
    prevDate.setDate(date.getDate() - 1);

    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    const format = (dt) => {
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();
        return `${day}.${month}.${year}`;
    };

    return {
        prev: format(prevDate),
        next: format(nextDate)
    };
};

export const parseCellStrict = (cellValue) => {
    if (!cellValue || typeof cellValue !== 'string') return { inTime: null, outTime: null };
    const parts = cellValue.split(/\r?\n/);
    const cleanTime = (t) => {
        if (!t) return null;
        const clean = t.trim().toLowerCase();
        if (clean === 'нет' || clean === '' || !clean.includes(':')) return null;
        const match = clean.match(/(\d{1,2}):(\d{2})/);
        return match ? match[0] : null;
    };
    let rawIn = parts[0];
    let rawOut = parts.length > 1 ? parts[parts.length - 1] : null;
    return {
        inTime: cleanTime(rawIn),
        outTime: cleanTime(rawOut)
    };
};

// Форматирование даты без учета часового пояса (использует локальные компоненты даты)
export const formatDateLocal = (date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    // Используем локальные компоненты даты для избежания сдвига из-за часового пояса
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
};

// Нормализация даты из Excel (преобразует в локальную дату без учета часового пояса)
export const normalizeExcelDate = (dateVal) => {
    if (!dateVal) return null;
    
    // Если это число Excel (количество дней с 1900-01-01)
    if (typeof dateVal === 'number') {
        // Excel считает даты как количество дней с 1900-01-01
        // Но есть баг: Excel считает 1900 високосным годом, хотя это не так
        const excelEpoch = new Date(1899, 11, 30); // 30 декабря 1899
        const msPerDay = 24 * 60 * 60 * 1000;
        const date = new Date(excelEpoch.getTime() + dateVal * msPerDay);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
    
    if (dateVal instanceof Date) {
        // Используем локальные компоненты даты для избежания сдвига из-за часового пояса
        return new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate());
    }
    
    if (typeof dateVal === 'string') {
        // Парсим строку как локальную дату
        let d;
        if (dateVal.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
            // Формат DD.MM.YYYY
            const [day, month, year] = dateVal.split('.').map(Number);
            d = new Date(year, month - 1, day);
        } else {
            d = new Date(dateVal);
        }
        if (!isNaN(d.getTime())) {
            // Используем локальные компоненты даты
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
    }
    return null;
};
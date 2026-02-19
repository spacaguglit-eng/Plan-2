/**
 * Логика сравнения плановых простоев с нормативами (порт из Пример/main.py и norms.py).
 * Чистый JS, без зависимостей от React и worker.
 */

// Все категории для таблицы нормативов (порядок как в norms.py)
export const ALL_CATEGORIES = [
    'СИП 1',
    'СИП 2',
    'СИП 3',
    'Смена этикетки',
    'Смена ЧЗ',
    'Смена пленки',
    'Переналадка',
    'Вытеснение',
    'Запуск',
    'Лаборатория',
    'Мойка',
    'Окончание розлива',
    'Ополаскивание',
    'Остановка розлива',
    'Смена ассортимента',
    'Смена партии',
    'Подача продукта',
    'Подготовка купажа',
];

// Порт _RAW_PATTERNS из main.py (регексы для нормализации описания в категорию)
const RAW_PATTERNS = [
    ['СИП 1', ['сип\\s*1\\b', 'сип1\\b']],
    ['СИП 2', ['сип\\s*2\\b', 'сип2\\b']],
    ['СИП 3', ['сип\\s*3\\b', 'сип3\\b']],
    ['Смена этикетки', ['этик[её]тк', 'етикетк', 'этиккетк', 'этиктетк', 'этик[её]т[её]к', 'смена\\s+этик', 'этикетк']],
    ['Смена ЧЗ', ['чз', 'ч\\s*з', 'смена\\s*ч\\s*з', 'смена\\s*чз', 'чз\\s*\\(общ', 'ч\\.?\\s*з\\s*\\(общ', 'настройк\\w*\\s*ч\\s*з', 'настройк\\w*\\s*чз', '\\bчз\\b', '\\bч\\s*з\\b']],
    ['Смена пленки', ['пленк[иа]?', 'пл[её]нк', 'смена\\s+пленк', 'пленка']],
    ['Переналадка', ['переналадк', 'переналад', 'переналадка']],
    ['Вытеснение', ['вытеснен', 'втеснен', 'втеснение', 'вытесн\\w*в\\s+банан']],
    ['Запуск', ['запуск\\s+линии', 'запуск\\s+продукт', 'плановый\\s+запуск', 'запуск\\b']],
    ['Лаборатория', ['лаборатор']],
    ['Мойка', ['мойк[аи]\\s+', 'мойк[аи]$', 'мойк\\s+фильтр', 'мойк\\s+купаж', 'м[оа]йк\\w*фильтр', 'промывк[аи]\\s+фильтр']],
    ['Окончание розлива', ['окончание\\s+розлив', 'окнчание\\s+розлив', 'окончание\\s+программ', 'окнчание\\s+программ']],
    ['Ополаскивание', ['опласкиван', 'ополаскиван']],
    ['Остановка розлива', ['остановк\\w*\\s+розлив', 'остоновк']],
    ['Смена ассортимента', ['смена\\s+ассортимент', 'смена\\s+т\\.?\\s*м\\.?', 'переход\\s+на\\s+другой\\s+продукт', 'переход\\s+на\\s+тм', 'переход\\s+на\\s+энергетик']],
    ['Смена партии', ['смена\\s+партии', 'смена\\s+дат\\w*']],
    ['Подача продукта', ['подач[аи]\\s+продукт', 'ожидание\\s+продукт']],
    ['Подготовка купажа', ['подг[ао]?товк\\w*\\s+купаж', 'подг[ао]?товк\\w*\\s+упаж', 'подготовк\\w*\\s+купаж', 'подготовк\\w*\\s+упаж']],
];

export const DOWNTIME_NORMALIZE_PATTERNS = RAW_PATTERNS.map(([name, patterns]) => ({
    name,
    patterns: patterns.map((p) => new RegExp(p.replace(/ё/g, 'е'), 'iu')),
}));

/**
 * Нормализация описания простоя в категорию из ALL_CATEGORIES.
 * @param {string} description
 * @returns {string|null} имя категории или null
 */
export function normalizeDowntimeDescription(description) {
    if (!description || !String(description).trim()) return null;
    const s = String(description).trim().toLowerCase().replace(/\s+/g, ' ');
    for (const { name, patterns } of DOWNTIME_NORMALIZE_PATTERNS) {
        for (const pat of patterns) {
            if (pat.test(s)) return name;
        }
    }
    return null;
}

/**
 * Плановый простой: в category или type есть «планов» (без учёта регистра).
 * @param {{ category?: string, type?: string }} row
 */
export function isPlannedDowntime(row) {
    const t = String((row && row.type) || '').trim().toLowerCase();
    const k = String((row && row.category) || '').trim().toLowerCase();
    return /планов/.test(t) || /планов/.test(k);
}

/**
 * Время (строка HH:MM или число-доля дня) в минуты от полуночи.
 * @param {string|number|null|undefined} val
 * @returns {number|null}
 */
export function parseTimeToMinutes(val) {
    if (val == null) return null;
    if (typeof val === 'number') {
        if (val >= 0 && val < 1) return Math.round(val * 24 * 60);
        return Math.round(val);
    }
    const trimmed = String(val).trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        return hours * 60 + minutes;
    }
    const num = parseFloat(trimmed.replace(',', '.'));
    if (!Number.isNaN(num)) {
        if (num >= 0 && num < 1) return Math.round(num * 24 * 60);
        return Math.round(num);
    }
    return null;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Длительность в минутах; при переходе через полночь (end < start) — интервал на следующие сутки.
 * @param {number|null} startM
 * @param {number|null} endM
 * @returns {number|null}
 */
export function durationMinutes(startM, endM) {
    if (startM == null || endM == null) return null;
    if (endM >= startM) return endM - startM;
    return MINUTES_PER_DAY - startM + endM;
}

function downtimeDurationMin(row) {
    const startM = parseTimeToMinutes(row.start);
    const endM = parseTimeToMinutes(row.end);
    return durationMinutes(startM, endM);
}

/** Минуты от полуночи → строка ЧЧ:ММ */
export function minutesToTime(minutes) {
    if (minutes == null) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function padCol(s, width) {
    const str = String(s ?? '').slice(0, width);
    return str.padEnd(width);
}

function fmtDebugCell(val, maxLen = 36) {
    if (val == null || val === '') return '—';
    if (typeof val === 'number') {
        if (Number.isInteger(val) || Math.abs(val - Math.round(val)) < 1e-6) return String(Math.round(val));
        return Math.abs(val) < 1e6 ? val.toFixed(2) : String(Math.round(val));
    }
    const s = String(val).trim();
    return s.length > maxLen ? s.slice(0, maxLen - 2) + '…' : s;
}

function intStr(value) {
    return value != null ? String(Math.round(value)) : '-';
}

/**
 * Категория простоя: сначала проверка по колонке H (если совпадает с ALL_CATEGORIES), затем по DOWNTIME_NORMALIZE_PATTERNS (описание).
 * @param {{ description?: string, category?: string }} row
 * @returns {string|null}
 */
export function categoryFromDowntime(row) {
    const categoryFromH = String((row.category || '')).trim();
    if (categoryFromH) {
        const lower = categoryFromH.toLowerCase();
        const exact = ALL_CATEGORIES.find((c) => c.toLowerCase() === lower);
        if (exact) return exact;
    }
    const text = String((row.description || row.category || '')).trim();
    if (!text) return null;
    const s = text.toLowerCase().replace(/\s+/g, ' ');
    for (const { name, patterns } of DOWNTIME_NORMALIZE_PATTERNS) {
        for (const pat of patterns) {
            if (pat.test(s)) return name;
        }
    }
    return null;
}

/**
 * Объединяет подряд идущие простои одной распознанной категории с соприкасающимися интервалами.
 * Если СИП заканчивается в одной смене (например 20:00) и продолжается во второй (начало 20:00) — мержит в один интервал, норма не задваивается.
 * Мержим по категории (распознанной) для всех строк, не только «плановые».
 * @param {Array<{ start?: string, end?: string, category?: string, type?: string, description?: string, [key: string]: any }>} rows
 * @returns {Array<{ start?: string, end?: string, category?: string, type?: string, description?: string, [key: string]: any }>}
 */
export function mergeAdjacentSameCategoryDowntimes(rows) {
    if (!rows || rows.length === 0) return [];
    const withCat = rows.map((d) => {
        const cat = categoryFromDowntime(d);
        const startM = d.start ? parseTimeToMinutes(d.start) : null;
        const endM = d.end ? parseTimeToMinutes(d.end) : null;
        return { d, cat, startM, endM };
    });
    withCat.sort((a, b) => {
        const aNull = a.startM == null ? 1 : 0;
        const bNull = b.startM == null ? 1 : 0;
        if (aNull !== bNull) return aNull - bNull;
        return (a.startM || 0) - (b.startM || 0);
    });
    const merged = [];
    let i = 0;
    while (i < withCat.length) {
        const { d, cat, startM, endM } = withCat[i];
        if (cat == null || startM == null || endM == null) {
            merged.push(d);
            i += 1;
            continue;
        }
        let current = { ...d };
        let currEndM = endM;
        let j = i + 1;
        while (j < withCat.length) {
            const next = withCat[j];
            if (next.cat !== cat || next.startM == null || next.endM == null) break;
            if (next.startM !== currEndM) break;
            current = { ...current, end: next.d.end };
            currEndM = next.endM;
            j += 1;
        }
        merged.push(current);
        i = j;
    }
    return merged;
}

/**
 * Из row.line («Линия № 5») или row.fileName извлечь номер линии для ключа в lineNorms.
 * @param {{ line?: string, fileName?: string }} row
 * @returns {string|null} "1".."12" или null
 */
export function getLineNumberFromRow(row) {
    if (!row) return null;
    const line = String((row.line || '')).trim();
    const m1 = line.match(/линия\s*№?\s*(\d+)/i) || line.match(/(\d+)/);
    if (m1) return String(parseInt(m1[1], 10));
    const fileName = String((row.fileName || '')).trim();
    const m2 = fileName.match(/линия\s*№?\s*(\d+)/i);
    if (m2) return String(parseInt(m2[1], 10));
    return null;
}

/**
 * Группирует flatDowntimeRows по (lineKey, date, shift), затем для каждой группы мержит и сравнивает с нормами.
 * @param {Array<{ line?: string, fileName?: string, date?: string, shift?: string, start?: string, end?: string, durationMinutes?: number|null, category?: string, type?: string, description?: string }>} flatDowntimeRows
 * @param {Record<string, Record<string, number>>} lineNorms { "1": { "СИП 1": 30, ... }, ... }
 * @returns {{ comparison: string[], other: string[] }}
 */
export function compareDowntimesToNorms(flatDowntimeRows, lineNorms) {
    const comparison = [];
    const other = [];
    if (!flatDowntimeRows || flatDowntimeRows.length === 0) return { comparison, other };

    const groups = new Map();
    for (const row of flatDowntimeRows) {
        const lineKey = getLineNumberFromRow(row);
        if (lineKey == null) continue;
        const date = row.date || '';
        const shift = row.shift || '';
        const key = `${lineKey}\t${date}\t${shift}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    for (const [key, rows] of groups) {
        const [lineKey, date, shift] = key.split('\t');
        const lineNum = lineKey;
        const normsForLine = (lineNorms && lineNorms[lineKey]) || {};
        const merged = mergeAdjacentSameCategoryDowntimes(rows);
        for (const d of merged) {
            const descDisplay = (d.description || d.category || '—').trim() || '—';
            if (!isPlannedDowntime(d)) continue;
            const cat = categoryFromDowntime(d);
            if (cat == null) {
                other.push(
                    `    Линия ${lineNum}, ${date} (${shift}): ${descDisplay} (${d.start || '—'}–${d.end || '—'}) — не распознан (нет совпадения с категориями)`
                );
                continue;
            }
            const norm = normsForLine[cat];
            if (norm == null || norm <= 0) {
                other.push(
                    `    Линия ${lineNum}, ${date} (${shift}): ${cat} (${descDisplay}) ${d.start || '—'}–${d.end || '—'} — норма не задана`
                );
                continue;
            }
            const duration = d.durationMinutes != null ? Math.round(d.durationMinutes) : (d.start && d.end ? durationMinutes(parseTimeToMinutes(d.start), parseTimeToMinutes(d.end)) : null);
            if (duration == null) {
                other.push(
                    `    Линия ${lineNum}, ${date} (${shift}): ${cat} (${descDisplay}) ${d.start || '—'}–${d.end || '—'} — не удалось посчитать длительность`
                );
                continue;
            }
            const timeRange = ` ${d.start || '—'}–${d.end || '—'}`;
            if (duration > norm) {
                comparison.push(
                    `    Линия ${lineNum}, ${date} (${shift}): ${cat}${timeRange} — факт ${duration} мин, норма ${norm} мин [превышение ${duration - norm} мин]`
                );
            } else {
                comparison.push(
                    `    Линия ${lineNum}, ${date} (${shift}): ${cat}${timeRange} — факт ${duration} мин, норма ${norm} мин — в норме`
                );
            }
        }
    }
    return { comparison, other };
}

/** Типовые значения нормы (мин) для UI */
export const NORM_CHOICES = [0, 10, 15, 20, 25, 30, 40, 45, 60, 90, 120, 150, 180, 200, 240, 250, 270, 300, 360, 420, 480, 540, 600, 720];

/** Вшитые нормативы из Пример/config.json (line_norms). Линия 11 — копия линии 10. */
const BUILTIN_LINE_NORMS = {
    '1': { 'СИП 1': 40, 'СИП 2': 240, 'СИП 3': 300, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 15, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '2': { 'СИП 1': 40, 'СИП 2': 240, 'СИП 3': 300, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 15, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '3': { 'СИП 1': 40, 'СИП 2': 240, 'СИП 3': 300, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 15, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '4': { 'СИП 1': 40, 'СИП 2': 150, 'СИП 3': 200, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 15, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '5': { 'СИП 1': 40, 'СИП 2': 90, 'СИП 3': 200, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 15, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '6': { 'СИП 1': 30, 'СИП 2': 120, 'СИП 3': 180, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 180, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 10, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '7': { 'СИП 1': 30, 'СИП 2': 120, 'СИП 3': 120, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 10, 'Вытеснение': 30, 'Запуск': 10, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 10, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '8': { 'СИП 1': 30, 'СИП 2': 240, 'СИП 3': 300, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 10, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '9': { 'СИП 1': 30, 'СИП 2': 240, 'СИП 3': 300, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 15, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '10': { 'СИП 1': 30, 'СИП 2': 150, 'СИП 3': 200, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 10, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '11': { 'СИП 1': 30, 'СИП 2': 150, 'СИП 3': 200, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 300, 'Вытеснение': 30, 'Запуск': 30, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 10, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
    '12': { 'СИП 1': 30, 'СИП 2': 30, 'СИП 3': 30, 'Смена этикетки': 10, 'Смена ЧЗ': 10, 'Смена пленки': 10, 'Переналадка': 10, 'Вытеснение': 10, 'Запуск': 10, 'Лаборатория': 10, 'Мойка': 10, 'Окончание розлива': 10, 'Ополаскивание': 10, 'Остановка розлива': 10, 'Смена ассортимента': 10, 'Смена партии': 10, 'Подача продукта': 10, 'Подготовка купажа': 10 },
};

/**
 * Дефолтные нормативы по линиям: вшитые из config.json; при отсутствии линии — СИП 1/2/3 = 30 мин, остальные = 0.
 * @param {number[]} lineNumbers например [1,2,3,4,5,6,7,8,9,10,11]
 * @returns {Record<string, Record<string, number>>}
 */
export function getDefaultLineNorms(lineNumbers) {
    const sipDefault = 30;
    const out = {};
    for (const n of lineNumbers) {
        const key = String(n);
        const builtin = BUILTIN_LINE_NORMS[key];
        if (builtin) {
            out[key] = { ...builtin };
        } else {
            out[key] = {};
            for (const cat of ALL_CATEGORIES) {
                out[key][cat] = (cat === 'СИП 1' || cat === 'СИП 2' || cat === 'СИП 3') ? sipDefault : 0;
            }
        }
    }
    return out;
}

const PLAN_DEBUG_W = { val: 40, t: 12, n: 8, num: 9, time: 18, dur: 14, catFile: 18, recognized: 10, cat: 22, desc: 36, norm: 10 };

/**
 * Расчёт плана по (линия, дата) с учётом нормативов: work_time, norms_sum, available_min, план = avg_speed * (available_min/60).
 * @param {Array<{ line?: string, fileName?: string, date?: string, shift?: string, start?: string, end?: string, speed?: number, product?: string, qty?: number }>} flatRows
 * @param {Array<{ line?: string, fileName?: string, date?: string, shift?: string, start?: string, end?: string, durationMinutes?: number|null, category?: string, type?: string, description?: string }>} flatDowntimeRows
 * @param {Record<string, Record<string, number>>} lineNorms
 * @returns {{ planByLineDate: Record<string, Record<string, number>>, factByLineDate: Record<string, Record<string, number>>, debugByLineDate: Record<string, Record<string, string[]>>, workTimeByLineDate: Record<string, Record<string, number>>, availableByLineDate: Record<string, Record<string, number>>, normsBreakdownByLineDate: Record<string, Record<string, Record<string, number>>> }}
 */
export function computePlanByLineDate(flatRows, flatDowntimeRows, lineNorms) {
    const planByLineDate = {};
    const factByLineDate = {};
    const debugByLineDate = {};
    const workTimeByLineDate = {};
    const availableByLineDate = {};
    const normsBreakdownByLineDate = {};
    if (!flatRows || flatRows.length === 0) return { planByLineDate, factByLineDate, debugByLineDate, workTimeByLineDate, availableByLineDate, normsBreakdownByLineDate };

    const rowGroups = new Map();
    for (const row of flatRows) {
        const lineKey = getLineNumberFromRow(row);
        if (lineKey == null) continue;
        const date = String(row.date ?? '').trim();
        if (!date) continue;
        const key = `${lineKey}\t${date}`;
        if (!rowGroups.has(key)) rowGroups.set(key, []);
        rowGroups.get(key).push(row);
    }

    // Группировка по (линия, дата) без разделения по сменам — СИП, переходящий с одной смены на другую, потом мержится в один интервал и не задваивается
    const downtimeGroups = new Map();
    for (const row of flatDowntimeRows || []) {
        const lineKey = getLineNumberFromRow(row);
        if (lineKey == null) continue;
        const date = String(row.date ?? '').trim();
        if (!date) continue;
        const key = `${lineKey}\t${date}`;
        if (!downtimeGroups.has(key)) downtimeGroups.set(key, []);
        downtimeGroups.get(key).push(row);
    }

    for (const [key, rows] of rowGroups) {
        const [lineKey, date] = key.split('\t');
        const normsForLine = (lineNorms && lineNorms[lineKey]) || {};
        const downtimes = downtimeGroups.get(key) || [];
        const merged = mergeAdjacentSameCategoryDowntimes(downtimes);

        const durations = [];
        let sumSpeedDur = 0;
        let sumDur = 0;
        for (const r of rows) {
            const startM = parseTimeToMinutes(r.start);
            const endM = parseTimeToMinutes(r.end);
            const dur = durationMinutes(startM, endM);
            if (dur != null && dur > 0) durations.push(dur);
            const speed = typeof r.speed === 'number' ? r.speed : parseFloat(r.speed);
            if (dur != null && dur > 0 && !Number.isNaN(speed)) {
                sumSpeedDur += speed * dur;
                sumDur += dur;
            }
        }
        const work_time_min = durations.length ? durations.reduce((a, b) => a + b, 0) : null;
        const avg_speed = sumDur > 0 ? sumSpeedDur / sumDur : null;

        // В нормативные простои — только распознанные плановые: и «планов» в типе/категории, и категория по шаблону
        let norms_sum = 0;
        const normsBreakdown = /** @type {Record<string, number>} */ ({});
        for (const d of merged) {
            if (!isPlannedDowntime(d)) continue;
            const cat = categoryFromDowntime(d);
            if (cat == null) continue;
            const n = normsForLine[cat];
            if (n == null || n <= 0) continue;
            let mins = 0;
            if (cat === 'СИП 1' || cat === 'СИП 2' || cat === 'СИП 3') {
                mins = n;
                norms_sum += n;
            } else {
                const dur = d.durationMinutes != null ? Math.round(d.durationMinutes) : (d.start && d.end ? durationMinutes(parseTimeToMinutes(d.start), parseTimeToMinutes(d.end)) : null);
                mins = dur != null ? Math.min(dur, n) : n;
                norms_sum += mins;
            }
            normsBreakdown[cat] = (normsBreakdown[cat] || 0) + mins;
        }
        const available_min = work_time_min != null ? Math.max(0, work_time_min - norms_sum) : 0;
        const plan = avg_speed != null && available_min > 0
            ? Math.round(avg_speed * (available_min / 60))
            : 0;
        const fact = rows.reduce((acc, r) => acc + (typeof r.qty === 'number' ? r.qty : parseFloat(r.qty) || 0), 0);

        if (!planByLineDate[lineKey]) planByLineDate[lineKey] = {};
        planByLineDate[lineKey][date] = plan;
        if (!factByLineDate[lineKey]) factByLineDate[lineKey] = {};
        factByLineDate[lineKey][date] = Math.round(fact);
        if (!workTimeByLineDate[lineKey]) workTimeByLineDate[lineKey] = {};
        workTimeByLineDate[lineKey][date] = work_time_min != null ? work_time_min : 0;
        if (!availableByLineDate[lineKey]) availableByLineDate[lineKey] = {};
        availableByLineDate[lineKey][date] = available_min;
        if (!normsBreakdownByLineDate[lineKey]) normsBreakdownByLineDate[lineKey] = {};
        normsBreakdownByLineDate[lineKey][date] = normsBreakdown;

        const debug = [];
        debug.push('');
        debug.push(`========== Линия ${lineKey}, день ${date} ==========`);
        debug.push('  Данные A:');
        const w = PLAN_DEBUG_W;
        const dataAHeader =
            `    ${padCol('value', w.val)} | ${padCol('start', w.t)} | ${padCol('end', w.t)} | ` +
            `${padCol('speed', w.n)} | ${padCol('start_мин', w.num)} | ${padCol('end_мин', w.num)} | ${padCol('длит_мин', w.num)} | ${padCol('скорость', w.num)}`;
        debug.push(dataAHeader);
        for (const d of rows) {
            const startM = parseTimeToMinutes(d.start);
            const endM = parseTimeToMinutes(d.end);
            const speedF = typeof d.speed === 'number' ? d.speed : parseFloat(d.speed);
            const dur = durationMinutes(startM, endM);
            const val = fmtDebugCell(d.product ?? d.value, w.val);
            debug.push(
                `    ${padCol(val, w.val)} | ${padCol(d.start ?? '-', w.t)} | ${padCol(d.end ?? '-', w.t)} | ` +
                `${padCol(d.speed ?? '-', w.n)} | ${padCol(intStr(startM), w.num)} | ${padCol(intStr(endM), w.num)} | ${padCol(intStr(dur), w.num)} | ${padCol(fmtDebugCell(speedF, w.num), w.num)}`
            );
        }
        debug.push('  Простои:');
        const downtimesHeader =
            `    ${padCol('время нач.-кон.', w.time)} | ${padCol('длительность', w.dur)} | ${padCol('категория (H)', w.catFile)} | ${padCol('распознано', w.recognized)} | ${padCol('категория по шаблону', w.cat)} | ${padCol('описание', w.desc)} | ${padCol('норма мин', w.norm)}`;
        debug.push(downtimesHeader);
        for (const d of merged) {
            const planned = isPlannedDowntime(d);
            const startM = parseTimeToMinutes(d.start);
            const endM = parseTimeToMinutes(d.end);
            const timeRange = `${minutesToTime(startM)}–${minutesToTime(endM)}`;
            const durationMin = d.durationMinutes != null ? Math.round(d.durationMinutes) : (d.start && d.end ? durationMinutes(parseTimeToMinutes(d.start), parseTimeToMinutes(d.end)) : null);
            const durStr = durationMin != null ? `${durationMin} мин` : '—';
            // Распознавание по описанию для всех строк (для отладки); в расчёте норм учитываются только плановые
            const cat = categoryFromDowntime(d);
            const catFile = ((d.category || '—').trim() || '—');
            const recognizedStr = cat ? 'да' : 'нет';
            const catTemplate = cat || 'не распознан';
            const n = cat ? normsForLine[cat] : null;
            const nStr = n != null && n > 0 ? String(n) : (cat ? '—' : (planned ? 'не распознан' : '—'));
            const desc = fmtDebugCell((d.description || d.category || '—').trim() || '—', w.desc);
            debug.push(
                `    ${padCol(timeRange, w.time)} | ${padCol(durStr, w.dur)} | ${padCol(catFile, w.catFile)} | ${padCol(recognizedStr, w.recognized)} | ${padCol(catTemplate, w.cat)} | ${padCol(desc, w.desc)} | ${padCol(nStr, w.norm)}`
            );
        }
        debug.push(`  Время работы: сумма длительностей интервалов [${durations.join(', ')}] = ${work_time_min ?? '—'} мин`);
        debug.push(`  Средняя скорость: sum_speed_dur=${sumSpeedDur.toFixed(1)}, sum_dur=${sumDur} → avg_speed=${avg_speed != null ? avg_speed.toFixed(1) : '—'}`);
        if (work_time_min == null || work_time_min <= 0) {
            debug.push(`Линия ${lineKey}, день ${date}: нет данных по времени работы`);
        } else if (avg_speed == null) {
            debug.push(`Линия ${lineKey}, день ${date}: не удалось посчитать среднюю скорость`);
        } else {
            debug.push(`  Норм. простои: ${norms_sum} мин. Доступно: ${available_min} мин. План = ${avg_speed.toFixed(1)} * (${available_min}/60) = ${plan}`);
            debug.push(`  Факт (столбец K) = ${Math.round(fact)}`);
            debug.push(`Линия ${lineKey}, день ${date}: скорость ${avg_speed.toFixed(1)} шт/ч, время ${work_time_min} мин, норм. простои ${norms_sum} мин, доступно ${available_min} мин → план = ${plan}, факт = ${Math.round(fact)}`);
        }
        if (!debugByLineDate[lineKey]) debugByLineDate[lineKey] = {};
        debugByLineDate[lineKey][date] = debug;
    }
    return { planByLineDate, factByLineDate, debugByLineDate, workTimeByLineDate, availableByLineDate, normsBreakdownByLineDate };
}

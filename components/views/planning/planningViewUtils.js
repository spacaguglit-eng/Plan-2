/** Product parsing */
export const PRODUCT_PARSE_PATTERN = /^(?<type>Сироп|Нектар|Сок|Топпинг|Основа|Концентрат|Морс|Лимонад|Пюре|Переборка|соус|Тоник|Энергетический напиток|Напиток(?: с витаминами| тонизирующий)?)\s+(?<flavor>.+?)(?=\s+\d+(?:[,.]\d+)?\s*(?:л|кг|мл|г)|\s+0,33|\s+ТМ\s*[«"]?|\s*[-–—]\s*\d|\s*$)(?:\s+(?<volume>\d+(?:[,.]\d+)?\s*(?:л|кг|мл|г)|0,33))?(?:\s+(?:ПЭТ|ст|бут))?(?:\s+ТМ\s*(?:[«"](?<brand>[^"»]+)[»"]|(?<brand>[^\s\t]+)))?(?:\s*(?:[-–—])?\s*(?<qty>[\d\s]+)(?:\s*(?:шт|шт\.|штук))?)?/iu;

export function extractTypeFlavor(value) {
    if (!value) return { type: '', flavor: '' };
    const match = String(value).match(PRODUCT_PARSE_PATTERN);
    if (!match?.groups?.type || !match?.groups?.flavor) {
        return { type: '', flavor: '' };
    }
    return {
        type: match.groups.type.trim(),
        flavor: match.groups.flavor.trim()
    };
}

export function buildTransitionKey(type, flavor) {
    return [type, flavor]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

export function canonicalTransitionKey(key) {
    if (key == null || key === '') return '';
    return String(key).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function extractProductParts(value) {
    if (!value) return { type: '', flavor: '', volume: '', brand: '' };
    const match = String(value).match(PRODUCT_PARSE_PATTERN);
    if (!match?.groups?.type || !match?.groups?.flavor) {
        return { type: '', flavor: '', volume: '', brand: '' };
    }
    const volume = match.groups.volume ? match.groups.volume.replace(',', '.').trim() : '';
    const brand = match.groups.brand ? match.groups.brand.trim() : '';
    return {
        type: match.groups.type.trim(),
        flavor: match.groups.flavor.trim(),
        volume,
        brand
    };
}

export function normalizeVolumeForCompare(vol) {
    if (!vol || typeof vol !== 'string') return '';
    return vol.replace(/\s+/g, ' ').replace(',', '.').trim().toLowerCase();
}

export function splitTransitionList(value) {
    return String(value || '')
        .split(/[,;\n]+/)
        .map(item => item.trim())
        .filter(Boolean);
}

export function normalizeVolume(value) {
    if (!value) return '';
    return String(value)
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/,/g, '.');
}

/** Date/time */
export function parseNumeric(value) {
    if (value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/[^\d.]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function parseTimeToMinutes(value) {
    if (!value || !value.includes(':')) return 0;
    const [h, m] = value.split(':').map(v => parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return Math.max(0, Math.min(1439, h * 60 + m));
}

export function formatMinutesToTime(value) {
    const safe = Math.max(0, Math.min(1439, Math.round(value)));
    const h = String(Math.floor(safe / 60)).padStart(2, '0');
    const m = String(safe % 60).padStart(2, '0');
    return `${h}:${m}`;
}

export function formatDateInputValue(value) {
    if (!value || !value.includes('.')) return '';
    const [day, month, year] = value.split('.');
    if (!day || !month || !year) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseDateInputValue(value) {
    if (!value || !value.includes('-')) return '';
    const [year, month, day] = value.split('-');
    if (!day || !month || !year) return '';
    return `${day}.${month}.${year}`;
}

export function parseDateToDayIndex(value) {
    if (!value || !value.includes('.')) return null;
    const [dayStr, monthStr, yearStr] = value.split('.');
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    const utc = Date.UTC(year, month - 1, day);
    if (!Number.isFinite(utc)) return null;
    return Math.floor(utc / 86400000);
}

export function formatDayIndexToDate(dayIndex) {
    if (!Number.isFinite(dayIndex)) return '01.01.1970';
    const date = new Date(dayIndex * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}.${month}.${year}`;
}

export function parseLineDatesInput(value) {
    const input = String(value || '').trim();
    if (!input) return { dates: [], errors: [] };
    const tokens = input.split(',').map((t) => t.trim()).filter(Boolean);
    const dates = new Set();
    const errors = [];
    tokens.forEach((token) => {
        const parts = token.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
        if (parts.length === 1) {
            const idx = parseDateToDayIndex(parts[0]);
            if (idx == null) {
                errors.push(`Некорректная дата: ${token}`);
            } else {
                dates.add(formatDayIndexToDate(idx));
            }
            return;
        }
        if (parts.length === 2) {
            const startIdx = parseDateToDayIndex(parts[0]);
            const endIdx = parseDateToDayIndex(parts[1]);
            if (startIdx == null || endIdx == null) {
                errors.push(`Некорректный диапазон: ${token}`);
                return;
            }
            const from = Math.min(startIdx, endIdx);
            const to = Math.max(startIdx, endIdx);
            for (let d = from; d <= to; d += 1) {
                dates.add(formatDayIndexToDate(d));
            }
            return;
        }
        errors.push(`Некорректный диапазон: ${token}`);
    });
    const sorted = Array.from(dates).sort((a, b) => (parseDateToDayIndex(a) ?? 0) - (parseDateToDayIndex(b) ?? 0));
    return { dates: sorted, errors };
}

/** Shifts */
export function buildDefaultShifts(dateStr) {
    return [
        { shiftId: '1', type: 'День', date: dateStr, start: '08:00', end: '20:00' },
        { shiftId: '2', type: 'Ночь', date: dateStr, start: '20:00', end: '08:00' }
    ];
}

export function buildShiftsFromRows(rows, defaultDate) {
    const allDates = Array.from(new Set(rows.map((r) => r.date).filter(Boolean)));
    const productDates = new Set(rows.filter((r) => r.kind === 'product').map((r) => r.date).filter(Boolean));
    const sourceDates = productDates.size > 0 ? Array.from(productDates) : allDates;
    const sortedDates = sourceDates.sort((a, b) => {
        const [da, ma, ya] = a.split('.').map(Number);
        const [db, mb, yb] = b.split('.').map(Number);
        return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });
    if (sortedDates.length === 0) return buildDefaultShifts(defaultDate);
    const result = [];
    sortedDates.forEach((d) => {
        result.push(...buildDefaultShifts(d));
    });
    return result;
}

export function buildLineWorkRows(lineDatesMap) {
    const rows = [];
    Object.entries(lineDatesMap || {}).forEach(([line, dates]) => {
        (dates || []).forEach((date) => {
            rows.push({
                line,
                date,
                start: '08:00',
                end: '08:00',
                manualStart: true,
                manualEnd: true,
                kind: 'line',
                name: `Работа ${line}`,
                durationMinutes: 1440
            });
        });
    });
    return rows;
}

/** Product paste / import */
export function parseProductPaste(text, includeQty) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return [];
    const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach((line, idx) => {
        const match = line.match(PRODUCT_PARSE_PATTERN);
        if (!match?.groups?.type || !match?.groups?.flavor) return;
        const volume = match.groups.volume ? match.groups.volume.replace(',', '.').trim() : '';
        const brand = match.groups.brand ? match.groups.brand.trim() : '';
        const type = match.groups.type.trim();
        const flavor = match.groups.flavor.trim();
        const rawQty = includeQty && match.groups.qty ? match.groups.qty : '';
        const qty = rawQty ? rawQty.replace(/\s+/g, ' ').trim() : '';
        const name = [type, flavor, volume || '', brand ? `ТМ «${brand}»` : ''].filter(Boolean).join(' ');
        parsed.push({
            id: `p_${Date.now()}_${idx}`,
            name,
            type,
            flavor,
            volume,
            brand,
            speed: '',
            qty,
            unit: ''
        });
    });
    return parsed;
}

export function parseProductPastePreview(text, includeQty) {
    const trimmed = String(text || '').trim();
    const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const ok = [];
    const okNoQty = [];
    const partial = [];
    lines.forEach((line, idx) => {
        const match = line.match(PRODUCT_PARSE_PATTERN);
        if (match?.groups?.type && match.groups?.flavor) {
            const volume = match.groups.volume ? match.groups.volume.replace(',', '.').trim() : '';
            const brand = match.groups.brand ? match.groups.brand.trim() : '';
            const type = match.groups.type.trim();
            const flavor = match.groups.flavor.trim();
            const rawQty = includeQty && match.groups.qty ? match.groups.qty : '';
            const qty = rawQty ? rawQty.replace(/\s+/g, ' ').trim() : '';
            const name = [type, flavor, volume || '', brand ? `ТМ «${brand}»` : ''].filter(Boolean).join(' ');
            const item = {
                id: `p_${Date.now()}_${idx}`,
                name,
                type,
                flavor,
                volume,
                brand,
                speed: '',
                qty,
                unit: ''
            };
            if (includeQty && !qty) okNoQty.push(item);
            else ok.push(item);
        } else {
            partial.push({ rawLine: line, lineIndex: idx + 1 });
        }
    });
    return { ok, okNoQty, partial };
}

/** Schedule helpers (pure) */
export function buildAbsMinutes(dateStr, timeStr) {
    const dayIdx = parseDateToDayIndex(dateStr);
    if (dayIdx == null) return null;
    const minutes = parseTimeToMinutes(timeStr);
    return dayIdx * 1440 + minutes;
}

export function isRowActiveForShift(row, shift) {
    if (!row?.line || !shift) return false;
    if (row.durationMinutes <= 0) return false;
    const rowStart = buildAbsMinutes(row.date, row.start);
    const rowEndRaw = buildAbsMinutes(row.date, row.end);
    if (rowStart == null || rowEndRaw == null) return false;
    const rowEnd = rowEndRaw <= rowStart ? rowEndRaw + 1440 : rowEndRaw;
    const shiftStart = buildAbsMinutes(shift.date, shift.start);
    const shiftEndRaw = buildAbsMinutes(shift.date, shift.end);
    if (shiftStart == null || shiftEndRaw == null) return false;
    const shiftEnd = shiftEndRaw <= shiftStart ? shiftEndRaw + 1440 : shiftEndRaw;
    const overlap = Math.min(rowEnd, shiftEnd) - Math.max(rowStart, shiftStart);
    return overlap > 0;
}

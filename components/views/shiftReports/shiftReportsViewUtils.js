import { CIP_DEFAULT_MINUTES } from './shiftReportsViewConstants';

export const parseTimeToMinutes = (value) => {
    if (!value || !String(value).includes(':')) return null;
    const [h, m] = String(value).split(':').map(v => parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return Math.max(0, Math.min(1439, h * 60 + m));
};

export const formatMinutesToTime = (value) => {
    const safe = Math.max(0, Math.min(1439, Math.round(value)));
    const h = String(Math.floor(safe / 60)).padStart(2, '0');
    const m = String(safe % 60).padStart(2, '0');
    return `${h}:${m}`;
};

export const parseDateToDayIndex = (value) => {
    if (!value || !String(value).includes('.')) return null;
    const parts = String(value).split('.');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    const utc = Date.UTC(year, month - 1, day);
    return Number.isFinite(utc) ? Math.floor(utc / 86400000) : null;
};

export const formatDayIndexToDate = (dayIndex) => {
    if (!Number.isFinite(dayIndex)) return '01.01.1970';
    const date = new Date(dayIndex * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}.${month}.${year}`;
};

export const dateToInputValue = (dateStr) => {
    if (!dateStr || !String(dateStr).includes('.')) return '';
    const parts = String(dateStr).split('.');
    const [d, m, y] = parts;
    if (!d || !m || !y) return '';
    return `${y}-${m}-${d}`;
};

export const normalizeInputDate = (value) => {
    if (!value || !String(value).includes('-')) return value;
    const [y, m, d] = String(value).split('-');
    if (!y || !m || !d) return value;
    return `${d}.${m}.${y}`;
};

export const buildAbsMinutes = (dateStr, timeStr) => {
    const dayIdx = parseDateToDayIndex(dateStr);
    if (dayIdx == null) return null;
    const minutes = parseTimeToMinutes(timeStr);
    return minutes == null ? null : dayIdx * 1440 + minutes;
};

export const parseNumeric = (v) => {
    if (v == null || v === '') return 0;
    const n = Number(String(v).replace(/,/g, '.').replace(/\s/g, ''));
    return Number.isFinite(n) ? n : 0;
};

export function getShiftForRow(dateStr, startStr) {
    const absMin = buildAbsMinutes(dateStr, startStr);
    if (absMin == null) return { key: 'unknown', label: '—' };
    const dayIdx = Math.floor(absMin / 1440);
    const timeMin = ((absMin % 1440) + 1440) % 1440;
    const dateLabel = formatDayIndexToDate(dayIdx);
    if (timeMin >= 8 * 60 && timeMin < 20 * 60) {
        return { key: `${dayIdx}_day`, label: `День ${dateLabel}` };
    }
    if (timeMin >= 20 * 60) {
        return { key: `${dayIdx}_night`, label: `Ночь ${dateLabel}` };
    }
    const prevDate = formatDayIndexToDate(dayIdx - 1);
    return { key: `${dayIdx - 1}_night`, label: `Ночь ${prevDate} – ${dateLabel}` };
}

export const getShiftBoundariesForDates = (dateStrings) => {
    const boundaries = [];
    const seen = new Set();
    (dateStrings || []).forEach(dateStr => {
        const dayIdx = parseDateToDayIndex(dateStr);
        if (dayIdx == null || seen.has(dayIdx)) return;
        seen.add(dayIdx);
        boundaries.push(dayIdx * 1440 + 20 * 60);
        boundaries.push((dayIdx + 1) * 1440 + 8 * 60);
    });
    boundaries.sort((a, b) => a - b);
    return boundaries;
};

export const getProductDurationMinutes = (product) => {
    const qty = parseNumeric(product.qty);
    const speed = parseNumeric(product.speed);
    if (qty <= 0 || speed <= 0) return 0;
    return Math.max(0, Math.round((qty / speed) * 60));
};

export const getCipDurationMinutes = (cip) => {
    const v = parseNumeric(cip?.durationMinutes ?? cip?.duration);
    return v > 0 ? v : CIP_DEFAULT_MINUTES;
};

export function ensureProductBaseId(product, index) {
    if (!product) return `product_${index}`;
    if (product.baseId) return String(product.baseId);
    if (product.id) return String(product.id);
    return `product_${index}`;
}

export function buildFlatTimeline(products, cipBetween) {
    const flat = [];
    const prods = products || [];
    const cips = cipBetween || [];
    let baseEventIndex = 0;
    for (let i = 0; i < prods.length; i++) {
        const p = {
            ...prods[i],
            kind: 'product',
            productIndex: i,
            baseProductIndex: i,
            baseEventIndex: baseEventIndex++,
            baseId: ensureProductBaseId(prods[i], i)
        };
        flat.push(p);
        if (i < cips.length && cips[i]) {
            const c = { ...cips[i], kind: 'cip', cipIndex: i, baseProductIndex: null, baseEventIndex: baseEventIndex++ };
            flat.push(c);
        }
    }
    return flat;
}

export function splitProductAtBoundaries(product, absStart, absEnd, boundaries) {
    const duration = absEnd - absStart;
    if (duration <= 0 || !boundaries.length) return [{ ...product, absStart, absEnd }];

    const segments = [];
    let curStart = absStart;
    const qtyTotal = parseNumeric(product.qty);
    const speed = parseNumeric(product.speed);
    const durationTotal = getProductDurationMinutes(product) || duration;

    while (curStart < absEnd) {
        const curEnd = absEnd;
        let segmentEnd = curEnd;
        for (const b of boundaries) {
            if (b > curStart && b < curEnd) {
                segmentEnd = b;
                break;
            }
        }
        const segDuration = segmentEnd - curStart;
        const ratio = durationTotal > 0 ? segDuration / durationTotal : 0;
        const segQty = Math.max(0, Math.round(qtyTotal * ratio * 100) / 100) || (speed > 0 ? (segDuration / 60) * speed : 0);
        segments.push({
            ...product,
            qty: segQty,
            absStart: curStart,
            absEnd: segmentEnd
        });
        curStart = segmentEnd;
    }
    return segments.length ? segments : [{ ...product, absStart, absEnd }];
}

export function assignSegmentIds(events) {
    if (!Array.isArray(events) || events.length === 0) return events;
    const counters = new Map();
    const indexed = events.map((ev, idx) => ({ ev, idx }));
    indexed.sort((a, b) => {
        const da = buildAbsMinutes(a.ev.date, a.ev.start) ?? Number.MAX_SAFE_INTEGER;
        const db = buildAbsMinutes(b.ev.date, b.ev.start) ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return (a.ev.baseEventIndex ?? a.idx) - (b.ev.baseEventIndex ?? b.idx);
    });
    const result = events.map((ev) => ({ ...ev }));
    indexed.forEach(({ ev, idx }) => {
        if (ev.kind !== 'product') return;
        const baseKey = ev.baseId || ev.id || `product_${ev.baseProductIndex ?? 'x'}`;
        const counter = counters.get(baseKey) ?? 0;
        counters.set(baseKey, counter + 1);
        result[idx].segmentIndex = counter;
        result[idx].segmentId = `${baseKey}__seg_${counter}`;
    });
    return result;
}

export function splitCipAtBoundaries(cip, absStart, absEnd, boundaries) {
    const duration = absEnd - absStart;
    if (duration <= 0 || !boundaries.length) return [{ ...cip, absStart, absEnd }];

    const segments = [];
    let curStart = absStart;

    while (curStart < absEnd) {
        let segmentEnd = absEnd;
        for (const b of boundaries) {
            if (b > curStart && b < absEnd) {
                segmentEnd = b;
                break;
            }
        }
        segments.push({ ...cip, absStart: curStart, absEnd: segmentEnd });
        curStart = segmentEnd;
    }
    return segments.length ? segments : [{ ...cip, absStart, absEnd }];
}

export function absToDateStart(absMin) {
    const dayIdx = Math.floor(absMin / 1440);
    const timeMin = ((absMin % 1440) + 1440) % 1440;
    return { date: formatDayIndexToDate(dayIdx), start: formatMinutesToTime(timeMin) };
}

export function absToDateEnd(absMin) {
    const dayIdx = Math.floor(absMin / 1440);
    const timeMin = ((absMin % 1440) + 1440) % 1440;
    return { date: formatDayIndexToDate(dayIdx), end: formatMinutesToTime(timeMin) };
}

const LOG = (label, ...args) => {
    if (typeof window !== 'undefined' && window.__shiftReportsLog) {
        console.log(`[ShiftReports] ${label}`, ...args);
    }
};

export function recalcTail(flatEvents, fromIndex, factStartDate, factStartTime, factEndDate, factEndTime, factQty, boundaries, scheduleDates) {
    LOG('recalcTail вход', { fromIndex, factStartDate, factStartTime, factEndDate, factEndTime, factQty, eventsCount: flatEvents.length });

    const safeBoundaries = boundaries.length ? boundaries : getShiftBoundariesForDates(scheduleDates || []);
    const fromEv = fromIndex >= 0 && fromIndex < flatEvents.length ? flatEvents[fromIndex] : null;
    const plannedQty = fromEv && fromEv.kind === 'product' ? parseNumeric(fromEv.qty) : 0;
    const factQtyNum = factQty != null && factQty !== '' ? parseNumeric(factQty) : null;
    const hasPartialQty = factQtyNum != null && factQtyNum < plannedQty && factQtyNum >= 0;
    let fromEvEndAbs = fromEv && fromEv.date != null && fromEv.end != null ? buildAbsMinutes(fromEv.date, fromEv.end) : null;
    if (fromEvEndAbs != null && fromEv.start != null && fromEv.end != null) {
        const startM = parseTimeToMinutes(fromEv.start);
        const endM = parseTimeToMinutes(fromEv.end);
        if (startM != null && endM != null && endM <= startM) fromEvEndAbs += 1440;
    }
    const fromEvEndDate = fromEvEndAbs != null ? formatDayIndexToDate(Math.floor(fromEvEndAbs / 1440)) : (fromEv?.date || null);
    let factAbsEnd = null;
    if (factEndDate && factEndTime) {
        factAbsEnd = buildAbsMinutes(factEndDate, factEndTime);
    } else if (factEndDate && (fromEv?.end != null && fromEv.end !== '')) {
        factAbsEnd = buildAbsMinutes(factEndDate, fromEv.end);
    } else if (factEndTime && fromEvEndDate) {
        const timeMin = parseTimeToMinutes(factEndTime);
        const dayIdx = parseDateToDayIndex(fromEvEndDate);
        const nextDay = timeMin != null && dayIdx != null && timeMin < 8 * 60 ? dayIdx + 1 : dayIdx;
        const dateForEnd = nextDay != null ? formatDayIndexToDate(nextDay) : fromEvEndDate;
        factAbsEnd = buildAbsMinutes(dateForEnd, factEndTime);
    }
    const factAbsStart = (factStartDate && factStartTime) ? buildAbsMinutes(factStartDate, factStartTime)
        : (factStartTime && fromEv?.date) ? buildAbsMinutes(fromEv.date, factStartTime) : null;

    let prevEnd = null;
    const expanded = [];

    for (let i = 0; i < flatEvents.length; i++) {
        const ev = flatEvents[i];
        let segStart = prevEnd != null ? prevEnd : buildAbsMinutes(ev.date, ev.start);
        let segEnd;

        if (i === fromIndex) {
            if (factAbsStart != null) segStart = factAbsStart;
            if (factAbsEnd != null) {
                segEnd = Math.max(segStart, factAbsEnd);
            } else if (ev.kind === 'product' && hasPartialQty) {
                const speed = parseNumeric(ev.speed);
                const dur = speed > 0 ? Math.round((factQtyNum / speed) * 60) : 0;
                segEnd = segStart + dur;
            } else {
                segEnd = segStart + (ev.kind === 'product' ? getProductDurationMinutes(ev) : getCipDurationMinutes(ev));
            }
            if (ev.kind === 'product' && hasPartialQty) {
                const out = { ...ev, qty: factQtyNum, absStart: segStart, absEnd: segEnd };
                const { date: dS, start: sS } = absToDateStart(segStart);
                const endPart = absToDateEnd(segEnd);
                expanded.push({ ...out, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
            } else if (ev.kind === 'product' && factAbsEnd != null) {
                const { date: dS, start: sS } = absToDateStart(segStart);
                const endPart = absToDateEnd(segEnd);
                expanded.push({ ...ev, kind: 'product', baseProductIndex: ev.baseProductIndex, baseEventIndex: ev.baseEventIndex, absStart: segStart, absEnd: segEnd, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
            } else {
                const segs = ev.kind === 'product'
                    ? splitProductAtBoundaries({ ...ev, absStart: segStart, absEnd: segEnd }, segStart, segEnd, safeBoundaries)
                    : splitCipAtBoundaries({ ...ev }, segStart, segEnd, safeBoundaries);
                segs.forEach((seg) => {
                    const { date: dS, start: sS } = absToDateStart(seg.absStart);
                    const endPart = absToDateEnd(seg.absEnd);
                    expanded.push({ ...seg, kind: ev.kind, baseProductIndex: ev.baseProductIndex, baseEventIndex: ev.baseEventIndex, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
                });
            }
            prevEnd = expanded[expanded.length - 1].absEnd;

            if (ev.kind === 'product' && hasPartialQty && plannedQty - factQtyNum > 0) {
                const restIdBase = ev.baseId || ev.id || `product_${ev.baseProductIndex ?? 'x'}`;
                const restProduct = {
                    ...ev,
                    qty: plannedQty - factQtyNum,
                    id: `${restIdBase}__rest`,
                    baseId: restIdBase,
                    baseProductIndex: ev.baseProductIndex,
                    baseEventIndex: ev.baseEventIndex
                };
                const nextStart = prevEnd;
                const nextEnd = nextStart + getProductDurationMinutes(restProduct);
                const restSegs = splitProductAtBoundaries(restProduct, nextStart, nextEnd, safeBoundaries);
                restSegs.forEach(seg => {
                    const { date: dS, start: sS } = absToDateStart(seg.absStart);
                    const endPart = absToDateEnd(seg.absEnd);
                    expanded.push({ ...seg, kind: 'product', baseProductIndex: ev.baseProductIndex, baseEventIndex: ev.baseEventIndex, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
                });
                prevEnd = expanded[expanded.length - 1].absEnd;
            }
            continue;
        }

        segEnd = segStart + (ev.kind === 'product' ? getProductDurationMinutes(ev) : getCipDurationMinutes(ev));

        if (ev.kind === 'product') {
            const segs = splitProductAtBoundaries({ ...ev }, segStart, segEnd, safeBoundaries);
            segs.forEach(seg => {
                const { date: dS, start: sS } = absToDateStart(seg.absStart);
                const endPart = absToDateEnd(seg.absEnd);
                expanded.push({ ...seg, kind: 'product', baseProductIndex: ev.baseProductIndex, baseEventIndex: ev.baseEventIndex, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
            });
        } else {
            const segs = splitCipAtBoundaries({ ...ev }, segStart, segEnd, safeBoundaries);
            segs.forEach(seg => {
                const { date: dS, start: sS } = absToDateStart(seg.absStart);
                const endPart = absToDateEnd(seg.absEnd);
                expanded.push({ ...seg, kind: 'cip', baseProductIndex: ev.baseProductIndex, baseEventIndex: ev.baseEventIndex, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
            });
        }
        prevEnd = expanded[expanded.length - 1].absEnd;
    }

    return expanded;
}

export function parseFactKey(key) {
    const str = String(key);
    if (str.includes('__seg_')) {
        return { segmentId: str };
    }
    const underscore = str.indexOf('_');
    if (underscore === -1) {
        const n = parseInt(str, 10);
        return Number.isFinite(n) ? { baseProductIndex: n, segmentIndex: 0 } : null;
    }
    const baseProductIndex = parseInt(str.slice(0, underscore), 10);
    const segmentIndex = parseInt(str.slice(underscore + 1), 10);
    return Number.isFinite(baseProductIndex) && Number.isFinite(segmentIndex) ? { baseProductIndex, segmentIndex } : null;
}

export function applyAllFacts(planFlat, operationalFacts, boundaries, scheduleDates) {
    if (!operationalFacts || typeof operationalFacts !== 'object') return assignSegmentIds(planFlat);
    const entries = Object.entries(operationalFacts)
        .map(([key, fact]) => ({ key, parsed: parseFactKey(key), fact }))
        .filter((e) => e.parsed && e.fact && (e.fact.factEndDate != null || e.fact.factEndTime != null || e.fact.factStartDate != null || e.fact.factStartTime != null || 'factQty' in e.fact));
    entries.sort((a, b) => {
        const pa = a.parsed;
        const pb = b.parsed;
        if (pa.segmentId && pb.segmentId) return 0;
        if (pa.baseProductIndex !== undefined && pb.baseProductIndex !== undefined && pa.baseProductIndex !== pb.baseProductIndex) {
            return pa.baseProductIndex - pb.baseProductIndex;
        }
        if (pa.segmentIndex !== undefined && pb.segmentIndex !== undefined) {
            return pa.segmentIndex - pb.segmentIndex;
        }
        return String(a.key).localeCompare(String(b.key));
    });
    if (entries.length === 0) {
        let safeBoundaries = boundaries;
        if (!safeBoundaries.length && planFlat.length) {
            const planDates = [...new Set(planFlat.map((e) => e.date).filter(Boolean))];
            safeBoundaries = getShiftBoundariesForDates(planDates);
        }
        const withSplits = recalcTail(planFlat, -1, null, null, null, null, null, safeBoundaries, scheduleDates);
        return assignSegmentIds(withSplits);
    }

    let expanded = assignSegmentIds(planFlat.map((e) => ({ ...e })));
    if (typeof window !== 'undefined') window.__shiftReportsLog = true;

    for (let ei = 0; ei < entries.length; ei++) {
        const { parsed, fact, key } = entries[ei];
        const { baseProductIndex: baseIdx, segmentIndex: segIdx, segmentId } = parsed;

        if (!segmentId) {
            expanded.sort((a, b) => {
                const da = (a.date || '').localeCompare(b.date || '');
                if (da !== 0) return da;
                return (a.start || '').localeCompare(b.start || '');
            });
        }

        let pos = -1;
        if (segmentId) {
            pos = expanded.findIndex((e) => e.kind === 'product' && e.segmentId === segmentId);
        } else {
            const productPositions = expanded
                .map((e, i) => (e.kind === 'product' && e.baseProductIndex === baseIdx ? i : -1))
                .filter((i) => i >= 0);
            pos = productPositions[segIdx];
        }
        if (pos === undefined || pos === -1) continue;

        expanded = recalcTail(
            expanded,
            pos,
            fact.factStartDate,
            fact.factStartTime,
            fact.factEndDate,
            fact.factEndTime,
            fact.factQty,
            boundaries,
            scheduleDates
        );
        expanded = assignSegmentIds(expanded);
    }

    return expanded;
}

export const formatDuration = (minutes) => {
    if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—';
    if (minutes < 60) return `${Math.round(minutes)} мин`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
};

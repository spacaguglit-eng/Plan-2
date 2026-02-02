import React, { useMemo, useCallback, useState } from 'react';
import { Calendar, AlertCircle, RotateCcw } from 'lucide-react';
import { useData } from '../../context/DataContext';

// --- Вспомогательные функции времени/даты (совместимы с PlanningView) ---
const parseTimeToMinutes = (value) => {
    if (!value || !String(value).includes(':')) return null;
    const [h, m] = String(value).split(':').map(v => parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return Math.max(0, Math.min(1439, h * 60 + m));
};

const formatMinutesToTime = (value) => {
    const safe = Math.max(0, Math.min(1439, Math.round(value)));
    const h = String(Math.floor(safe / 60)).padStart(2, '0');
    const m = String(safe % 60).padStart(2, '0');
    return `${h}:${m}`;
};

const parseDateToDayIndex = (value) => {
    if (!value || !String(value).includes('.')) return null;
    const parts = String(value).split('.');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    const utc = Date.UTC(year, month - 1, day);
    return Number.isFinite(utc) ? Math.floor(utc / 86400000) : null;
};

const formatDayIndexToDate = (dayIndex) => {
    if (!Number.isFinite(dayIndex)) return '01.01.1970';
    const date = new Date(dayIndex * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}.${month}.${year}`;
};

const dateToInputValue = (dateStr) => {
    if (!dateStr || !String(dateStr).includes('.')) return '';
    const parts = String(dateStr).split('.');
    const [d, m, y] = parts;
    if (!d || !m || !y) return '';
    return `${y}-${m}-${d}`;
};

const normalizeInputDate = (value) => {
    if (!value || !String(value).includes('-')) return value;
    const [y, m, d] = String(value).split('-');
    if (!y || !m || !d) return value;
    return `${d}.${m}.${y}`;
};

const buildAbsMinutes = (dateStr, timeStr) => {
    const dayIdx = parseDateToDayIndex(dateStr);
    if (dayIdx == null) return null;
    const minutes = parseTimeToMinutes(timeStr);
    return minutes == null ? null : dayIdx * 1440 + minutes;
};

const parseNumeric = (v) => {
    if (v == null || v === '') return 0;
    const n = Number(String(v).replace(/,/g, '.').replace(/\s/g, ''));
    return Number.isFinite(n) ? n : 0;
};

// Определить смену по дате и времени начала: день 08:00–20:00, ночь 20:00–08:00.
// Возвращает { key, label } для группировки и отображения.
function getShiftForRow(dateStr, startStr) {
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

// Границы смен: день 08:00–20:00, ночь 20:00–08:00. Возвращаем абсолютные минуты границ (конец дневной = 20:00, конец ночной = 08:00 след. дня).
const getShiftBoundariesForDates = (dateStrings) => {
    const boundaries = [];
    const seen = new Set();
    (dateStrings || []).forEach(dateStr => {
        const dayIdx = parseDateToDayIndex(dateStr);
        if (dayIdx == null || seen.has(dayIdx)) return;
        seen.add(dayIdx);
        boundaries.push(dayIdx * 1440 + 20 * 60);   // 20:00
        boundaries.push((dayIdx + 1) * 1440 + 8 * 60); // 08:00 след. дня
    });
    boundaries.sort((a, b) => a - b);
    return boundaries;
};

const getProductDurationMinutes = (product) => {
    const qty = parseNumeric(product.qty);
    const speed = parseNumeric(product.speed);
    if (qty <= 0 || speed <= 0) return 0;
    return Math.max(0, Math.round((qty / speed) * 60));
};

const CIP_DEFAULT_MINUTES = 15;

const getCipDurationMinutes = (cip) => {
    const v = parseNumeric(cip?.durationMinutes ?? cip?.duration);
    return v > 0 ? v : CIP_DEFAULT_MINUTES;
};

// Строим плоский список событий в порядке плана: product[0], cip[0], product[1], cip[1], ...
// baseProductIndex = индекс продукта в плане (0,1,2...); baseEventIndex = индекс события в плоском списке (0,1,2,3...)
function ensureProductBaseId(product, index) {
    if (!product) return `product_${index}`;
    if (product.baseId) return String(product.baseId);
    if (product.id) return String(product.id);
    return `product_${index}`;
}

function buildFlatTimeline(products, cipBetween) {
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

// Разбить один продукт, если он пересекает границу смены. Возвращает массив сегментов (1 или 2).
function splitProductAtBoundaries(product, absStart, absEnd, boundaries) {
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

// Назначаем стабильные segmentId / segmentIndex продуктовым сегментам в хронологическом порядке.
function assignSegmentIds(events) {
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

// Разбить CIP при пересечении границы (один сегмент на часть).
function splitCipAtBoundaries(cip, absStart, absEnd, boundaries) {
    const duration = absEnd - absStart;
    if (duration <= 0 || !boundaries.length) return [{ ...cip, absStart, absEnd }];

    const segments = [];
    let curStart = absStart;
    const durTotal = getCipDurationMinutes(cip);

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

function absToDateStart(absMin) {
    const dayIdx = Math.floor(absMin / 1440);
    const timeMin = ((absMin % 1440) + 1440) % 1440;
    return { date: formatDayIndexToDate(dayIdx), start: formatMinutesToTime(timeMin) };
}

function absToDateEnd(absMin) {
    const dayIdx = Math.floor(absMin / 1440);
    const timeMin = ((absMin % 1440) + 1440) % 1440;
    return { date: formatDayIndexToDate(dayIdx), end: formatMinutesToTime(timeMin) };
}

const LOG = (label, ...args) => {
    if (typeof window !== 'undefined' && window.__shiftReportsLog) {
        console.log(`[ShiftReports] ${label}`, ...args);
    }
};

// Пересчёт хвоста: применить факт к событию fromIndex и пересчитать непрерывный таймлайн с разбиением по сменам.
function recalcTail(flatEvents, fromIndex, factStartDate, factStartTime, factEndDate, factEndTime, factQty, boundaries, scheduleDates) {
    LOG('recalcTail вход', { fromIndex, factStartDate, factStartTime, factEndDate, factEndTime, factQty, eventsCount: flatEvents.length });

    const safeBoundaries = boundaries.length ? boundaries : getShiftBoundariesForDates(scheduleDates || []);
    const fromEv = fromIndex >= 0 && fromIndex < flatEvents.length ? flatEvents[fromIndex] : null;
    const plannedQty = fromEv && fromEv.kind === 'product' ? parseNumeric(fromEv.qty) : 0;
    const factQtyNum = factQty != null && factQty !== '' ? parseNumeric(factQty) : null;
    const hasPartialQty = factQtyNum != null && factQtyNum < plannedQty && factQtyNum >= 0;
    // Дата/время конца сегмента (для подстановки, когда в факте только дата или только время).
    let fromEvEndAbs = fromEv && fromEv.date != null && fromEv.end != null ? buildAbsMinutes(fromEv.date, fromEv.end) : null;
    if (fromEvEndAbs != null && fromEv.start != null && fromEv.end != null) {
        const startM = parseTimeToMinutes(fromEv.start);
        const endM = parseTimeToMinutes(fromEv.end);
        if (startM != null && endM != null && endM <= startM) fromEvEndAbs += 1440;
    }
    const fromEvEndDate = fromEvEndAbs != null ? formatDayIndexToDate(Math.floor(fromEvEndAbs / 1440)) : (fromEv?.date || null);
    // Время после 23:59 (00:00–07:59) считаем следующим днём.
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

    LOG('recalcTail сегмент и факт', {
        fromEv: fromEv ? { date: fromEv.date, start: fromEv.start, end: fromEv.end, name: fromEv.name } : null,
        fromEvEndAbs,
        fromEvEndDate,
        factAbsEnd: factAbsEnd != null ? formatDayIndexToDate(Math.floor(factAbsEnd / 1440)) + ' ' + formatMinutesToTime(((factAbsEnd % 1440) + 1440) % 1440) : null,
        factAbsStart: factAbsStart != null ? formatDayIndexToDate(Math.floor(factAbsStart / 1440)) + ' ' + formatMinutesToTime(((factAbsStart % 1440) + 1440) % 1440) : null,
        hasPartialQty,
        plannedQty,
        factQtyNum
    });

    let prevEnd = null;
    const expanded = [];

    for (let i = 0; i < flatEvents.length; i++) {
        const ev = flatEvents[i];
        let segStart = prevEnd != null ? prevEnd : buildAbsMinutes(ev.date, ev.start);
        let segEnd;

        if (i === fromIndex) {
            LOG('recalcTail редактируемый сегмент i=' + i, { segStart_до: prevEnd != null ? 'prevEnd' : 'ev.date+ev.start', evDate: ev.date, evStart: ev.start });
            if (factAbsStart != null) {
                segStart = factAbsStart;
                LOG('recalcTail подставлен факт-начало', { segStart: formatDayIndexToDate(Math.floor(segStart / 1440)) + ' ' + formatMinutesToTime(((segStart % 1440) + 1440) % 1440) });
            }
            if (factAbsEnd != null) {
                // Если задан фактический конец — принимаем его как факт, без расчётов по скорости.
                segEnd = Math.max(segStart, factAbsEnd);
                LOG('recalcTail подставлен факт-конец', { segEnd: formatDayIndexToDate(Math.floor(segEnd / 1440)) + ' ' + formatMinutesToTime(((segEnd % 1440) + 1440) % 1440) });
            } else if (ev.kind === 'product' && hasPartialQty) {
                const speed = parseNumeric(ev.speed);
                const dur = speed > 0 ? Math.round((factQtyNum / speed) * 60) : 0;
                segEnd = segStart + dur;
                LOG('recalcTail конец по qty/скорости', { speed, dur_мин: dur, segEnd: formatDayIndexToDate(Math.floor(segEnd / 1440)) + ' ' + formatMinutesToTime(((segEnd % 1440) + 1440) % 1440) });
            } else {
                segEnd = segStart + (ev.kind === 'product' ? getProductDurationMinutes(ev) : getCipDurationMinutes(ev));
                LOG('recalcTail конец по длительности плана', { segEnd: formatDayIndexToDate(Math.floor(segEnd / 1440)) + ' ' + formatMinutesToTime(((segEnd % 1440) + 1440) % 1440) });
            }
            if (ev.kind === 'product' && hasPartialQty) {
                const out = { ...ev, qty: factQtyNum, absStart: segStart, absEnd: segEnd };
                const { date: dS, start: sS } = absToDateStart(segStart);
                const endPart = absToDateEnd(segEnd);
                expanded.push({ ...out, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
            } else if (ev.kind === 'product' && factAbsEnd != null) {
                // Пользователь задал фактический конец — не разбиваем по сменам, один сегмент (без «задвоения» продукта).
                const { date: dS, start: sS } = absToDateStart(segStart);
                const endPart = absToDateEnd(segEnd);
                expanded.push({ ...ev, kind: 'product', baseProductIndex: ev.baseProductIndex, baseEventIndex: ev.baseEventIndex, absStart: segStart, absEnd: segEnd, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
                LOG('recalcTail один сегмент (факт-конец задан, без разбиения по сменам)', { date: dS, start: sS, end: endPart.end, endDate: endPart.date });
            } else {
                const segs = ev.kind === 'product'
                    ? splitProductAtBoundaries({ ...ev, absStart: segStart, absEnd: segEnd }, segStart, segEnd, safeBoundaries)
                    : splitCipAtBoundaries({ ...ev }, segStart, segEnd, safeBoundaries);
                segs.forEach((seg, si) => {
                    const { date: dS, start: sS } = absToDateStart(seg.absStart);
                    const endPart = absToDateEnd(seg.absEnd);
                    expanded.push({ ...seg, kind: ev.kind, baseProductIndex: ev.baseProductIndex, baseEventIndex: ev.baseEventIndex, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
                    LOG('recalcTail добавлен подсегмент', { сегмент: si + 1, из: segs.length, date: dS, start: sS, end: endPart.end, endDate: endPart.date });
                });
            }
            prevEnd = expanded[expanded.length - 1].absEnd;
            LOG('recalcTail prevEnd после редактируемого', { prevEnd: formatDayIndexToDate(Math.floor(prevEnd / 1440)) + ' ' + formatMinutesToTime(((prevEnd % 1440) + 1440) % 1440), следующийСегментНачнётсяСЭтойТочки: true });

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
        LOG('recalcTail следующий сегмент i=' + i, { name: ev.name || ev.kind, segStart: formatDayIndexToDate(Math.floor(segStart / 1440)) + ' ' + formatMinutesToTime(((segStart % 1440) + 1440) % 1440), segEnd: formatDayIndexToDate(Math.floor(segEnd / 1440)) + ' ' + formatMinutesToTime(((segEnd % 1440) + 1440) % 1440), источникНачала: prevEnd != null ? 'конец предыдущего' : 'план' });

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

    LOG('recalcTail выход', { expandedCount: expanded.length });
    return expanded;
}

// Парсим ключ факта: "0" -> { baseProductIndex: 0, segmentIndex: 0 }, "0_1" -> { baseProductIndex: 0, segmentIndex: 1 }.
function parseFactKey(key) {
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

// Каждый раз пересчитываем «с нуля»: берём только базу (planFlat) и по очереди применяем
// все факты из operationalFacts (ключ: baseProductIndex или baseProductIndex_segmentIndex для разбитых частей).
function applyAllFacts(planFlat, operationalFacts, boundaries, scheduleDates) {
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
    if (entries.length === 0) return assignSegmentIds(planFlat);

    let expanded = assignSegmentIds(planFlat.map((e) => ({ ...e })));
    if (typeof window !== 'undefined') window.__shiftReportsLog = true;
    LOG('applyAllFacts', { фактов: entries.length, планСобытий: planFlat.length });

    for (let ei = 0; ei < entries.length; ei++) {
        const { parsed, fact, key } = entries[ei];
        const { baseProductIndex: baseIdx, segmentIndex: segIdx, segmentId } = parsed;

        LOG('applyAllFacts факт ' + (ei + 1) + '/' + entries.length, { key, segmentId, fact: { factStartDate: fact.factStartDate, factStartTime: fact.factStartTime, factEndDate: fact.factEndDate, factEndTime: fact.factEndTime, factQty: fact.factQty } });

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
        if (pos === undefined || pos === -1) {
            LOG('applyAllFacts сегмент не найден, пропуск', { key, pos });
            continue;
        }
        const rowAtPos = expanded[pos];
        LOG('applyAllFacts применяем к строке', { pos, name: rowAtPos?.name, date: rowAtPos?.date, start: rowAtPos?.start, end: rowAtPos?.end });

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
        LOG('applyAllFacts после пересчёта', { событий: expanded.length });
    }

    return expanded;
}

const TABS = [
    { id: 'reports', label: 'Отчёты по сменам' },
    { id: 'downtime', label: 'Простои' }
];

const formatDuration = (minutes) => {
    if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—';
    if (minutes < 60) return `${Math.round(minutes)} мин`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
};

const DOWNTIME_CATEGORIES = [
    'КИПиА',
    'Механические',
    'Неучтённое время',
    'Плановые',
    'Технологические',
    'Энергетические'
];

export default function ShiftReportsView() {
    const { savedPlans, currentPlanId, scheduleDates, updateOperationalFacts, loadPlan } = useData();
    const [activeTab, setActiveTab] = useState('reports');
    const [downtimeCatalog, setDowntimeCatalog] = useState([]);
    const [downtimeFilterCategoriesSelected, setDowntimeFilterCategoriesSelected] = useState(
        () => new Set(DOWNTIME_CATEGORIES)
    );
    const [downtimeFilterDescription, setDowntimeFilterDescription] = useState('');

    const resetFactField = useCallback(
        (segmentKey, field) => {
            if (!segmentKey || typeof updateOperationalFacts !== 'function') return;
            updateOperationalFacts((prev) => {
                const next = prev && typeof prev === 'object' ? { ...prev } : {};
                const entry = next[segmentKey] ? { ...next[segmentKey] } : {};
                const clearField = (name) => {
                    if (name in entry) delete entry[name];
                };

                switch (field) {
                    case 'start':
                        clearField('factStartDate');
                        clearField('factStartTime');
                        break;
                    case 'end':
                        clearField('factEndDate');
                        clearField('factEndTime');
                        break;
                    case 'date':
                        clearField('factStartDate');
                        clearField('factEndDate');
                        break;
                    case 'qty':
                        clearField('factQty');
                        break;
                    default:
                        break;
                }

                if (Object.keys(entry).length === 0) {
                    delete next[segmentKey];
                } else {
                    next[segmentKey] = entry;
                }
                return next;
            });
        },
        [updateOperationalFacts]
    );

    const updateFact = useCallback(
        (segmentKey, patch) => {
            if (!segmentKey || typeof updateOperationalFacts !== 'function') return;
            updateOperationalFacts((prev) => {
                const next = prev && typeof prev === 'object' ? { ...prev } : {};
                const entry = next[segmentKey] ? { ...next[segmentKey] } : {};
                Object.entries(patch || {}).forEach(([k, v]) => {
                    if (v === undefined || v === null) {
                        if (k in entry) delete entry[k];
                    } else {
                        // Разрешаем пустую строку — поле можно очистить, не подставляя значение по умолчанию.
                        entry[k] = v;
                    }
                });
                if (Object.keys(entry).length === 0) {
                    delete next[segmentKey];
                } else {
                    next[segmentKey] = entry;
                }
                return next;
            });
        },
        [updateOperationalFacts]
    );

    const activePlan = useMemo(
        () => savedPlans?.find(p => p.id === currentPlanId),
        [savedPlans, currentPlanId]
    );

    const planningState = activePlan?.data?.planningState;
    const operationalFacts = activePlan?.data?.operationalFacts ?? null;

    const boundaries = useMemo(() => getShiftBoundariesForDates(scheduleDates || []), [scheduleDates]);

    // План: плоский список только из planningState (база, не меняется)
    const planFlat = useMemo(() => {
        if (!planningState) return [];
        const flat = buildFlatTimeline(planningState.products || [], planningState.cipBetween || []);
        flat.sort((a, b) => {
            const da = (a.date || '').localeCompare(b.date || '');
            if (da !== 0) return da;
            return (a.start || '').localeCompare(b.start || '');
        });
        return flat;
    }, [planningState]);

    // План по baseEventIndex для подстановки в строки факта
    const planByBaseEventIndex = useMemo(() => {
        const map = {};
        planFlat.forEach((e) => {
            if (e.baseEventIndex != null) map[e.baseEventIndex] = e;
        });
        return map;
    }, [planFlat]);

    // Факт-таймлайн: при каждом изменении operationalFacts пересчитываем как в первый раз —
    // всегда от базы (planFlat) и применяем все факты по порядку.
    const factTimeline = useMemo(() => {
        if (!planFlat.length) return [];
        return applyAllFacts(planFlat, operationalFacts, boundaries, scheduleDates);
    }, [planFlat, operationalFacts, boundaries, scheduleDates]);

    const factRows = useMemo(() => {
        const withShift = factTimeline.map((e, idx) => {
            const shift = getShiftForRow(e.date, e.start);
            return {
                ...e,
                id: e.segmentId || e.id || (e.kind === 'product' ? `p_${e.baseProductIndex}_${idx}` : `c_${idx}`),
                isService: e.kind === 'cip',
                displayName: e.kind === 'product' ? (e.name || '—') : (e.eventKey || e.type || 'Служебное событие'),
                displayQty: e.kind === 'product' ? (e.qty ?? '—') : '—',
                planEvent: planByBaseEventIndex[e.baseEventIndex],
                shiftKey: shift.key,
                shiftLabel: shift.label
            };
        });
        withShift.sort((a, b) => {
            const da = (a.date || '').localeCompare(b.date || '');
            if (da !== 0) return da;
            return (a.start || '').localeCompare(b.start || '');
        });
        withShift.forEach((row, idx) => {
            if (row.kind !== 'product') return;
            const segmentIndex = Number.isFinite(row.segmentIndex)
                ? row.segmentIndex
                : withShift
                    .slice(0, idx)
                    .filter((r) => r.kind === 'product' && r.baseProductIndex === row.baseProductIndex).length;
            row.segmentIndex = segmentIndex;
            row.segmentKey = row.segmentId || `${row.baseProductIndex}_${segmentIndex}`;
        });
        return withShift;
    }, [factTimeline, planByBaseEventIndex]);

    const downtimeFiltered = useMemo(() => {
        const desc = (downtimeFilterDescription || '').trim().toLowerCase();
        const selected = downtimeFilterCategoriesSelected;
        return downtimeCatalog.filter((item) => {
            const matchCat = selected.size === 0 || selected.size === DOWNTIME_CATEGORIES.length || selected.has(item.category || '');
            const matchDesc = !desc || (item.description || '').toLowerCase().includes(desc);
            return matchCat && matchDesc;
        });
    }, [downtimeCatalog, downtimeFilterCategoriesSelected, downtimeFilterDescription]);

    const toggleDowntimeCategory = useCallback((category) => {
        setDowntimeFilterCategoriesSelected((prev) => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    }, []);

    const handleReloadInitialPlan = useCallback(() => {
        if (typeof updateOperationalFacts !== 'function') return;
        updateOperationalFacts(() => null);
        if (currentPlanId && typeof loadPlan === 'function') {
            setTimeout(() => loadPlan(currentPlanId, { switchToDashboard: false }), 0);
        }
    }, [updateOperationalFacts, currentPlanId, loadPlan]);

    if (!activePlan) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="text-center space-y-2">
                    <div className="mx-auto h-20 w-20 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                        <AlertCircle size={32} />
                    </div>
                    <p className="text-lg font-semibold text-slate-800">Нет активного плана</p>
                    <p className="text-sm text-slate-500 max-w-sm">
                        Выберите активный план на вкладке «Планы», чтобы увидеть данные графика.
                    </p>
                </div>
            </div>
        );
    }

    if (!planningState || ((planningState.products || []).length === 0 && (planningState.cipBetween || []).length === 0)) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="text-center space-y-2">
                    <div className="mx-auto h-20 w-20 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
                        <Calendar size={32} />
                    </div>
                    <p className="text-lg font-semibold text-slate-800">Нет данных графика</p>
                    <p className="text-sm text-slate-500 max-w-sm">
                        В выбранном плане отсутствуют данные планирования производства.
                    </p>
                </div>
            </div>
        );
    }

    const hasFacts = operationalFacts && Object.keys(operationalFacts).length > 0;

    return (
        <div className="h-full w-full flex flex-col gap-4">
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl">
                        <Calendar size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 leading-tight">Оперативный план (отчёты по сменам)</h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            План: {activePlan.name} • {factRows.length} событий
                            {hasFacts && <span className="ml-2 text-indigo-600">• введён факт</span>}
                        </p>
                    </div>
                </div>
                {hasFacts && (
                    <button
                        type="button"
                        onClick={handleReloadInitialPlan}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
                        title="Сбросить все введённые факты и отобразить изначальный план"
                    >
                        <RotateCcw size={18} />
                        Загрузить изначальный план заново
                    </button>
                )}
            </div>

            <div className="flex border-b border-slate-200 bg-white rounded-t-xl overflow-hidden">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
                            activeTab === tab.id
                                ? 'bg-slate-100 text-slate-800 border-b-2 border-slate-800 -mb-px'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'reports' && (
            <div className="flex-1 min-h-0 bg-white border border-t-0 border-slate-200 rounded-b-xl overflow-hidden flex flex-col">
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                            <tr className="text-slate-600 text-xs font-semibold tracking-wide">
                                <th className="px-3 py-2.5 text-left border-r border-slate-200 w-40">Продукт / Событие</th>
                                <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-slate-50/80">План: дата</th>
                                <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-slate-50/80">начало</th>
                                <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-slate-50/80">конец</th>
                                <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-slate-50/80">кол-во</th>
                                <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-emerald-50/80">Факт: дата</th>
                                <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-emerald-50/80">начало</th>
                                <th className="px-3 py-2.5 text-left border-r border-slate-200 bg-emerald-50/80">конец</th>
                                <th className="px-3 py-2.5 text-left bg-emerald-50/80">кол-во</th>
                            </tr>
                        </thead>
                        <tbody>
                            {factRows.map((row, idx) => {
                                const plan = row.planEvent;
                                const prevShiftKey = idx > 0 ? factRows[idx - 1].shiftKey : null;
                                const isNewShift = row.shiftKey !== prevShiftKey;
                                const isDayShift = row.shiftKey != null && String(row.shiftKey).endsWith('_day');
                                const overrides = row.kind === 'product' ? operationalFacts?.[row.segmentKey] : null;
                                const changedDate = !!(overrides?.factStartDate || overrides?.factEndDate);
                                const changedStart = !!(overrides?.factStartDate || overrides?.factStartTime);
                                const changedEnd = !!(overrides?.factEndDate || overrides?.factEndTime);
                                const changedQty = !!(overrides && 'factQty' in overrides);
                                const startDateVal = overrides?.factStartDate ?? row.date ?? '';
                                const endDateVal = overrides?.factEndDate ?? (row.endDate ?? row.date) ?? '';
                                const startTimeVal = overrides?.factStartTime ?? row.start ?? '';
                                const endTimeVal = overrides?.factEndTime ?? row.end ?? '';
                                const qtyVal = overrides && 'factQty' in overrides ? overrides.factQty : (row.kind === 'product' ? row.displayQty : '');
                                const factCellBase = 'px-3 py-1.5 border-b border-slate-100';
                                const factCellChanged = 'bg-amber-50 border-l-2 border-l-amber-400';
                                return (
                                    <React.Fragment key={row.id || idx}>
                                        {isNewShift && (
                                            <tr className="bg-slate-100 border-b border-slate-200">
                                                <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-slate-600">
                                                    {row.shiftLabel}
                                                </td>
                                            </tr>
                                        )}
                                        <tr
                                            className={`border-b border-slate-100 ${row.isService ? 'bg-slate-50/50 text-slate-500' : ''} ${isDayShift ? 'bg-amber-50/20' : ''}`}
                                        >
                                            <td className={`px-3 py-2 border-r border-slate-100 ${row.isService ? 'italic' : 'font-medium text-slate-800'}`}>
                                                {row.displayName}
                                            </td>
                                            <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/50 text-slate-700">{plan ? (plan.date || '—') : '—'}</td>
                                            <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/50 text-slate-700">{plan ? (plan.start || '—') : '—'}</td>
                                            <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/50 text-slate-700">{plan ? (plan.end || '—') : '—'}</td>
                                            <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/50 text-slate-700">{plan && plan.kind === 'product' ? (plan.qty ?? '—') : '—'}</td>
                                            <td className={`${factCellBase} border-r border-slate-100 ${changedDate ? factCellChanged : 'bg-white'}`}>
                                                {row.kind === 'product' ? (
                                                    <div className="flex flex-col gap-0.5">
                                                        <input
                                                            type="date"
                                                            value={dateToInputValue(startDateVal)}
                                                            onChange={(e) => updateFact(row.segmentKey, { factStartDate: normalizeInputDate(e.target.value) })}
                                                            className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                            title="Дата начала"
                                                        />
                                                        <input
                                                            type="date"
                                                            value={dateToInputValue(endDateVal)}
                                                            onChange={(e) => updateFact(row.segmentKey, { factEndDate: normalizeInputDate(e.target.value) })}
                                                            className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                            title="Дата конца"
                                                        />
                                                        {changedDate && (
                                                            <button type="button" onClick={(ev) => { ev.stopPropagation(); resetFactField(row.segmentKey, 'date'); }} className="text-amber-600 hover:text-amber-800 text-xs self-start" title="Вернуть плановые даты">×</button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500">{row.date || '—'}</span>
                                                )}
                                            </td>
                                            <td className={`${factCellBase} border-r border-slate-100 ${changedStart ? factCellChanged : 'bg-white'}`}>
                                                {row.kind === 'product' ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="time"
                                                            value={startTimeVal}
                                                            onChange={(e) => updateFact(row.segmentKey, { factStartTime: e.target.value })}
                                                            className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                        />
                                                        {changedStart && (
                                                            <button type="button" onClick={(ev) => { ev.stopPropagation(); resetFactField(row.segmentKey, 'start'); }} className="text-amber-600 hover:text-amber-800 text-xs shrink-0" title="Вернуть плановое начало">×</button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500">{row.start || '—'}</span>
                                                )}
                                            </td>
                                            <td className={`${factCellBase} border-r border-slate-100 ${changedEnd ? factCellChanged : 'bg-white'}`}>
                                                {row.kind === 'product' ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="time"
                                                            value={endTimeVal}
                                                            onChange={(e) => updateFact(row.segmentKey, { factEndTime: e.target.value })}
                                                            className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                        />
                                                        {changedEnd && (
                                                            <button type="button" onClick={(ev) => { ev.stopPropagation(); resetFactField(row.segmentKey, 'end'); }} className="text-amber-600 hover:text-amber-800 text-xs shrink-0" title="Вернуть плановое окончание">×</button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500">{row.end || '—'}</span>
                                                )}
                                            </td>
                                            <td className={`${factCellBase} ${changedQty ? factCellChanged : 'bg-white'}`}>
                                                {row.kind === 'product' ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={qtyVal != null && qtyVal !== '' ? String(Math.round(parseNumeric(qtyVal))) : ''}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                updateFact(row.segmentKey, { factQty: v === '' ? '' : String(Math.round(parseNumeric(v))) });
                                                            }}
                                                            placeholder="—"
                                                            className="w-16 px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 outline-none"
                                                        />
                                                        {changedQty && (
                                                            <button type="button" onClick={(ev) => { ev.stopPropagation(); resetFactField(row.segmentKey, 'qty'); }} className="text-amber-600 hover:text-amber-800 text-xs shrink-0" title="Вернуть плановое количество">×</button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            )}
            {activeTab === 'downtime' && (
            <div className="flex-1 min-h-0 bg-white border border-t-0 border-slate-200 rounded-b-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Фильтры</span>
                        <input
                            type="text"
                            value={downtimeFilterDescription}
                            onChange={(e) => setDowntimeFilterDescription(e.target.value)}
                            placeholder="Описание"
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400/30 outline-none min-w-[200px]"
                        />
                        <button
                            type="button"
                            onClick={() => { setDowntimeFilterCategoriesSelected(new Set(DOWNTIME_CATEGORIES)); setDowntimeFilterDescription(''); }}
                            className="text-xs text-slate-500 hover:text-slate-700 underline"
                        >
                            Сбросить
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <span className="text-xs font-medium text-slate-600 w-full sm:w-auto">Категории</span>
                        {DOWNTIME_CATEGORIES.map((cat) => (
                            <label key={cat} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={downtimeFilterCategoriesSelected.has(cat)}
                                    onChange={() => toggleDowntimeCategory(cat)}
                                    className="rounded border-slate-300 text-slate-700 focus:ring-slate-400"
                                />
                                {cat}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                            <tr className="text-slate-600 text-xs font-semibold tracking-wide">
                                <th className="px-4 py-3 text-left border-r border-slate-200 w-48">Категория</th>
                                <th className="px-4 py-3 text-left border-r border-slate-200">Описание</th>
                                <th className="px-4 py-3 text-left w-28">Длительность</th>
                            </tr>
                        </thead>
                        <tbody>
                            {downtimeFiltered.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500 text-sm">
                                        {downtimeCatalog.length === 0
                                            ? 'Каталог простоев пуст. Добавьте записи.'
                                            : 'Нет записей по выбранным фильтрам.'}
                                    </td>
                                </tr>
                            ) : (
                                downtimeFiltered.map((item) => (
                                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 border-r border-slate-100 font-medium text-slate-800">{item.category || '—'}</td>
                                        <td className="px-4 py-3 border-r border-slate-100 text-slate-700">{item.description || '—'}</td>
                                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDuration(item.durationMinutes)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            )}
        </div>
    );
}

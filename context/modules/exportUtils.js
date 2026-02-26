import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { isLineMatch, normalizeExcelDate, formatDateLocal } from '../../utils';
import { parseTimeToMinutes } from '../../utils/normsComparison';

/**
 * Нормализует название линии из Excel (макрос): "Линия1" -> "Линия 1", "Соусы" оставляет как есть.
 */
const normalizeDemandLineName = (name) => {
    if (!name || typeof name !== 'string') return '';
    const s = name.trim();
    const m = s.match(/^Линия\s*(\d+)$/i);
    if (m) return `Линия ${parseInt(m[1], 10)}`;
    return s;
};

const parseTimeRange = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = String(timeStr).trim().split(/\s*[-–]\s*/);
    if (parts.length !== 2) return null;
    const startM = parseTimeToMinutes(parts[0].trim());
    const endM = parseTimeToMinutes(parts[1].trim());
    if (startM == null || endM == null) return null;
    if (startM === endM) return null;
    return { startM, endM };
};

const parseDateToBase = (dateStr) => {
    if (!dateStr) return null;
    const parts = String(dateStr).split('.');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map((v) => parseInt(v, 10));
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const buildDemandInterval = (baseDate, range, shiftRaw) => {
    const shiftText = String(shiftRaw || '').toLowerCase();
    const isNightShift = shiftText.includes('ноч');
    const start = new Date(baseDate);
    const end = new Date(baseDate);

    // В demand ночная смена хранится в операционном окне 20:00-08:00:
    // время < 08:00 относится к следующему календарному дню.
    if (isNightShift) {
        const normalizeNightMinute = (m) => (m < 8 * 60 ? m + 24 * 60 : m);
        const startM = normalizeNightMinute(range.startM);
        let endM = normalizeNightMinute(range.endM);
        if (endM <= startM) endM += 24 * 60;
        start.setMinutes(start.getMinutes() + startM);
        end.setMinutes(end.getMinutes() + endM);
        return { start, end };
    }

    start.setMinutes(start.getMinutes() + range.startM);
    if (range.endM >= range.startM) {
        end.setMinutes(end.getMinutes() + range.endM);
    } else {
        end.setDate(end.getDate() + 1);
        end.setMinutes(end.getMinutes() + range.endM);
    }
    return { start, end };
};

const normalizeProductionLineName = (name) => {
    if (!name || typeof name !== 'string') return '';
    const s = name.trim();
    const m = s.match(/Линия\s*№?\s*(\d+)/i);
    if (m) return `Линия ${parseInt(m[1], 10)}`;
    return s;
};

const resolveProductionDate = (resultDate, scheduleDates) => {
    if (parseDateToBase(resultDate)) return resultDate;
    const dayNum = parseInt(String(resultDate || '').trim(), 10);
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) return null;
    const first = scheduleDates[0];
    if (!first) return null;
    const parts = String(first).split('.');
    if (parts.length !== 3) return null;
    const [, month, year] = parts.map((v) => parseInt(v, 10));
    if (!Number.isFinite(month) || !Number.isFinite(year)) return null;
    const d = String(dayNum).padStart(2, '0');
    const m = String(month).padStart(2, '0');
    return `${d}.${m}.${year}`;
};

/**
 * Собирает все интервалы по линиям из demand и production (без привязки к смене).
 * Возвращает { lineTimelines: Map<lineKey, [{start, end}[]]>, rawIntervals: Array<{lineName, date, shiftType, start, end}> }
 */
const buildLineTimeline = (demandTable, productionResults, scheduleDates, planLineEvents) => {
    const lineTimelines = new Map();
    const rawIntervals = [];

    const addInterval = (line, start, end, date, shiftType, source = '') => {
        const key = normalizeDemandLineName(line) || normalizeProductionLineName(line) || line;
        if (!key) return;
        if (!lineTimelines.has(key)) lineTimelines.set(key, []);
        lineTimelines.get(key).push({ start, end });
        rawIntervals.push({ lineName: key, date, shiftType: shiftType || '', start, end, source });
    };

    if (demandTable && Array.isArray(demandTable) && demandTable.length >= 2) {
        const headers = demandTable[0];
        const headerStr = (i) => String((headers && headers[i]) ?? '').trim().toLowerCase();
        const colTime = headers.findIndex((h) => String(h || '').toLowerCase().includes('время') && String(h || '').toLowerCase().includes('работ'));
        if (colTime >= 0) {
            const colLine = headerStr(0).includes('линия') ? 0 : headers.findIndex((h) => String(h || '').toLowerCase().includes('линия'));
            const colDate = headerStr(1).includes('дата') ? 1 : headers.findIndex((h) => String(h || '').toLowerCase() === 'дата');
            const colShift = headerStr(3).includes('смена') ? 3 : headers.findIndex((h) => String(h || '').toLowerCase() === 'смена');
            if (colLine >= 0 && colDate >= 0 && colShift >= 0) {
                demandTable.slice(1).forEach((row) => {
                    const line = normalizeDemandLineName(row[colLine]);
                    if (!line) return;
                    const baseDate = normalizeExcelDate(row[colDate]);
                    if (!baseDate) return;
                    const dateStr = formatDateLocal(baseDate);
                    const shiftRaw = String(row[colShift] ?? '').trim();
                    const shiftLabel = shiftRaw.toLowerCase().includes('ночь') ? 'Ночь' : 'День';
                    const range = parseTimeRange(row[colTime]);
                    if (!range) return;
                    const { start, end } = buildDemandInterval(baseDate, range, shiftRaw);
                    addInterval(line, start, end, dateStr, shiftLabel, 'demand');
                });
            }
        }
    }

    (productionResults || []).forEach((result) => {
        const resolvedDateStr = parseDateToBase(result?.date) ? result.date : resolveProductionDate(result?.date, scheduleDates);
        const baseDate = parseDateToBase(resolvedDateStr);
        if (!baseDate) return;
        const lineName = normalizeProductionLineName(result?.lineName || '');
        if (!lineName) return;
        const resolvedDate = resolvedDateStr || formatDateLocal(baseDate);

        (result.rows || []).forEach((row) => {
            const startM = parseTimeToMinutes(row.start);
            const endM = parseTimeToMinutes(row.end);
            if (startM == null || endM == null) return;
            if (startM === endM) return;
            const start = new Date(baseDate);
            start.setMinutes(start.getMinutes() + startM);
            const end = new Date(baseDate);
            if (endM >= startM) {
                end.setMinutes(end.getMinutes() + endM);
            } else {
                end.setDate(end.getDate() + 1);
                end.setMinutes(end.getMinutes() + endM);
            }
            const shiftType = row.shift || '';
            addInterval(lineName, start, end, resolvedDate, shiftType, 'production');
        });
    });

    (planLineEvents || []).forEach(({ lineName: rawLineName, rows }) => {
        const lineName = normalizeDemandLineName(rawLineName) || normalizeProductionLineName(rawLineName) || rawLineName;
        if (!lineName) return;
        (rows || []).forEach((row) => {
            const start = row.start instanceof Date ? row.start : (row.start ? new Date(row.start) : null);
            const end = row.end instanceof Date ? row.end : (row.end ? new Date(row.end) : null);
            if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() >= end.getTime()) return;
            const dateStr = formatDateLocal(start);
            addInterval(lineName, start, end, dateStr, '', 'plan');
        });
    });

    return { lineTimelines, rawIntervals };
};

/**
 * Возвращает сырые данные по событиям на линиях (для отладки/модалки).
 * @returns { lineTimelines: Map, rawIntervals: Array<{lineName, date, shiftType, start, end, source}> }
 */
export const getLineTimelineRawData = (demandTable, productionResults, scheduleDates, planLineEvents) => {
    return buildLineTimeline(demandTable || [], productionResults || [], scheduleDates || [], planLineEvents || []);
};

const mergeOverlappingIntervals = (intervals) => {
    if (!intervals || intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i];
        const last = merged[merged.length - 1];
        if (curr.start.getTime() <= last.end.getTime()) {
            if (curr.end.getTime() > last.end.getTime()) last.end = curr.end;
        } else {
            merged.push(curr);
        }
    }
    return merged;
};

const getShiftBounds = (dateStr, shiftLabel) => {
    const baseDate = parseDateToBase(dateStr);
    if (!baseDate) return { start: null, end: null };
    const isNight = shiftLabel === 'night';
    const start = new Date(baseDate);
    const end = new Date(baseDate);
    if (isNight) {
        start.setHours(20, 0, 0, 0);
        end.setDate(end.getDate() + 1);
        end.setHours(8, 0, 0, 0);
    } else {
        start.setHours(8, 0, 0, 0);
        end.setHours(20, 0, 0, 0);
    }
    return { start, end };
};

const intersectTimelineWithShift = (mergedIntervals, dateStr, shiftLabel) => {
    const window = getShiftBounds(dateStr, shiftLabel);
    if (!window.start || !window.end) return null;
    const wS = window.start.getTime();
    const wE = window.end.getTime();
    let outStart = null;
    let outEnd = null;
    (mergedIntervals || []).forEach(({ start, end }) => {
        const s = start.getTime();
        const e = end.getTime();
        const iS = Math.max(s, wS);
        const iE = Math.min(e, wE);
        if (iS < iE) {
            if (outStart == null || iS < outStart) outStart = iS;
            if (outEnd == null || iE > outEnd) outEnd = iE;
        }
    });
    if (outStart == null || outEnd == null || outStart >= outEnd) return null;
    return { start: new Date(outStart), end: new Date(outEnd) };
};

/** Возвращает { dateStr, shiftLabel } для ячейки, в которой находится timestamp (для handover keys). */
const getCellKeyForTimestamp = (ts) => {
    if (!ts || !(ts instanceof Date) || isNaN(ts.getTime())) return null;
    const d = new Date(ts);
    const minutes = d.getHours() * 60 + d.getMinutes();
    const dateStr = formatDateLocal(d);
    if (minutes >= 8 * 60 && minutes < 20 * 60) return { dateStr, shiftLabel: 'day' };
    if (minutes >= 20 * 60) return { dateStr, shiftLabel: 'night' };
    const prevDay = new Date(d);
    prevDay.setDate(prevDay.getDate() - 1);
    return { dateStr: formatDateLocal(prevDay), shiftLabel: 'night' };
};

const getOperationalCellKeyForTimestamp = (ts, scheduleDates) => {
    if (!ts || !(ts instanceof Date) || isNaN(ts.getTime())) return null;
    const targetMs = ts.getTime();
    for (const dateStr of (scheduleDates || [])) {
        const dayWindow = getShiftBounds(dateStr, 'day');
        if (dayWindow.start && dayWindow.end) {
            const s = dayWindow.start.getTime();
            const e = dayWindow.end.getTime();
            if (targetMs >= s && targetMs < e) return { dateStr, shiftLabel: 'day' };
        }
        const nightWindow = getShiftBounds(dateStr, 'night');
        if (nightWindow.start && nightWindow.end) {
            const s = nightWindow.start.getTime();
            const e = nightWindow.end.getTime();
            if (targetMs >= s && targetMs < e) return { dateStr, shiftLabel: 'night' };
        }
    }
    return getCellKeyForTimestamp(ts);
};

const getMergedTimelineForLine = (mergedByLine, lineDisplayName) => {
    for (const [key, intervals] of mergedByLine) {
        if (isLineMatch(key, lineDisplayName) || key === lineDisplayName) return intervals;
    }
    return mergedByLine.get(lineDisplayName) || [];
};

/**
 * Экспорт табеля в Excel с использованием ExcelJS
 */
export const exportWithExcelJS = async (tableData, chessSearch, chessFilterShift) => {
    const { dates, workers } = tableData;
    const filteredWorkers = workers.filter(w => {
        if (chessSearch && !w.name.toLowerCase().includes(chessSearch.toLowerCase())) return false;
        if (chessFilterShift !== 'all') {
            if (chessFilterShift === 'floaters') return w.category.startsWith('floater');
            return w.homeBrigades.has(chessFilterShift);
        }
        return true;
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Табель');
    worksheet.getColumn(1).width = 30;
    worksheet.getColumn(2).width = 10;
    worksheet.getColumn(3).width = 25;
    dates.forEach((_, idx) => { worksheet.getColumn(idx + 4).width = 8; });
    const formattedDates = dates.map(date => {
        const [day, month] = date.split('.');
        return `${day}.${month}`;
    });
    const headerRow = worksheet.addRow(['ФИО Сотрудника', 'Бригада', 'Должность', ...formattedDates]);
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } }, bottom: { style: 'thin', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FF000000' } }, right: { style: 'thin', color: { argb: 'FF000000' } } };
    });
    headerRow.height = 20;

    filteredWorkers.forEach(worker => {
        const rowData = [
            worker.name,
            Array.from(worker.homeBrigades).join(', '),
            worker.role,
            ...dates.map(date => {
                const cell = worker.cells[date] || { text: '', color: 'bg-white', verificationStatus: null };
                return cell.text || '';
            })
        ];
        const row = worksheet.addRow(rowData);
        row.getCell(1).font = { size: 11 };
        row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        row.getCell(2).font = { size: 11, bold: true };
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
        row.getCell(3).font = { size: 10 };
        row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

        dates.forEach((date, dateIdx) => {
            const cell = worker.cells[date] || { text: '', color: 'bg-white', verificationStatus: null };
            const excelCell = row.getCell(dateIdx + 4);
            const cellText = cell.text || '';
            let fillColor = 'FFFFFFFF';
            if (cellText.includes('Д') && !cellText.includes('Д/Н')) fillColor = 'FFC6EFCE';
            else if (cellText.includes('Н')) fillColor = 'FFBDD7EE';
            else if (cellText.includes('Д/Н')) fillColor = 'FFB7DEE8';
            else if (cellText.includes('РВ')) fillColor = 'FFFFE699';
            else if (cellText.includes('—') || cellText.includes('-')) fillColor = 'FFFFF2CC';
            else if (cellText.includes('О')) fillColor = 'FFD5E8D4';
            else if (cellText.includes('Б')) fillColor = 'FFFCE4D6';
            else if (cellText.includes('У')) fillColor = 'FFE2E2E2';
            else if (cellText.includes('!')) fillColor = 'FFFFE699';

            excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
            excelCell.font = { size: 11, bold: true };
            excelCell.alignment = { horizontal: 'center', vertical: 'middle' };

            if (cell.verificationStatus === 'ok') {
                excelCell.border = { top: { style: 'medium', color: { argb: 'FF00B050' } }, bottom: { style: 'medium', color: { argb: 'FF00B050' } }, left: { style: 'medium', color: { argb: 'FF00B050' } }, right: { style: 'medium', color: { argb: 'FF00B050' } } };
                excelCell.value = (cellText || '') + ' ✓';
            } else if (cell.verificationStatus === 'missing') {
                excelCell.border = { top: { style: 'medium', color: { argb: 'FFFF0000' } }, bottom: { style: 'medium', color: { argb: 'FFFF0000' } }, left: { style: 'medium', color: { argb: 'FFFF0000' } }, right: { style: 'medium', color: { argb: 'FFFF0000' } } };
                excelCell.value = (cellText || '') + ' ✗';
            } else if (cell.verificationStatus === 'unassigned') {
                 excelCell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
                excelCell.value = (cellText || '') + ' ⏰';
            } else if (cell.verificationStatus === 'unexpected') {
                 excelCell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
                excelCell.value = (cellText || '') + ' !';
            } else {
                excelCell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
            }
        });
        [1, 2, 3].forEach(col => {
            const cell = row.getCell(col);
            if (!cell.border) cell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
        });
    });

    worksheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1, topLeftCell: 'D2', activeCell: 'D2' }];
    dates.forEach((_, idx) => { worksheet.getColumn(idx + 4).width = 6; });
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: filteredWorkers.length + 1, column: dates.length + 3 } };

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const filterSuffix = chessFilterShift !== 'all' ? `_${chessFilterShift === 'floaters' ? 'Резерв' : `Бригада${chessFilterShift}`}` : '';
    const fileName = `Табель_${dateStr}${filterSuffix}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
};

/**
 * Экспорт табеля в Excel с использованием XLSX (fallback)
 */
export const exportWithXLSX = (tableData, chessSearch, chessFilterShift) => {
    const { dates, workers } = tableData;
    const filteredWorkers = workers.filter(w => {
        if (chessSearch && !w.name.toLowerCase().includes(chessSearch.toLowerCase())) return false;
        if (chessFilterShift !== 'all') {
            if (chessFilterShift === 'floaters') return w.category.startsWith('floater');
            return w.homeBrigades.has(chessFilterShift);
        }
        return true;
    });

    const excelData = [];
    const headerRow = ['ФИО Сотрудника', 'Бригада', 'Должность', ...dates];
    excelData.push(headerRow);

    filteredWorkers.forEach(worker => {
        const row = [
            worker.name,
            Array.from(worker.homeBrigades).join(', '),
            worker.role,
            ...dates.map(date => {
                const cell = worker.cells[date] || { text: '', color: 'bg-white', verificationStatus: null };
                let cellText = cell.text || '';
                if (cell.verificationStatus === 'ok') cellText += ' ✓';
                else if (cell.verificationStatus === 'missing') cellText += ' ✗';
                else if (cell.verificationStatus === 'unexpected') cellText += ' !';
                return cellText;
            })
        ];
        excelData.push(row);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    
    const colWidths = [{ wch: 30 }, { wch: 10 }, { wch: 25 }, ...dates.map(() => ({ wch: 8 }))];
    ws['!cols'] = colWidths;
    ws['!freeze'] = { xSplit: 3, ySplit: 1, topLeftCell: 'D2', activePane: 'bottomRight', state: 'frozen' };
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_cell({ r: filteredWorkers.length, c: dates.length + 2 })}` };
    XLSX.utils.book_append_sheet(wb, ws, 'Табель');
    
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const filterSuffix = chessFilterShift !== 'all' ? `_${chessFilterShift === 'floaters' ? 'Резерв' : `Бригада${chessFilterShift}`}` : '';
    const fileName = `Табель_${dateStr}${filterSuffix}.xlsx`;
    XLSX.writeFile(wb, fileName);
};

/**
 * Экспорт графика по линиям в Excel
 * mode:
 * - 'full'      — экспорт с сотрудниками и вакансиями
 * - 'vacancies' — только вакансии (занятые слоты пустые)
 */
export const exportScheduleByLinesToExcel = async ({
    scheduleDates,
    lineTemplates,
    getShiftsForDate,
    notify,
    mode = 'full',
    productionResults = [],
    demandTable = null,
    planLineEvents = []
}) => {
    if (!scheduleDates.length) {
        notify({ type: 'error', message: 'Нет данных для экспорта' });
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('График по линиям');

    const headerRow1 = ['Линия', 'Должность'];
    const headerRow2 = ['', ''];

    const formatTime = (date) => {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '';
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const formatTimeRange = (window) => {
        if (!window?.start || !window?.end) return '';
        const start = window.start.getTime();
        const end = window.end.getTime();
        if (end <= start) return '';
        const sameDay = window.start.getDate() === window.end.getDate() &&
            window.start.getMonth() === window.end.getMonth() &&
            window.start.getFullYear() === window.end.getFullYear();
        const startStr = formatTime(window.start);
        const endStr = formatTime(window.end);
        if (sameDay && startStr === endStr) return '';
        const nextDay = window.end.getDate() !== window.start.getDate() ||
            window.end.getMonth() !== window.start.getMonth();
        if (nextDay && startStr === endStr) return `${startStr}–${endStr} (след. день)`;
        return `${startStr}–${endStr}`;
    };

    // Только для переходов: показываем время, если линия не на всю смену (начало или конец внутри окна).
    const formatTimeRangeOnlyTransitions = (window, dateStr, shiftLabel) => {
        const base = formatTimeRange(window);
        if (!base || !window?.start || !window?.end) return '';
        const shiftBounds = getShiftBounds(dateStr, shiftLabel);
        if (!shiftBounds.start || !shiftBounds.end) return '';

        const wS = window.start.getTime();
        const wE = window.end.getTime();
        const sS = shiftBounds.start.getTime();
        const sE = shiftBounds.end.getTime();
        const startsInside = wS > sS;
        const endsInside = wE < sE;
        if (!startsInside && !endsInside) return ''; // полная смена — не показываем
        const leftMarker = startsInside ? '▶' : '';
        const rightMarker = endsInside ? '◀' : '';
        return `${leftMarker}${base}${rightMarker}`;
    };

    scheduleDates.forEach(date => {
        const [day, month] = date.split('.');
        const shortDate = month ? `${day}.${month}` : date;
        headerRow1.push(shortDate, '');
        headerRow2.push('День', 'Ночь');
    });

    const r1 = worksheet.addRow(headerRow1);
    const r2 = worksheet.addRow(headerRow2);

    let colIndex = 3;
    scheduleDates.forEach(() => {
        worksheet.mergeCells(1, colIndex, 1, colIndex + 1);
        colIndex += 2;
    });

    const applyBorder = (cell) => {
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        };
    };

    const dayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    const nightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    const vacancyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } };

    [r1, r2].forEach((row) => {
        row.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
            cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' };
            applyBorder(cell);
        });
    });

    scheduleDates.forEach((_, idx) => {
        const dayCol = 3 + idx * 2;
        const nightCol = dayCol + 1;
        r2.getCell(dayCol).fill = dayFill;
        r2.getCell(nightCol).fill = nightFill;
    });

    // --- Collect lines and roles from BOTH templates and actual schedule ---
    const linesMap = new Map();

    // 1. Pre-fill from lineTemplates
    Object.entries(lineTemplates).forEach(([lineKey, positions], idx) => {
        const rolesMap = new Map();
        positions.forEach(pos => {
            rolesMap.set(pos.role, Math.max(rolesMap.get(pos.role) || 0, parseInt(pos.count) || 1));
        });
        linesMap.set(lineKey, { displayName: lineKey, sortIndex: idx, roles: rolesMap });
    });

    // 2. Scan actual schedule (по людям) для дополнения линий/ролей
    scheduleDates.forEach(date => {
        const shifts = getShiftsForDate(date);
        shifts.forEach(shift => {
            if (!shift.lineTasks) return;
            shift.lineTasks.forEach(task => {
                const lineName = task.displayName || 'Без названия';
                
                let matchedKey = null;
                for (const k of linesMap.keys()) {
                    if (isLineMatch(k, lineName) || k === lineName) {
                        matchedKey = k;
                        break;
                    }
                }

                if (!matchedKey) {
                    matchedKey = lineName;
                    if (!linesMap.has(matchedKey)) {
                        linesMap.set(matchedKey, { displayName: lineName, sortIndex: 9999, roles: new Map() });
                    }
                }

                const lineEntry = linesMap.get(matchedKey);
                
                const currentRoleCounts = {};
                task.slots.forEach(slot => {
                    const role = slot.roleTitle || 'Оператор';
                    currentRoleCounts[role] = (currentRoleCounts[role] || 0) + 1;
                });

                Object.entries(currentRoleCounts).forEach(([role, count]) => {
                    const max = lineEntry.roles.get(role) || 0;
                    if (count > max) {
                        lineEntry.roles.set(role, count);
                    }
                });
            });
        });
    });

    // --- Таймлайн линии: все события из demand, production и planLineEvents, мерж, пересечение с окном смены ---
    const { lineTimelines, rawIntervals } = buildLineTimeline(demandTable || [], productionResults || [], scheduleDates, planLineEvents || []);

    // 3. Добавить линии из таймлайна (plan/demand/production), чтобы в экспорте была строка «Время линии» даже без слотов в расписании.
    // Важно: проверяем семантическое совпадение, иначе получаем дубли "Линия3" и "Линия 3".
    lineTimelines.forEach((intervals, lineKey) => {
        let matchedKey = null;
        for (const k of linesMap.keys()) {
            if (isLineMatch(k, lineKey) || k === lineKey) {
                matchedKey = k;
                break;
            }
        }
        if (!matchedKey) {
            linesMap.set(lineKey, { displayName: lineKey, sortIndex: 9998, roles: new Map() });
        }
    });

    const mergedByLine = new Map();
    lineTimelines.forEach((intervals, lineKey) => {
        mergedByLine.set(lineKey, mergeOverlappingIntervals(intervals));
    });

    const epsilonMs = 60 * 1000;

    const extractLineNumber = (name) => {
        if (!name) return null;
        const m = String(name).match(/Линия\s*(\d+)/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) ? n : null;
    };

    const sortedLines = Array.from(linesMap.entries()).sort((a, b) => {
        const aName = a[1]?.displayName || a[0];
        const bName = b[1]?.displayName || b[0];
        const aNum = extractLineNumber(aName);
        const bNum = extractLineNumber(bName);

        // Основной порядок: по номеру линии (Линия 2 < Линия 10)
        if (aNum != null && bNum != null && aNum !== bNum) return aNum - bNum;
        if (aNum != null && bNum == null) return -1;
        if (aNum == null && bNum != null) return 1;

        // Далее — по исходному индексу из шаблонов
        const aIdx = a[1]?.sortIndex ?? 9999;
        const bIdx = b[1]?.sortIndex ?? 9999;
        if (aIdx !== bIdx) return aIdx - bIdx;

        // И в конце — по имени
        return String(aName).localeCompare(String(bName), 'ru', { numeric: true, sensitivity: 'base' });
    });

    // --- Маркеры в "Время линии": ▶ начало внутри окна смены, ◀ окончание внутри окна смены ---

    const resolveWorkerName = (shift, lineKey, role, slotIndex) => {
        if (!shift) return '';
        const lineTask = shift.lineTasks.find(lt => isLineMatch(lt.displayName, lineKey) || lt.displayName === lineKey);
        if (!lineTask) return '';
        const slotsForRole = lineTask.slots.filter(s => s.roleTitle === role);
        const slot = slotsForRole[slotIndex];
        if (!slot) return '';

        // Во втором режиме любая существующая ячейка считается вакансией (матрица ролей)
        if (mode === 'vacancies') {
            return 'Вакансия';
        }

        if (slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned' || slot.status === 'outsourced') {
            const name = slot.assigned?.name?.trim();
            if (name) {
                return name;
            }
        }
        return 'Вакансия';
    };

    sortedLines.forEach(([lineKey, lineData]) => {
        let isFirstLineRow = true;
        let anyRowsForLine = false;

        // Строка «Время линии»: пересечение таймлайна линии с окном каждой смены
        const lineDisplayName = lineData.displayName;
        const mergedIntervals = getMergedTimelineForLine(mergedByLine, lineDisplayName);
        const timeRowData = [lineDisplayName, 'Время линии'];
        scheduleDates.forEach((date) => {
            const dayWindow = intersectTimelineWithShift(mergedIntervals, date, 'day');
            const nightWindow = intersectTimelineWithShift(mergedIntervals, date, 'night');
            const dayLabel = formatTimeRangeOnlyTransitions(dayWindow, date, 'day');
            const nightLabel = formatTimeRangeOnlyTransitions(nightWindow, date, 'night');
            timeRowData.push(dayLabel, nightLabel);
        });
        const hasTimeData = timeRowData.some((val, idx) => idx >= 2 && String(val ?? '').trim() !== '');
        if (hasTimeData) {
            const timeRow = worksheet.addRow(timeRowData);
            timeRow.eachCell((cell, colNumber) => {
                applyBorder(cell);
                cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' };
                if (colNumber === 1) {
                    cell.font = { bold: true };
                } else if (colNumber === 2) {
                    cell.font = { italic: true };
                }
            });
            // Подсветка по дням/ночам
            scheduleDates.forEach((_, idx) => {
                const dayCol = 3 + idx * 2;
                const nightCol = dayCol + 1;
                timeRow.getCell(dayCol).fill = dayFill;
                timeRow.getCell(nightCol).fill = nightFill;
            });
            anyRowsForLine = true;
            // Название линии уже показано в строке "Время линии", не дублируем в первой строке ролей.
            isFirstLineRow = false;
        }
        
        lineData.roles.forEach((count, role) => {
            for (let i = 0; i < count; i++) {
                const roleLabel = `${role}${count > 1 ? ` ${i + 1}` : ''}`.trim();
                const rowData = [isFirstLineRow ? lineDisplayName : '', roleLabel];

                scheduleDates.forEach(date => {
                    const shifts = getShiftsForDate(date);
                    const dayShift = shifts.find(s => String(s.type || '').toLowerCase().includes('день'));
                    const nightShift = shifts.find(s => String(s.type || '').toLowerCase().includes('ночь'));
                    rowData.push(resolveWorkerName(dayShift, lineKey, role, i));
                    rowData.push(resolveWorkerName(nightShift, lineKey, role, i));
                });

                // Пропускаем полностью пустые строки (линия не выходит ни в один день)
                const hasData = rowData.some((val, idx) => idx >= 2 && String(val ?? '').trim() !== '');
                if (!hasData) {
                    continue;
                }

                const row = worksheet.addRow(rowData);
                row.eachCell((cell, colNumber) => {
                    applyBorder(cell);
                    cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' };
                    if (colNumber === 1 && rowData[0]) {
                        cell.font = { bold: true };
                    }
                });

                scheduleDates.forEach((date, idx) => {
                    const dayCol = 3 + idx * 2;
                    const nightCol = dayCol + 1;
                    row.getCell(dayCol).fill = dayFill;
                    row.getCell(nightCol).fill = nightFill;
                });
                rowData.forEach((val, i) => {
                    if (i >= 2 && val === 'Вакансия') {
                        const col = i + 1;
                        row.getCell(col).fill = vacancyFill;
                    }
                });

                anyRowsForLine = true;
                isFirstLineRow = false;
            }
        });

        // Небольшой визуальный отступ между линиями
        if (anyRowsForLine) {
            const spacerData = Array(2 + scheduleDates.length * 2).fill('');
            const spacerRow = worksheet.addRow(spacerData);
            spacerRow.eachCell((cell) => {
                applyBorder(cell);
            });
        }
    });

    const collectFreeHands = (shift) => {
        if (!shift) return [];
        const items = [];
        (shift.unassignedPeople || []).forEach(p => {
            if (p?.isAvailable && p?.name) {
                const role = p.role ? ` — ${p.role}` : '';
                items.push(`${p.name}${role}`);
            }
        });
        (shift.floaters || []).forEach(f => {
            if (f?.name) {
                const role = f.role ? ` — ${f.role}` : '';
                items.push(`${f.name}${role}`);
            }
        });
        return Array.from(new Set(items));
    };

    // В режиме "без людей" (матрица вакансий) блок "Свободные руки" не нужен
    if (mode !== 'vacancies') {
        const emptyRow = Array(2 + scheduleDates.length * 2).fill('');
        const spacerRow = worksheet.addRow(emptyRow);
        spacerRow.eachCell((cell) => applyBorder(cell));

        const labelRowData = ['Свободные руки', '', ...Array(scheduleDates.length * 2).fill('')];
        const labelRow = worksheet.addRow(labelRowData);
        worksheet.mergeCells(labelRow.number, 1, labelRow.number, 2);
        labelRow.getCell(1).font = { bold: true };
        labelRow.eachCell((cell) => applyBorder(cell));

        const freeHandsRow = ['', ''];
        scheduleDates.forEach(date => {
            const shifts = getShiftsForDate(date);
            const dayShift = shifts.find(s => String(s.type || '').toLowerCase().includes('день'));
            const nightShift = shifts.find(s => String(s.type || '').toLowerCase().includes('ночь'));
            const dayNames = collectFreeHands(dayShift).join('\n');
            const nightNames = collectFreeHands(nightShift).join('\n');
            freeHandsRow.push(dayNames, nightNames);
        });

        const freeHandsDataRow = worksheet.addRow(freeHandsRow);
        freeHandsDataRow.eachCell((cell, colNumber) => {
            applyBorder(cell);
            if (colNumber > 2) {
                cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
            }
        });
        scheduleDates.forEach((_, idx) => {
            const dayCol = 3 + idx * 2;
            const nightCol = dayCol + 1;
            freeHandsDataRow.getCell(dayCol).fill = dayFill;
            freeHandsDataRow.getCell(nightCol).fill = nightFill;
        });
    }

    // Легенда внизу листа — отдельным блоком (колонки A и B).
    const legendSpacer = worksheet.addRow(Array(2 + scheduleDates.length * 2).fill(''));
    legendSpacer.eachCell((cell) => applyBorder(cell));

    const legendFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    const legendTitleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0D0D0' } };
    const legendBorder = {
        top: { style: 'medium', color: { argb: 'FF808080' } },
        left: { style: 'medium', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'medium', color: { argb: 'FF808080' } }
    };

    const legendTitleRow = worksheet.addRow(['Легенда', '']);
    legendTitleRow.height = 22;
    worksheet.mergeCells(legendTitleRow.number, 1, legendTitleRow.number, 2);
    const titleCell = legendTitleRow.getCell(1);
    titleCell.font = { bold: true, size: 12 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = legendTitleFill;
    titleCell.border = legendBorder;

    const addLegendRow = (term, description, termFill = null) => {
        const row = worksheet.addRow([term, description]);
        row.height = 20;
        row.getCell(1).font = { bold: true };
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(1).fill = termFill || legendFill;
        row.getCell(1).border = legendBorder;
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        row.getCell(2).fill = legendFill;
        row.getCell(2).border = legendBorder;
        return row;
    };

    addLegendRow('Вакансия', 'Слот не закрыт сотрудником', vacancyFill);
    addLegendRow('Время линии', 'Фактическое время работы линии в сменном окне');
    addLegendRow('▶', 'Начало работы линии внутри окна смены');
    const lastLegendRow = worksheet.addRow(['◀', 'Окончание работы линии внутри окна смены']);
    lastLegendRow.height = 20;
    lastLegendRow.getCell(1).font = { bold: true };
    lastLegendRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    lastLegendRow.getCell(1).fill = legendFill;
    lastLegendRow.getCell(1).border = { ...legendBorder, bottom: { style: 'medium', color: { argb: 'FF808080' } } };
    lastLegendRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    lastLegendRow.getCell(2).fill = legendFill;
    lastLegendRow.getCell(2).border = { ...legendBorder, bottom: { style: 'medium', color: { argb: 'FF808080' } } };

    const autoFitColumn = (column, minWidth = 10, maxWidth = 40) => {
        let maxLen = minWidth;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const value = cell.value;
            if (value == null) return;
            const text = typeof value === 'string' ? value : String(value);
            maxLen = Math.max(maxLen, text.length + 2);
        });
        column.width = Math.min(Math.max(maxLen, minWidth), maxWidth);
    };

    worksheet.columns.forEach((column, idx) => {
        const isTextColumn = idx === 0 || idx === 1;
        autoFitColumn(column, isTextColumn ? 12 : 8, isTextColumn ? 45 : 22);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `График_по_линиям_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
};


import * as XLSX from 'xlsx';
import { parseExcelDateTime } from '../../utils';

// Лист подходит, если в имени есть "Линия" и цифра (номер линии): "Линия 10 ПЭТ", "Линия розлива №5"
const isLineSheetName = (name) => /Линия/i.test(String(name)) && /\d+/.test(String(name));

const normalizeLineNameFromSheetName = (sheetName) => {
    if (!sheetName || typeof sheetName !== 'string') return '';
    const m = String(sheetName).trim().match(/Линия\D*(\d+)/i);
    if (m) return `Линия ${parseInt(m[1], 10)}`;
    return '';
};

const isHeaderRow = (row, colA, colB) => {
    const a = String(row[colA] ?? '').toLowerCase();
    const b = String(row[colB] ?? '').toLowerCase();
    const aHasStart = a.includes('начало') || a.includes('начал');
    const bHasEnd = b.includes('окончание') || b.includes('конец') || b.includes('окончан');
    return (aHasStart && bHasEnd) || ((a.includes('дата') && aHasStart) || (b.includes('дата') && bHasEnd));
};

const getReferenceYearFromScheduleDates = (scheduleDates) => {
    if (!Array.isArray(scheduleDates) || scheduleDates.length === 0) return undefined;
    const first = scheduleDates[0];
    if (typeof first === 'string') {
        const m = first.match(/(\d{4})/);
        if (m) return parseInt(m[1], 10);
    }
    if (first instanceof Date && !isNaN(first.getTime())) return first.getFullYear();
    return undefined;
};

/**
 * Парсит листы книги плана с именами «Линия X …», извлекает события из колонок A (Дата начала) и B (Дата окончания).
 * @param {object} workbook - книга XLSX
 * @param {string[]|Date[]} [scheduleDates] - даты расписания для определения года (формат "dd.mm.yyyy" или Date)
 * @returns {Array<{ lineName: string, rows: Array<{ start: Date, end: Date }> }>}
 */
export const parsePlanLineSheets = (workbook, scheduleDates) => {
    if (!workbook || !workbook.SheetNames || !Array.isArray(workbook.SheetNames)) return [];
    const referenceYear = getReferenceYearFromScheduleDates(scheduleDates);
    const out = [];
    const lineSheetNames = workbook.SheetNames.filter(isLineSheetName);
    for (const sheetName of lineSheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const lineName = normalizeLineNameFromSheetName(sheetName);
        if (!lineName) continue;
        const rawStr = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        if (!Array.isArray(rawStr) || rawStr.length < 1) continue;
        const headerRowIndex = rawStr.findIndex((row) => isHeaderRow(row || [], 0, 1));
        if (headerRowIndex < 0) continue;
        const dataStartIndex = headerRowIndex + 1;
        const rawNum = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        const dataRows = Array.isArray(rawNum) ? rawNum : rawStr;
        if (dataStartIndex >= dataRows.length) continue;
        const rows = [];
        for (let i = dataStartIndex; i < dataRows.length; i++) {
            const row = dataRows[i] || [];
            const colE = row[4] ?? rawStr[i]?.[4];
            if (String(colE ?? '').includes('Переход на линию')) continue;
            const valA = row[0] ?? rawStr[i]?.[0];
            const valB = row[1] ?? rawStr[i]?.[1];
            if (valA == null && valB == null) continue;
            const start = parseExcelDateTime(valA, { referenceYear });
            const end = parseExcelDateTime(valB, { referenceYear });
            if (!start || !end || start.getTime() >= end.getTime()) continue;
            if (start.getFullYear() < 2000 || end.getFullYear() < 2000) continue;
            rows.push({ start, end });
        }
        if (rows.length > 0) out.push({ lineName, rows });
    }
    return out;
};

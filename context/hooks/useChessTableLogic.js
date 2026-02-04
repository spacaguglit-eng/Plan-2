import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { useNotification } from '../../components/common/Toast';
import { normalizeName, matchNames, checkWorkerAvailability } from '../../utils';
import { getSurnameNorm } from '../dataContextUtils';

const USE_CHESS_WORKER = true;

export function useChessTableLogic(state, shiftCalculations) {
    const { notify } = useNotification();
    const {
        viewMode,
        rawTables,
        scheduleDates,
        lineTemplates,
        floaters,
        workerRegistry,
        factData,
        manualAssignments,
        manualLines,
        autoReassignEnabled,
        assignmentClones,
        chessFilterShift,
        chessSearch,
        cloneCountsByName
    } = state;

    const { getShiftsForDate } = shiftCalculations;

    const [chessTableWorkerResult, setChessTableWorkerResult] = useState(null);
    const [chessTableWorkerStatus, setChessTableWorkerStatus] = useState({ status: 'idle', error: null, requestId: 0 });
    const chessTableWorkerRef = useRef(null);
    const chessTableWorkerReqIdRef = useRef(0);

    // --- CHESS TABLE WORKER LIFECYCLE ---
    useEffect(() => {
        if (!USE_CHESS_WORKER) return;
        if (chessTableWorkerRef.current) return;

        const worker = new Worker(new URL('../../chessTable.worker.js', import.meta.url), { type: 'module' });
        chessTableWorkerRef.current = worker;

        worker.onmessage = (e) => {
            const { requestId, result, error } = e.data || {};
            if (!requestId || requestId !== chessTableWorkerReqIdRef.current) return;

            if (error) {
                setChessTableWorkerStatus({ status: 'error', error: String(error), requestId });
                return;
            }

            const workers = (result?.workers || []).map(w => ({
                ...w,
                homeBrigades: new Set(w.homeBrigades || [])
            }));

            setChessTableWorkerResult(result ? { ...result, workers } : null);
            setChessTableWorkerStatus({ status: 'ready', error: null, requestId });
        };

        worker.onerror = (err) => {
            setChessTableWorkerStatus((prev) => ({ ...prev, status: 'error', error: err?.message || 'Worker error' }));
        };

        return () => {
            try { worker.terminate(); } catch (_) {}
            chessTableWorkerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!USE_CHESS_WORKER) return;
        if (viewMode !== 'chess') return;
        const worker = chessTableWorkerRef.current;
        if (!worker) return;
        if (!rawTables?.demand || !Array.isArray(scheduleDates) || scheduleDates.length === 0) return;

        const requestId = ++chessTableWorkerReqIdRef.current;
        setChessTableWorkerStatus({ status: 'calculating', error: null, requestId });

        // Structured-clone friendly payload (no Set/Map)
        const workerRegistryForWorker = {};
        Object.entries(workerRegistry || {}).forEach(([key, value]) => {
            workerRegistryForWorker[key] = {
                ...value,
                competencies: Array.from(value?.competencies || [])
            };
        });

        worker.postMessage({
            requestId,
            payload: {
                scheduleDates,
                demand: rawTables.demand,
                lineTemplates,
                floaters,
                manualAssignments,
                workerRegistry: workerRegistryForWorker,
                factData,
                manualLines,
                autoReassignEnabled,
                assignmentClones
            }
        });
    }, [viewMode, rawTables, scheduleDates, lineTemplates, floaters, manualAssignments, workerRegistry, factData, manualLines, autoReassignEnabled, assignmentClones]);

    const chessTableBase = useMemo(() => {
        // Avoid spending CPU when user isn't on the timesheet view.
        if (viewMode !== 'chess') return null;
        if (USE_CHESS_WORKER) return null;
        if (!rawTables?.demand || !rawTables?.roster) return null;

        const sortedDates = Array.isArray(scheduleDates) ? scheduleDates : [];
        if (sortedDates.length === 0) return null;

        const availabilityCache = new Map();
        const getAvailabilityCached = (name, dateStr) => {
            const k = `${name}|${dateStr}`;
            if (availabilityCache.has(k)) return availabilityCache.get(k);
            const v = checkWorkerAvailability(name, dateStr, workerRegistry);
            availabilityCache.set(k, v);
            return v;
        };

        // --- Build workers list (plan + floaters) ---
        const workerMeta = new Map();
        Object.keys(lineTemplates).forEach(lineKey => {
            lineTemplates[lineKey].forEach(pos => {
                const roster = pos?.roster || {};
                Object.entries(roster).forEach(([bId, val]) => {
                    if (!val) return;
                    String(val).split(/[,;\n/]+/).map(n => n.trim()).filter(n => n.length > 1).forEach(name => {
                        if (!workerMeta.has(name)) {
                            workerMeta.set(name, { name, role: pos.role, homeLine: lineKey, homeBrigades: new Set(), category: 'staff', sortShift: 99 });
                        }
                        const w = workerMeta.get(name);
                        w.homeBrigades.add(bId);
                        w.sortShift = Math.min(w.sortShift, parseInt(bId) || 99);
                    });
                });
            });
        });

        floaters.day.forEach(f => {
            if (!f?.name) return;
            if (!workerMeta.has(f.name)) workerMeta.set(f.name, { name: f.name, role: 'Подсобник', homeLine: 'Резерв Д', homeBrigades: new Set(), category: 'floater_day', sortShift: 100 });
        });
        floaters.night.forEach(f => {
            if (!f?.name) return;
            if (!workerMeta.has(f.name)) workerMeta.set(f.name, { name: f.name, role: 'Подсобник', homeLine: 'Резерв Н', homeBrigades: new Set(), category: 'floater_night', sortShift: 101 });
        });

        const workerRows = Array.from(workerMeta.values()).sort((a, b) => (a.category === 'staff' ? a.sortShift - b.sortShift : 10) || a.name.localeCompare(b.name));

        const workerLookupByNorm = new Map();
        const workersBySurname = new Map();
        workerRows.forEach(w => {
            const norm = normalizeName(w.name);
            workerLookupByNorm.set(norm, w);
            const surname = getSurnameNorm(w.name);
            if (!workersBySurname.has(surname)) workersBySurname.set(surname, []);
            workersBySurname.get(surname).push(w);
        });

        const workerRegistryLookupByNorm = new Map();
        const workerRegistryBySurname = new Map();
        Object.values(workerRegistry).forEach(w => {
            if (!w?.name) return;
            const norm = normalizeName(w.name);
            workerRegistryLookupByNorm.set(norm, w);
            const surname = getSurnameNorm(w.name);
            if (!workerRegistryBySurname.has(surname)) workerRegistryBySurname.set(surname, []);
            workerRegistryBySurname.get(surname).push(w);
        });

        // --- Facts index (by date) ---
        const factLookupByDate = new Map(); // date -> Map<norm, entry>
        const factBySurnameByDate = new Map(); // date -> Map<surnameNorm, entry[]>
        if (factData) {
            Object.entries(factData).forEach(([date, dateData]) => {
                const dateMap = new Map();
                const surnameMap = new Map();
                Object.values(dateData || {}).forEach((factEntry) => {
                    if (!factEntry) return;
                    const rawName = factEntry.rawName || '';
                    const norm = normalizeName(rawName);
                    if (norm) dateMap.set(norm, factEntry);
                    const surname = getSurnameNorm(rawName);
                    if (!surnameMap.has(surname)) surnameMap.set(surname, []);
                    surnameMap.get(surname).push(factEntry);
                });
                factLookupByDate.set(date, dateMap);
                factBySurnameByDate.set(date, surnameMap);
            });
        }

        const resolveFactEntry = (dateStr, workerName) => {
            const dateMap = factLookupByDate.get(dateStr);
            if (!dateMap) return null;
            const normName = normalizeName(workerName);
            const exact = dateMap.get(normName);
            if (exact) return exact;
            const surname = getSurnameNorm(workerName);
            const surnameMap = factBySurnameByDate.get(dateStr);
            const candidates = surnameMap?.get(surname) || [];
            for (const candidate of candidates) {
                if (candidate?.rawName && matchNames(workerName, candidate.rawName)) return candidate;
            }
            return null;
        };

        // --- Add unexpected workers (present in facts but not in plan) ---
        if (factData) {
            const unexpectedWorkersMap = new Map();
            sortedDates.forEach(date => {
                const surnameMap = factBySurnameByDate.get(date);
                if (!surnameMap) return;
                surnameMap.forEach((entries) => {
                    entries.forEach((factEntry) => {
                        if (!factEntry?.rawName) return;
                        if (!factEntry.cleanTime) return;

                        const factNormName = normalizeName(factEntry.rawName);
                        if (workerLookupByNorm.has(factNormName)) return;

                        const surname = getSurnameNorm(factEntry.rawName);
                        const candidates = workersBySurname.get(surname) || [];
                        let foundInPlan = false;
                        for (const worker of candidates) {
                            if (matchNames(worker.name, factEntry.rawName)) { foundInPlan = true; break; }
                        }
                        if (foundInPlan) return;

                        if (!unexpectedWorkersMap.has(factNormName)) {
                            let regEntry = workerRegistryLookupByNorm.get(factNormName);
                            if (!regEntry) {
                                const regCandidates = workerRegistryBySurname.get(surname) || [];
                                for (const w of regCandidates) {
                                    if (matchNames(w.name, factEntry.rawName)) { regEntry = w; break; }
                                }
                            }
                            unexpectedWorkersMap.set(factNormName, {
                                name: factEntry.rawName,
                                role: regEntry ? regEntry.role : 'Неизвестно',
                                homeLine: 'Вне плана',
                                homeBrigades: new Set(),
                                category: 'unexpected',
                                sortShift: 102,
                                cells: {}
                            });
                        }
                    });
                });
            });

            if (unexpectedWorkersMap.size > 0) {
                unexpectedWorkersMap.forEach(worker => workerRows.push(worker));
                workerRows.sort((a, b) => (a.category === 'staff' ? a.sortShift - b.sortShift : 10) || a.name.localeCompare(b.name));
            }
        }

        workerRows.forEach(worker => { worker.cells = {}; });

        // --- Fill cells ---
        sortedDates.forEach(date => {
            const shiftsOnDate = getShiftsForDate(date);
            const workingWorkers = new Map();
            const idleWorkers = new Map();

            shiftsOnDate.forEach(shift => {
                const isNight = shift.type.toLowerCase().includes('ночь');
                const shiftCode = isNight ? 'Н' : 'Д';
                shift.lineTasks.forEach(task => {
                    task.slots.forEach(slot => {
                        if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                            const wName = slot.assigned.name;
                            if (slot.assigned.type === 'external') {
                                workingWorkers.set(wName, { code: 'РВ', brigadeId: shift.id, isRv: true });
                            } else {
                                const current = workingWorkers.get(wName);
                                const code = current && current.code !== shiftCode && !current.isRv ? 'Д/Н' : shiftCode;
                                workingWorkers.set(wName, { code, brigadeId: shift.id });
                            }
                        }
                    });
                });
                shift.unassignedPeople.forEach(p => { if (p.isAvailable) idleWorkers.set(p.name, shift.id); });
                shift.floaters.forEach(f => idleWorkers.set(f.name, shift.id));
            });

            workerRows.forEach(worker => {
                let text = '';
                let color = 'bg-white';
                let brigadeId = null;
                let verificationStatus = null;

                const avail = getAvailabilityCached(worker.name, date);
                if (!avail.available) {
                    if (avail.type === 'vacation') { text = 'О'; color = 'bg-emerald-50 text-emerald-700'; }
                    else if (avail.type === 'sick') { text = 'Б'; color = 'bg-amber-50 text-amber-700'; }
                    else if (avail.type === 'fired') { text = 'У'; color = 'bg-slate-200 text-slate-500'; }
                } else if (workingWorkers.has(worker.name)) {
                    const workData = workingWorkers.get(worker.name);
                    text = workData.code;
                    brigadeId = workData.brigadeId;
                    if (text === 'Д') color = 'bg-green-100 text-green-800 font-bold';
                    else if (text === 'Н') color = 'bg-blue-100 text-blue-800 font-bold';
                    else if (text === 'Д/Н') color = 'bg-teal-100 text-teal-800 font-bold';
                    else if (text === 'РВ') color = 'bg-orange-100 text-orange-700 font-bold';

                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry) {
                        if (factEntry.cleanTime) {
                            verificationStatus = 'ok';
                        } else {
                            verificationStatus = 'missing';
                        }
                    }
                } else if (idleWorkers.has(worker.name)) {
                    text = '—';
                    color = 'bg-yellow-100 text-yellow-800 font-bold';
                    brigadeId = idleWorkers.get(worker.name);

                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry) {
                        if (factEntry.cleanTime) {
                            verificationStatus = 'unassigned';
                        } else {
                            verificationStatus = 'missing';
                        }
                    }
                } else {
                    const factEntry = resolveFactEntry(date, worker.name);
                    if (factEntry && factEntry.cleanTime) {
                        verificationStatus = 'unexpected';
                        text = '!';
                        color = 'bg-orange-50 text-orange-700 font-bold';
                    }
                }

                worker.cells[date] = { text, color, brigadeId, verificationStatus };
            });
        });

        return { dates: sortedDates, workers: workerRows, cloneCountsByName };
    }, [viewMode, rawTables, scheduleDates, lineTemplates, floaters.day, floaters.night, workerRegistry, factData, getShiftsForDate, cloneCountsByName]);

    const calculateChessTable = useCallback(() => {
        if (USE_CHESS_WORKER) return chessTableWorkerResult;
        return chessTableBase;
    }, [chessTableWorkerResult, chessTableBase]);

    const exportWithExcelJS = async (tableData) => {
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

     const exportWithXLSX = (tableData) => {
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

    const exportScheduleByLinesToExcel = useCallback(async () => {
        if (!scheduleDates.length) {
            notify({ type: 'error', message: 'Нет данных для экспорта' });
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('График по линиям');

        const headerRow1 = ['Линия', 'Должность'];
        const headerRow2 = ['', ''];

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

        const linesMap = new Map();

        Object.entries(lineTemplates).forEach(([lineKey, positions], idx) => {
            const rolesMap = new Map();
            positions.forEach(pos => {
                rolesMap.set(pos.role, Math.max(rolesMap.get(pos.role) || 0, parseInt(pos.count) || 1));
            });
            linesMap.set(lineKey, { displayName: lineKey, sortIndex: idx, roles: rolesMap });
        });

        scheduleDates.forEach(date => {
            const shifts = getShiftsForDate(date);
            shifts.forEach(shift => {
                if (!shift.lineTasks) return;
                shift.lineTasks.forEach(task => {
                    const lineName = task.displayName || 'Без названия';
                    
                    let matchedKey = null;
                    for (const k of linesMap.keys()) {
                        if (k === lineName) { // Simplified check for now
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

        const sortedLines = Array.from(linesMap.entries()).sort((a, b) => a[1].sortIndex - b[1].sortIndex);

        const resolveWorkerName = (shift, lineKey, role, slotIndex) => {
            if (!shift) return '';
            const lineTask = shift.lineTasks.find(lt => lt.displayName === lineKey);
            if (!lineTask) return '';
            const slotsForRole = lineTask.slots.filter(s => s.roleTitle === role);
            const slot = slotsForRole[slotIndex];
            if (!slot) return '';
            if (slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') {
                const name = slot.assigned?.name?.trim();
                if (name) return name;
            }
            return 'Вакансия';
        };

        sortedLines.forEach(([lineKey, lineData]) => {
            let isFirstLineRow = true;
            
            lineData.roles.forEach((count, role) => {
                for (let i = 0; i < count; i++) {
                    const roleLabel = `${role}${count > 1 ? ` ${i + 1}` : ''}`.trim();
                    const rowData = [isFirstLineRow ? lineData.displayName : '', roleLabel];

                    scheduleDates.forEach(date => {
                        const shifts = getShiftsForDate(date);
                        const dayShift = shifts.find(s => String(s.type || '').toLowerCase().includes('день'));
                        const nightShift = shifts.find(s => String(s.type || '').toLowerCase().includes('ночь'));
                        rowData.push(resolveWorkerName(dayShift, lineKey, role, i));
                        rowData.push(resolveWorkerName(nightShift, lineKey, role, i));
                    });

                    const row = worksheet.addRow(rowData);
                    row.eachCell((cell, colNumber) => {
                        applyBorder(cell);
                        cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' };
                        if (colNumber === 1 && rowData[0]) {
                            cell.font = { bold: true };
                        }
                    });

                    scheduleDates.forEach((_, idx) => {
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

                    isFirstLineRow = false;
                }
            });
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
    }, [scheduleDates, lineTemplates, getShiftsForDate, notify]);

    const exportChessTableToExcel = useCallback(async () => {
        if (USE_CHESS_WORKER && chessTableWorkerStatus.status === 'calculating') {
            notify({ type: 'info', message: 'Идёт расчёт табеля, подождите несколько секунд.' });
            return;
        }
        const tableData = calculateChessTable();
        if (!tableData) { notify({ type: 'error', message: 'Нет данных для экспорта' }); return; }
        try { await exportWithExcelJS(tableData); } 
        catch (err) { console.warn('ExcelJS export failed, trying XLSX:', err); exportWithXLSX(tableData); }
    }, [chessTableWorkerStatus.status, calculateChessTable, notify, chessSearch, chessFilterShift]);

    return {
        chessTableWorkerStatus,
        calculateChessTable,
        exportChessTableToExcel,
        exportScheduleByLinesToExcel
    };
}

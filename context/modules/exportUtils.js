import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { isLineMatch } from '../../utils';

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
 */
export const exportScheduleByLinesToExcel = async ({
    scheduleDates,
    lineTemplates,
    getShiftsForDate,
    notify
}) => {
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

    // 2. Scan actual schedule for missing lines/roles/counts
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

    const sortedLines = Array.from(linesMap.entries()).sort((a, b) => a[1].sortIndex - b[1].sortIndex);

    const resolveWorkerName = (shift, lineKey, role, slotIndex) => {
        if (!shift) return '';
        const lineTask = shift.lineTasks.find(lt => isLineMatch(lt.displayName, lineKey) || lt.displayName === lineKey);
        if (!lineTask) return '';
        const slotsForRole = lineTask.slots.filter(s => s.roleTitle === role);
        const slot = slotsForRole[slotIndex];
        if (!slot) return '';
        if (slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned' || slot.status === 'outsourced') {
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
};


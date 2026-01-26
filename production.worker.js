import * as XLSX from 'xlsx';

// Вспомогательные функции
const isMeaningfulValue = (val) => {
    if (val === null || val === undefined) return false;
    const str = String(val).trim();
    return str !== '' && str !== '0' && str !== '-';
};

// Преобразование дробного числа (доля дня) в формат HH:MM
// Например: 0.3333333333333333 = 8:00, 0.5 = 12:00
const convertFractionalDayToTime = (fraction) => {
    if (fraction === null || fraction === undefined || isNaN(fraction)) return null;
    const num = typeof fraction === 'string' ? parseFloat(fraction) : fraction;
    if (isNaN(num) || num < 0 || num >= 1) return null;
    
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const getCellDisplayValue = (cell) => {
    if (!cell) return '';
    if (cell.v !== undefined) {
        if (typeof cell.v === 'number') {
            // Проверяем, является ли это дробным временем (доля дня от 0 до 1)
            if (cell.v >= 0 && cell.v < 1) {
                const timeStr = convertFractionalDayToTime(cell.v);
                if (timeStr) return timeStr;
            }
            return String(cell.v);
        }
        if (typeof cell.v === 'string') return cell.v.trim();
        if (cell.v instanceof Date) {
            const hours = cell.v.getHours().toString().padStart(2, '0');
            const minutes = cell.v.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    }
    if (cell.w) {
        const w = cell.w.trim();
        // Проверяем, является ли это дробным числом времени
        const num = parseFloat(w);
        if (!isNaN(num) && num >= 0 && num < 1) {
            const timeStr = convertFractionalDayToTime(num);
            if (timeStr) return timeStr;
        }
        return w;
    }
    return '';
};

const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    
    // Если это число (дробное время - доля дня)
    if (typeof timeStr === 'number') {
        if (timeStr >= 0 && timeStr < 1) {
            return Math.round(timeStr * 24 * 60);
        }
        return Math.round(timeStr);
    }
    
    const trimmed = String(timeStr).trim();
    if (!trimmed) return null;
    
    // Формат HH:MM или HH:MM:SS
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        return hours * 60 + minutes;
    }
    
    // Попытка парсинга как дробное число (доля дня)
    const num = parseFloat(trimmed);
    if (!isNaN(num)) {
        if (num >= 0 && num < 1) {
            // Это дробное время (доля дня)
            return Math.round(num * 24 * 60);
        }
        // Иначе считаем как минуты
        return Math.round(num);
    }
    
    return null;
};

// Извлечение номера линии из названия файла
// Паттерн: "Сменный отчет линия № 1 - ..." или "линия № 10 - ..."
const extractLineNumberFromFileName = (fileName) => {
    if (!fileName) return null;
    const match = String(fileName).match(/линия\s*№\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
};

// Извлечение номера линии из строки (для обратной совместимости)
const extractLineNumber = (lineStr) => {
    if (!lineStr) return null;
    const match = String(lineStr).match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
};

// Чтение диапазона строк для производства (строки 21-32 для дня, 136-147 для ночи)
// Структура: A - продукт, B - начало, C - конец, E - скорость, K - факт
const readRowRange = (sheet, startRow, endRow, shift) => {
    const rows = [];
    
    for (let row = startRow; row <= endRow; row++) {
        // Читаем конкретные столбцы
        const cellA = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 0 })]; // A - продукт
        const cellB = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 1 })]; // B - начало
        const cellC = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 2 })]; // C - конец
        const cellE = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 4 })]; // E - скорость
        const cellK = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 10 })]; // K - факт
        
        const product = getCellDisplayValue(cellA);
        const start = getCellDisplayValue(cellB);
        const end = getCellDisplayValue(cellC);
        
        // Если ячейка продукта пуста (даже если там формула) - продукта нет, пропускаем строку
        if (!isMeaningfulValue(product)) {
            continue;
        }
        
        // Скорость (из ячейки E) - читаем как число (скорость в час)
        let speed = 0;
        if (cellE) {
            if (cellE.v !== undefined && typeof cellE.v === 'number') {
                speed = cellE.v;
            } else if (cellE.w) {
                const parsed = parseFloat(cellE.w);
                if (!isNaN(parsed)) {
                    speed = parsed;
                }
            }
        }
        
        // Факт (количество) - читаем как число
        let qty = 0;
        if (cellK) {
            if (cellK.v !== undefined && typeof cellK.v === 'number') {
                qty = cellK.v;
            } else if (cellK.w) {
                const parsed = parseFloat(cellK.w);
                if (!isNaN(parsed)) {
                    qty = parsed;
                }
            }
        }
        
        // Проверяем, есть ли значимые данные в строке (продукт уже проверен выше)
        const hasData = isMeaningfulValue(start) || isMeaningfulValue(end) || qty > 0 || speed > 0;
        if (hasData) {
            rows.push({
                rowNum: row,
                product: product || '',
                start: start || '',
                end: end || '',
                speed: speed,
                qty: qty,
                shift
            });
        }
    }
    
    return rows;
};

// Чтение диапазона простоев
// Диапазоны строк: 47-113 для дня, 162-205 для ночи
// Столбцы:
//   F-G - объединенная ячейка категория простоя (вид категории простоя)
//   H - вид простоя
//   I-J - начало и конец простоя
//   L-N - объединенная ячейка описание простоя
// ВАЖНО: Все данные о конкретном простое располагаются строго в одной строке
const readDowntimeRange = (sheet, startRow, endRow, shift, lineNameFromFile = null) => {
    const downtimes = [];
    
    for (let row = startRow; row <= endRow; row++) {
        // Читаем столбцы (0-based индексы: A=0, F=5, G=6, H=7, I=8, J=9, L=11, M=12, N=13)
        const cellA = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 0 })]; // A - возможно линия
        const cellF = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 5 })]; // F
        const cellG = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 6 })]; // G
        const cellH = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 7 })]; // H - вид простоя
        const cellI = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 8 })]; // I - начало
        const cellJ = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 9 })]; // J - конец
        const cellL = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 11 })]; // L
        const cellM = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 12 })]; // M
        const cellN = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 13 })]; // N
        
        // Линия/Автомат (столбец A) - используем значение из файла, если оно есть
        const lineValueFromCell = getCellDisplayValue(cellA);
        // Приоритет: название из файла > значение из ячейки A
        const lineValue = lineNameFromFile || lineValueFromCell || '';
        
        // Категория простоя (F-G объединенная ячейка)
        // Для объединенных ячеек значение обычно находится в первой ячейке (F)
        // Если F пустая, проверяем G
        const categoryF = getCellDisplayValue(cellF);
        const categoryG = getCellDisplayValue(cellG);
        // Объединяем значения, убирая лишние пробелы
        const category = (categoryF || categoryG || '').trim();
        
        // Вид простоя (H) - это ключевое поле для идентификации простоя
        const type = getCellDisplayValue(cellH);
        
        // Начало и конец простоя (I-J)
        // Читаем как дробное число (доля дня) и преобразуем в HH:MM
        let start = '';
        let end = '';
        
        if (cellI) {
            if (cellI.v !== undefined && typeof cellI.v === 'number') {
                start = convertFractionalDayToTime(cellI.v) || getCellDisplayValue(cellI);
            } else {
                start = getCellDisplayValue(cellI);
            }
        }
        
        if (cellJ) {
            if (cellJ.v !== undefined && typeof cellJ.v === 'number') {
                end = convertFractionalDayToTime(cellJ.v) || getCellDisplayValue(cellJ);
            } else {
                end = getCellDisplayValue(cellJ);
            }
        }
        
        // Описание простоя (L-N объединенная ячейка)
        // Для объединенных ячеек значение может быть в любой из ячеек L, M, N
        // Объединяем все непустые значения
        const descL = getCellDisplayValue(cellL);
        const descM = getCellDisplayValue(cellM);
        const descN = getCellDisplayValue(cellN);
        // Объединяем все непустые части описания
        const descriptionParts = [descL, descM, descN].filter(part => part && part.trim());
        const description = descriptionParts.join(' ').trim();
        
        // ВАЖНО: Все данные о простое должны быть строго в одной строке
        // Создаем запись простоя только если есть хотя бы вид простоя (H) или время (I-J)
        // Описание (L-N) может быть пустым, но если оно есть, оно принадлежит именно этой строке
        if (isMeaningfulValue(type) || (isMeaningfulValue(start) && isMeaningfulValue(end))) {
            const startMinutes = parseTimeToMinutes(start);
            const endMinutes = parseTimeToMinutes(end);
            let durationMinutes = null;
            
            if (startMinutes !== null && endMinutes !== null) {
                if (endMinutes >= startMinutes) {
                    durationMinutes = endMinutes - startMinutes;
                } else {
                    // Переход через полночь
                    durationMinutes = (24 * 60) - startMinutes + endMinutes;
                }
            }
            
            // Создаем запись простоя со ВСЕМИ данными из этой строки
            // Описание берется строго из этой строки, не из предыдущих
            downtimes.push({
                rowNum: row,
                line: lineValue, // Линия из названия файла или из столбца A
                category: category || 'Без категории',
                type: type || '',
                start: start || '',
                end: end || '',
                description: description || '', // Описание строго из этой строки
                durationMinutes: durationMinutes !== null ? Math.round(durationMinutes) : null,
                shift
            });
        }
    }
    
    return downtimes;
};

// Расчет доступного времени (общее время минус простои из excludedDowntimeTypes)
// Логика: если из 720 минут 120 - это плановые простои, и они отмечены как не влияющие на план,
// то доступное время = 720 - 120 = 600 минут
const calculateAvailableMinutes = (totalMinutes, downtimes, excludedDowntimeTypes) => {
    if (!totalMinutes || totalMinutes <= 0) return 0;
    
    // Суммируем время простоев из excludedDowntimeTypes (они не влияют на план)
    let excludedDowntimeMinutes = 0;
    if (excludedDowntimeTypes && Array.isArray(excludedDowntimeTypes)) {
        downtimes.forEach(downtime => {
            if (excludedDowntimeTypes.includes(downtime.type)) {
                excludedDowntimeMinutes += (downtime.durationMinutes || 0);
            }
        });
    }
    
    // Доступное время = общее время - простои из excludedDowntimeTypes
    return Math.max(0, Math.round(totalMinutes - excludedDowntimeMinutes));
};

// Расчет времени простоев (сумма всех простоев, кроме excludedDowntimeTypes)
// Это простои, которые влияют на план
const calculateDowntimeMinutes = (downtimes, excludedDowntimeTypes) => {
    if (!downtimes || downtimes.length === 0) return 0;
    
    let totalDowntime = 0;
    const excludedSet = excludedDowntimeTypes && Array.isArray(excludedDowntimeTypes) 
        ? new Set(excludedDowntimeTypes) 
        : new Set();
    
    downtimes.forEach(downtime => {
        // Учитываем только простои, которые НЕ исключены (т.е. влияют на план)
        if (!excludedSet.has(downtime.type)) {
            totalDowntime += (downtime.durationMinutes || 0);
        }
    });
    
    return Math.round(totalDowntime);
};

// Расчет плана на основе доступного времени
const calculatePlan = (availableMinutes, productionRate) => {
    if (!availableMinutes || availableMinutes <= 0 || !productionRate || productionRate <= 0) {
        return 0;
    }
    // План = доступное время / время на единицу продукции
    return Math.round(availableMinutes / productionRate);
};

// Проверка пересечения временных интервалов
// Возвращает true, если интервалы пересекаются
const timeIntervalsOverlap = (start1, end1, start2, end2) => {
    if (!start1 || !end1 || !start2 || !end2) return false;
    
    const start1Minutes = parseTimeToMinutes(start1);
    const end1Minutes = parseTimeToMinutes(end1);
    const start2Minutes = parseTimeToMinutes(start2);
    const end2Minutes = parseTimeToMinutes(end2);
    
    if (start1Minutes === null || end1Minutes === null || start2Minutes === null || end2Minutes === null) {
        return false;
    }
    
    // Проверяем пересечение: начало первого интервала < конец второго И конец первого интервала > начало второго
    return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
};

// Парсинг рабочей книги Excel
const parseWorkbook = (workbook, fileName) => {
    const results = [];
    
    // Извлекаем номер линии из названия файла
    const lineNumberFromFile = extractLineNumberFromFileName(fileName);
    const lineNameFromFile = lineNumberFromFile ? `Линия № ${lineNumberFromFile}` : null;
    
    // Обрабатываем только листы с именами 1-31
    const validSheetNames = workbook.SheetNames.filter(name => {
        const sheetNum = parseInt(name, 10);
        return !isNaN(sheetNum) && sheetNum >= 1 && sheetNum <= 31;
    });
    
    validSheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return;
        
        // Извлекаем дату из имени листа или из ячейки
        const date = sheetName; // Используем имя листа как дату
        
        // Читаем продукты для дня (строки 21-32)
        const dayRows = readRowRange(sheet, 21, 32, 'День');
        // Читаем простои для дня (строки 47-113)
        const dayDowntimes = readDowntimeRange(sheet, 47, 113, 'День', lineNameFromFile);
        
        // Читаем продукты для ночи (строки 136-147)
        const nightRows = readRowRange(sheet, 136, 147, 'Ночь');
        // Читаем простои для ночи (строки 162-205)
        const nightDowntimes = readDowntimeRange(sheet, 162, 205, 'Ночь', lineNameFromFile);
        
        // Объединяем данные дня и ночи
        const allRows = [...dayRows, ...nightRows];
        const allDowntimes = [...dayDowntimes, ...nightDowntimes];
        
        if (allRows.length > 0 || allDowntimes.length > 0) {
            results.push({
                date,
                fileName,
                sheetName,
                lineNumber: lineNumberFromFile,
                lineName: lineNameFromFile,
                rows: allRows,
                downtimes: allDowntimes
            });
        }
    });
    
    return results;
};

// Парсинг файлов
const parseFiles = (files) => {
    const allResults = [];
    
    if (!files || !Array.isArray(files) || files.length === 0) {
        throw new Error('Нет файлов для обработки');
    }
    
    console.log(`[Worker] Начало обработки ${files.length} файлов`);
    
    for (let i = 0; i < files.length; i++) {
        const fileData = files[i];
        const fileName = fileData?.fileName || `file_${i + 1}`;
        
        try {
            console.log(`[Worker] Обработка файла ${i + 1}/${files.length}: ${fileName}`);
            
            // Проверяем наличие данных
            if (!fileData || !fileData.data) {
                throw new Error(`Файл ${fileName} не содержит данных`);
            }
            
            // Преобразуем данные в Uint8Array
            let dataArray;
            if (fileData.data instanceof ArrayBuffer) {
                console.log(`[Worker] Файл ${fileName}: ArrayBuffer, размер ${fileData.data.byteLength} байт`);
                dataArray = new Uint8Array(fileData.data);
            } else if (fileData.data instanceof Uint8Array) {
                console.log(`[Worker] Файл ${fileName}: Uint8Array, размер ${fileData.data.length} байт`);
                dataArray = fileData.data;
            } else {
                console.error(`[Worker] Файл ${fileName}: неподдерживаемый тип данных`, typeof fileData.data, fileData.data);
                throw new Error(`Неподдерживаемый тип данных для файла ${fileName}`);
            }
            
            if (!dataArray || dataArray.length === 0) {
                throw new Error(`Файл ${fileName} пуст`);
            }
            
            // Парсим Excel файл
            console.log(`[Worker] Парсинг Excel файла ${fileName}...`);
            const workbook = XLSX.read(dataArray, { 
                type: 'array', 
                cellDates: false, 
                cellNF: true,
                sheetStubs: true
            });
            
            if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                console.warn(`[Worker] Файл ${fileName} не содержит листов`);
                continue;
            }
            
            console.log(`[Worker] Файл ${fileName} содержит ${workbook.SheetNames.length} листов:`, workbook.SheetNames);
            
            const results = parseWorkbook(workbook, fileName);
            console.log(`[Worker] Файл ${fileName}: извлечено ${results.length} результатов`);
            allResults.push(...results);
        } catch (err) {
            console.error(`[Worker] Ошибка парсинга файла ${fileName}:`, err);
            throw new Error(`Ошибка парсинга файла ${fileName}: ${err.message}`);
        }
    }
    
    console.log(`[Worker] Обработка завершена, всего результатов: ${allResults.length}`);
    return allResults;
};

// Расчет flatRows с учетом excludedDowntimeTypes
const calculateFlatRows = (results, excludedDowntimeTypes = []) => {
    const flatRows = [];
    
    results.forEach(result => {
        // Группируем простои по смене и линии для расчета доступного времени
        const dayDowntimes = result.downtimes.filter(d => d.shift === 'День');
        const nightDowntimes = result.downtimes.filter(d => d.shift === 'Ночь');
        
        // Общее время смены (12 часов = 720 минут)
        const totalShiftMinutes = 12 * 60; // 720 минут
        
        // Используем номер линии из названия файла, если он есть
        const lineFromFile = result.lineName || '';
        
        // Рассчитываем доступное время для смены: 720 минут - исключаемые простои (плановые)
        const excludedSet = excludedDowntimeTypes && Array.isArray(excludedDowntimeTypes) 
            ? new Set(excludedDowntimeTypes) 
            : new Set();
        
        // Суммируем все исключаемые простои для дня
        let excludedDayDowntimeMinutes = 0;
        dayDowntimes.forEach(d => {
            if (excludedSet.has(d.type) && d.durationMinutes !== null) {
                excludedDayDowntimeMinutes += d.durationMinutes;
            }
        });
        
        // Суммируем все исключаемые простои для ночи
        let excludedNightDowntimeMinutes = 0;
        nightDowntimes.forEach(d => {
            if (excludedSet.has(d.type) && d.durationMinutes !== null) {
                excludedNightDowntimeMinutes += d.durationMinutes;
            }
        });
        
        // Доступное время для дня = 720 - исключаемые простои
        const availableDayMinutes = Math.max(0, totalShiftMinutes - excludedDayDowntimeMinutes);
        // Доступное время для ночи = 720 - исключаемые простои
        const availableNightMinutes = Math.max(0, totalShiftMinutes - excludedNightDowntimeMinutes);
        
        result.rows.forEach(rowData => {
            // Используем линию из названия файла
            const line = lineFromFile || 'Не указано';
            
            // Данные уже извлечены в readRowRange
            const product = rowData.product || '';
            const start = rowData.start || '';
            const end = rowData.end || '';
            const speed = rowData.speed || 0;
            const qty = rowData.qty || 0;
            
            // Рассчитываем длительность производства продукта в минутах
            const startMinutes = parseTimeToMinutes(start);
            const endMinutes = parseTimeToMinutes(end);
            let productDurationMinutes = 0;
            if (startMinutes !== null && endMinutes !== null) {
                if (endMinutes >= startMinutes) {
                    productDurationMinutes = endMinutes - startMinutes;
                } else {
                    // Переход через полночь
                    productDurationMinutes = (24 * 60) - startMinutes + endMinutes;
                }
            }
            
            // Находим простои для этой линии и смены
            const shiftDowntimes = rowData.shift === 'День' ? dayDowntimes : nightDowntimes;
            // Фильтруем простои: если линия указана, используем её, иначе берем все простои без указания линии
            const lineDowntimes = shiftDowntimes.filter(d => {
                if (!line) return !d.line || d.line === '';
                return !d.line || d.line === line || d.line === '';
            });
            
            // Находим простои, которые пересекаются по времени с этим продуктом
            const relatedDowntimes = lineDowntimes.filter(d => {
                if (!start || !end || !d.start || !d.end) return false;
                return timeIntervalsOverlap(start, end, d.start, d.end);
            });
            
            // Рассчитываем время простоев, которые пересекаются с продуктом и НЕ являются исключаемыми
            // Нужно учитывать только ту часть простоя, которая попадает в интервал продукта
            let relatedDowntimeMinutes = 0;
            
            relatedDowntimes.forEach(d => {
                // Учитываем только простои, которые НЕ исключены (не плановые)
                if (!excludedSet.has(d.type)) {
                    const downtimeStartMinutes = parseTimeToMinutes(d.start);
                    const downtimeEndMinutes = parseTimeToMinutes(d.end);
                    
                    if (downtimeStartMinutes !== null && downtimeEndMinutes !== null && 
                        startMinutes !== null && endMinutes !== null) {
                        // Находим пересечение интервалов
                        const overlapStart = Math.max(startMinutes, downtimeStartMinutes);
                        const overlapEnd = Math.min(endMinutes, downtimeEndMinutes);
                        
                        if (overlapEnd > overlapStart) {
                            relatedDowntimeMinutes += (overlapEnd - overlapStart);
                        }
                    } else if (d.durationMinutes !== null) {
                        // Если не можем точно рассчитать пересечение, используем полную длительность
                        relatedDowntimeMinutes += d.durationMinutes;
                    }
                }
            });
            
            // Доступное время для продукта = min(длительность продукта, доступное время смены)
            const shiftAvailableMinutes = rowData.shift === 'День' ? availableDayMinutes : availableNightMinutes;
            const availableMinutes = Math.max(0, Math.min(productDurationMinutes, shiftAvailableMinutes));
            
            // Время простоев для этого продукта (только те, которые пересекаются и НЕ исключены)
            const downtimeMinutes = Math.round(relatedDowntimeMinutes);
            
            // План = (доступное время в часах) * скорость (скорость указана в час)
            // Доступное время в минутах, переводим в часы: availableMinutes / 60
            let plan = 0;
            if (availableMinutes > 0 && speed > 0) {
                const availableHours = availableMinutes / 60;
                plan = Math.round(availableHours * speed);
            }
            
            if (line || product || qty > 0) {
                flatRows.push({
                    date: result.date,
                    fileName: result.fileName,
                    line: line || 'Не указано',
                    product: product || 'Не указано',
                    qty: Math.round(qty),
                    plan: Math.round(plan),
                    availableMinutes: Math.round(availableMinutes),
                    downtimeMinutes: Math.round(downtimeMinutes),
                    speed: speed,
                    relatedDowntimes: relatedDowntimes.map(d => ({
                        type: d.type || '',
                        category: d.category || '',
                        start: d.start || '',
                        end: d.end || '',
                        durationMinutes: d.durationMinutes,
                        description: d.description || ''
                    })),
                    shift: rowData.shift,
                    start: start || '',
                    end: end || ''
                });
            }
        });
    });
    
    return flatRows;
};

// Расчет flatDowntimeRows
const calculateFlatDowntimeRows = (results) => {
    const flatDowntimeRows = [];
    
    results.forEach(result => {
        result.downtimes.forEach(downtime => {
            // Линия уже считана из столбца A при чтении простоев
            const line = downtime.line || '';
            
            // Находим продукты, которые пересекаются по времени с этим простоем
            const relatedProducts = result.rows.filter(row => {
                if (!row.start || !row.end || !downtime.start || !downtime.end) return false;
                if (row.shift !== downtime.shift) return false;
                return timeIntervalsOverlap(row.start, row.end, downtime.start, downtime.end);
            }).map(row => row.product || '').filter(p => p);
            
            // Добавляем только если есть хотя бы один значимый параметр
            if (downtime.type || downtime.start || downtime.end || downtime.description) {
                flatDowntimeRows.push({
                    date: result.date,
                    fileName: result.fileName,
                    line: line,
                    category: downtime.category || 'Без категории',
                    type: downtime.type || '',
                    description: downtime.description || '',
                    start: downtime.start || '',
                    end: downtime.end || '',
                    durationMinutes: downtime.durationMinutes !== null ? Math.round(downtime.durationMinutes) : null,
                    shift: downtime.shift,
                    relatedProducts: relatedProducts
                });
            }
        });
    });
    
    return flatDowntimeRows;
};

// Обработчик сообщений
self.onmessage = (e) => {
    const { type, requestId, payload } = e.data || {};
    
    console.log(`[Worker] Получено сообщение: type=${type}, requestId=${requestId}`);
    
    // Валидация входящих данных
    if (!type) {
        console.error('[Worker] Отсутствует тип сообщения');
        self.postMessage({ 
            type: 'error', 
            requestId, 
            error: 'Отсутствует тип сообщения' 
        });
        return;
    }
    
    if (!payload) {
        console.error('[Worker] Отсутствуют данные в сообщении');
        self.postMessage({ 
            type: 'error', 
            requestId, 
            error: 'Отсутствуют данные в сообщении' 
        });
        return;
    }
    
    try {
        if (type === 'parseFiles') {
            console.log(`[Worker] Начало парсинга файлов, количество: ${payload.files?.length || 0}`);
            
            if (!payload.files || !Array.isArray(payload.files)) {
                throw new Error('Некорректные данные файлов');
            }
            
            if (payload.files.length === 0) {
                throw new Error('Нет файлов для обработки');
            }
            
            const startTime = performance.now();
            const results = parseFiles(payload.files);
            const endTime = performance.now();
            
            console.log(`[Worker] Парсинг завершен за ${(endTime - startTime).toFixed(2)}ms, результатов: ${results.length}`);
            
            self.postMessage({ 
                type: 'parseFiles', 
                requestId, 
                results 
            });
        } else if (type === 'calculateFlatRows') {
            console.log(`[Worker] Начало расчета flatRows, результатов: ${payload.results?.length || 0}`);
            
            if (!payload.results || !Array.isArray(payload.results)) {
                throw new Error('Некорректные данные результатов');
            }
            
            const startTime = performance.now();
            const flatRows = calculateFlatRows(payload.results, payload.excludedDowntimeTypes || []);
            const flatDowntimeRows = calculateFlatDowntimeRows(payload.results);
            const endTime = performance.now();
            
            console.log(`[Worker] Расчет завершен за ${(endTime - startTime).toFixed(2)}ms, flatRows: ${flatRows.length}, flatDowntimeRows: ${flatDowntimeRows.length}`);
            
            self.postMessage({ 
                type: 'calculateFlatRows', 
                requestId, 
                flatRows, 
                flatDowntimeRows 
            });
        } else {
            throw new Error(`Unknown message type: ${type}`);
        }
    } catch (err) {
        // Отправляем ошибку в формате, который ожидает ProductionView
        const errorMessage = err?.message || String(err) || 'Неизвестная ошибка';
        console.error('[Worker] Ошибка:', errorMessage, err);
        self.postMessage({ 
            type: type || 'error', 
            requestId, 
            error: errorMessage 
        });
    }
};

// Обработчик ошибок воркера
self.onerror = (err) => {
    console.error('Worker global error:', err);
    self.postMessage({ 
        type: 'error', 
        error: `Критическая ошибка воркера: ${err.message || String(err)}` 
    });
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Factory, FileUp, Loader2, Search, Filter, X } from 'lucide-react';
import * as XLSX from 'xlsx';

const ProductionView = () => {
    const STORAGE_KEY = 'productionParsedResults';
    const fileInputRef = useRef(null);
    const [results, setResults] = useState([]);
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState('');
    const [filterLine, setFilterLine] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterProduct, setFilterProduct] = useState('');

    const isMeaningfulValue = (value) => {
        if (value === undefined || value === null) return false;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') return value.trim() !== '' && value.trim() !== '0';
        return true;
    };

    const getCellDisplayValue = (cell) => {
        if (!cell || cell.t === 'e') return '';
        if (cell.w !== undefined && cell.w !== null && String(cell.w).trim() !== '') {
            return String(cell.w).trim();
        }
        if (cell.v === undefined || cell.v === null) return '';
        return String(cell.v).trim();
    };

    const extractLineNumber = (fileName) => {
        const match = fileName.match(/линия № (\d+)/i);
        if (match && match[1]) {
            return `Линия ${match[1]}`;
        }
        return 'Без линии';
    };

    const flatRows = useMemo(() => {
        const rows = [];
        results.forEach((result) => {
            result.dayItems.forEach((item) => {
                rows.push({
                    date: result.date,
                    fileName: result.fileName,
                    line: item.line || 'Без линии',
                    product: item.name,
                    start: item.start,
                    end: item.end,
                    qty: item.qty,
                    speed: item.speed,
                    plan: item.plan,
                    shift: 'День'
                });
            });
            result.nightItems.forEach((item) => {
                rows.push({
                    date: result.date,
                    fileName: result.fileName,
                    line: item.line || 'Без линии',
                    product: item.name,
                    start: item.start,
                    end: item.end,
                    qty: item.qty,
                    speed: item.speed,
                    plan: item.plan,
                    shift: 'Ночь'
                });
            });
        });
        return rows;
    }, [results]);

    const uniqueLines = useMemo(() => {
        const lines = new Set(flatRows.map(r => r.line));
        return Array.from(lines).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
            if (numA !== numB) return numA - numB;
            return a.localeCompare(b);
        });
    }, [flatRows]);

    const uniqueDates = useMemo(() => {
        const dates = new Set(flatRows.map(r => r.date));
        return Array.from(dates).sort();
    }, [flatRows]);

    const filteredRows = useMemo(() => {
        return flatRows.filter(row => {
            if (filterLine && row.line !== filterLine) return false;
            if (filterDate && row.date !== filterDate) return false;
            if (filterProduct && !row.product.toLowerCase().includes(filterProduct.toLowerCase())) return false;
            return true;
        });
    }, [flatRows, filterLine, filterDate, filterProduct]);

    const parseTimeToMinutes = (timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') return null;
        const trimmed = timeStr.trim();
        if (!trimmed) return null;
        
        // Пробуем разные форматы времени: "HH:MM", "H:MM", "HH:MM:SS"
        const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            return hours * 60 + minutes;
        }
        
        // Если это число (Excel время как дробь дня)
        const num = parseFloat(trimmed);
        if (!isNaN(num) && num >= 0 && num < 1) {
            const totalMinutes = Math.round(num * 24 * 60);
            return totalMinutes;
        }
        
        return null;
    };

    const calculateAvailableMinutes = (startStr, endStr) => {
        const startMinutes = parseTimeToMinutes(startStr);
        const endMinutes = parseTimeToMinutes(endStr);
        
        if (startMinutes === null || endMinutes === null) return null;
        if (endMinutes < startMinutes) {
            // Если время конца меньше времени начала, возможно переход через полночь
            return (24 * 60 - startMinutes) + endMinutes;
        }
        return endMinutes - startMinutes;
    };

    const calculatePlan = (availableMinutes, speed) => {
        if (availableMinutes === null || speed === null || speed === undefined) return null;
        if (availableMinutes <= 0 || speed <= 0) return null;
        // План = (доступное время в минутах / 60) * скорость (штук/час)
        return (availableMinutes / 60) * speed;
    };

    const readRowRange = (sheet, nameColIndex, qtyColIndex, startRow, endRow, lineNumber) => {
        const items = [];
        for (let r = startRow; r <= endRow; r++) {
            const nameAddress = XLSX.utils.encode_cell({ r: r - 1, c: nameColIndex });
            const startAddress = XLSX.utils.encode_cell({ r: r - 1, c: 1 });
            const endAddress = XLSX.utils.encode_cell({ r: r - 1, c: 2 });
            const qtyAddress = XLSX.utils.encode_cell({ r: r - 1, c: qtyColIndex });
            const speedAddress = XLSX.utils.encode_cell({ r: r - 1, c: 4 }); // Столбец E (индекс 4)
            const nameCell = sheet[nameAddress];
            const startCell = sheet[startAddress];
            const endCell = sheet[endAddress];
            const qtyCell = sheet[qtyAddress];
            const speedCell = sheet[speedAddress];
            if (!nameCell || nameCell.t === 'e') continue;
            const nameValue = nameCell?.v;
            const qtyValue = qtyCell?.v;
            if (isMeaningfulValue(nameValue) && isMeaningfulValue(qtyValue)) {
                const startValue = getCellDisplayValue(startCell);
                const endValue = getCellDisplayValue(endCell);
                const speedValue = speedCell?.v;
                const speed = isMeaningfulValue(speedValue) ? (typeof speedValue === 'number' ? speedValue : parseFloat(speedValue)) : null;
                const availableMinutes = calculateAvailableMinutes(startValue, endValue);
                const plan = calculatePlan(availableMinutes, speed);
                
                items.push({
                    name: String(nameValue).trim(),
                    qty: qtyValue,
                    start: isMeaningfulValue(startValue) ? startValue : '',
                    end: isMeaningfulValue(endValue) ? endValue : '',
                    speed: speed,
                    plan: plan,
                    line: lineNumber
                });
            }
        }
        return items;
    };

    const parseWorkbook = (workbook, fileName) => {
        const parsed = [];
        const lineNumber = extractLineNumber(fileName);
        workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) return;

            const dayItems = readRowRange(sheet, 0, 10, 21, 32, lineNumber);
            const nightItems = readRowRange(sheet, 0, 10, 136, 147, lineNumber);

            if (dayItems.length === 0 && nightItems.length === 0) return;

            parsed.push({
                fileName,
                date: sheetName,
                dayCount: dayItems.length,
                nightCount: nightItems.length,
                dayItems,
                nightItems
            });
        });
        return parsed;
    };

    const handleFileChange = async (event) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        setIsParsing(true);
        setParseError('');
        setResults([]);

        try {
            const allResults = [];
            for (const file of files) {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellNF: true });
                allResults.push(...parseWorkbook(workbook, file.name));
            }
            setResults(allResults);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allResults));
        } catch (err) {
            setParseError(err?.message || 'Ошибка чтения Excel файла');
        } finally {
            setIsParsing(false);
            event.target.value = '';
        }
    };

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) setResults(parsed);
        } catch (err) {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                            <Factory size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Производство</h2>
                            <div className="text-xs text-slate-500">
                                Записей: {filteredRows.length} {filteredRows.length !== flatRows.length && `из ${flatRows.length}`}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                    >
                        <FileUp size={16} />
                        Загрузить Excel
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xls,.xlsx"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </div>
                <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск по продукту..."
                            value={filterProduct}
                            onChange={(e) => setFilterProduct(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {filterProduct && (
                            <button
                                onClick={() => setFilterProduct('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <div className="relative">
                        <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                            value={filterLine}
                            onChange={(e) => setFilterLine(e.target.value)}
                            className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
                        >
                            <option value="">Все линии</option>
                            {uniqueLines.map(line => (
                                <option key={line} value={line}>{line}</option>
                            ))}
                        </select>
                    </div>
                    <div className="relative">
                        <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
                        >
                            <option value="">Все даты</option>
                            {uniqueDates.map(date => (
                                <option key={date} value={date}>{date}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            {isParsing && (
                <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                        <Loader2 size={20} className="animate-spin" />
                        Чтение файла…
                    </div>
                </div>
            )}
            {parseError && (
                <div className="mx-6 mt-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
                    {parseError}
                </div>
            )}
            {results.length > 0 && !isParsing && (
                <div className="flex-1 overflow-hidden p-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 border-b">Дата</th>
                                        <th className="px-4 py-3 border-b">Файл</th>
                                        <th className="px-4 py-3 border-b">Линия</th>
                                        <th className="px-4 py-3 border-b">Продукт</th>
                                        <th className="px-4 py-3 border-b">Время начала</th>
                                        <th className="px-4 py-3 border-b">Время конца</th>
                                        <th className="px-4 py-3 border-b text-center">Количество</th>
                                        <th className="px-4 py-3 border-b text-center">План</th>
                                        <th className="px-4 py-3 border-b text-center">Смена</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                                                Нет данных для отображения
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRows.map((row, idx) => (
                                            <tr key={`${row.date}_${row.shift}_${idx}`} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 text-slate-700 font-medium">{row.date}</td>
                                                <td className="px-4 py-3 text-slate-500 text-xs">{row.fileName}</td>
                                                <td className="px-4 py-3 text-slate-700">{row.line}</td>
                                                <td className="px-4 py-3 text-slate-800 font-medium">{row.product}</td>
                                                <td className="px-4 py-3 text-slate-600">{row.start || '—'}</td>
                                                <td className="px-4 py-3 text-slate-600">{row.end || '—'}</td>
                                                <td className="px-4 py-3 text-center text-slate-700 font-semibold">{row.qty}</td>
                                                <td className="px-4 py-3 text-center text-slate-700">
                                                    {row.plan !== null && row.plan !== undefined 
                                                        ? <span className="font-semibold">{Math.round(row.plan * 100) / 100}</span>
                                                        : <span className="text-slate-400">—</span>
                                                    }
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                        row.shift === 'День' 
                                                            ? 'bg-yellow-100 text-yellow-700' 
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {row.shift}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            {results.length === 0 && !isParsing && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-slate-500">
                        <Factory size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Нет данных</p>
                        <p className="text-sm mt-2">Загрузите Excel файл для просмотра данных</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(ProductionView);

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Factory, FileUp, Loader2, Search, Filter, X, ChevronDown, Check, BarChart3, TrendingUp, ChevronRight } from 'lucide-react';

// Функция для получения цвета категории простоев
const getCategoryColor = (category) => {
    const colors = [
        'bg-red-400', 'bg-pink-400', 'bg-purple-400', 'bg-indigo-400',
        'bg-blue-400', 'bg-cyan-400', 'bg-teal-400', 'bg-yellow-400',
        'bg-amber-400', 'bg-orange-400', 'bg-gray-400', 'bg-slate-400'
    ];
    // Простой хэш для стабильного цвета
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

const ProductionView = () => {
    const STORAGE_KEY = 'productionParsedResults';
    const fileInputRef = useRef(null);
    const [results, setResults] = useState([]);
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState('');
    const [filterLine, setFilterLine] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [activeTab, setActiveTab] = useState('production');
    const [excludedDowntimeTypes, setExcludedDowntimeTypes] = useState(() => {
        const stored = localStorage.getItem('productionExcludedDowntimeTypes');
        return stored ? new Set(JSON.parse(stored)) : new Set();
    });
    const [isDowntimeSelectorOpen, setIsDowntimeSelectorOpen] = useState(false);
    const downtimeSelectorRef = useRef(null);
    
    // Worker state
    const productionWorkerRef = useRef(null);
    const productionWorkerReqIdRef = useRef(0);
    const [flatRows, setFlatRows] = useState([]);
    const [flatDowntimeRows, setFlatDowntimeRows] = useState([]);
    
    // Состояние для раскрытых графиков
    const [expandedCharts, setExpandedCharts] = useState({
        byDate: new Set(),
        byLine: new Set(),
        byProduct: new Set()
    });


    const uniqueLines = useMemo(() => {
        const lines = new Set([
            ...flatRows.map(r => r.line),
            ...flatDowntimeRows.map(r => r.line)
        ]);
        return Array.from(lines).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
            if (numA !== numB) return numA - numB;
            return a.localeCompare(b);
        });
    }, [flatRows, flatDowntimeRows]);

    const uniqueDowntimeTypes = useMemo(() => {
        const types = new Set();
        flatDowntimeRows.forEach(row => {
            // Собираем только уникальные виды простоев (type), без категории
            if (row.type && row.type.trim()) {
                types.add(row.type.trim());
            }
        });
        return Array.from(types).sort();
    }, [flatDowntimeRows]);

    const uniqueDates = useMemo(() => {
        const dates = new Set();
        results.forEach((result) => {
            if (result?.date && result.date.trim() !== '') {
                dates.add(result.date);
            }
        });
        return Array.from(dates).sort();
    }, [results]);

    const filteredRows = useMemo(() => {
        return flatRows.filter(row => {
            if (filterLine && row.line !== filterLine) return false;
            if (filterDate && row.date !== filterDate) return false;
            if (filterProduct && !row.product.toLowerCase().includes(filterProduct.toLowerCase())) return false;
            return true;
        });
    }, [flatRows, filterLine, filterDate, filterProduct]);

    const filteredDowntimeRows = useMemo(() => {
        return flatDowntimeRows.filter(row => {
            if (filterLine && row.line !== filterLine) return false;
            if (filterDate && row.date !== filterDate) return false;
            if (filterProduct) {
                const search = filterProduct.toLowerCase();
                const match = [
                    row.category,
                    row.type,
                    row.description
                ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
                if (!match) return false;
            }
            return true;
        });
    }, [flatDowntimeRows, filterLine, filterDate, filterProduct]);

    // Данные для графиков
    const chartData = useMemo(() => {
        const byDate = new Map();
        const byLine = new Map();
        const byProduct = new Map();

        filteredRows.forEach(row => {
            // План уже должен быть пересчитан с учетом excludedDowntimeTypes в worker
            // Но для графиков используем план напрямую из row, так как он уже учитывает исключения
            const plan = row.plan || 0;
            const fact = typeof row.qty === 'number' ? row.qty : 0;
            const efficiency = plan > 0 ? (fact / plan) * 100 : 0;

            // По датам
            if (!byDate.has(row.date)) {
                byDate.set(row.date, { plan: 0, fact: 0, count: 0, downtimeByCategory: new Map() });
            }
            const dateData = byDate.get(row.date);
            dateData.plan += plan;
            dateData.fact += fact;
            dateData.count += 1;

            // По линиям
            if (!byLine.has(row.line)) {
                byLine.set(row.line, { plan: 0, fact: 0, count: 0, downtimeByCategory: new Map() });
            }
            const lineData = byLine.get(row.line);
            lineData.plan += plan;
            lineData.fact += fact;
            lineData.count += 1;

            // По продуктам
            if (!byProduct.has(row.product)) {
                byProduct.set(row.product, { plan: 0, fact: 0, count: 0, downtimeByCategory: new Map() });
            }
            const productData = byProduct.get(row.product);
            productData.plan += plan;
            productData.fact += fact;
            productData.count += 1;
        });

            // Добавляем простои по категориям
            // Исключаем простои из excludedDowntimeTypes из отображения в графиках
            filteredDowntimeRows
                .filter(downtime => {
                    // Показываем только простои, которые НЕ исключены
                    const downtimeType = String(downtime.type || '').trim();
                    return !excludedDowntimeTypes.has(downtimeType);
                })
                .forEach(downtime => {
                    const duration = downtime.durationMinutes || 0;
                    const category = downtime.category || 'Без категории';
                    const description = downtime.description || '';

                    // Находим соответствующие production rows для привязки к продуктам
                    const matchingRows = filteredRows.filter(r => 
                        r.date === downtime.date && 
                        r.line === downtime.line && 
                        r.shift === downtime.shift
                    );

                    // По датам
                    const dateData = byDate.get(downtime.date);
                    if (dateData) {
                        if (!dateData.downtimeByCategory.has(category)) {
                            dateData.downtimeByCategory.set(category, { minutes: 0, descriptions: [] });
                        }
                        const catData = dateData.downtimeByCategory.get(category);
                        catData.minutes += duration;
                        if (description && !catData.descriptions.includes(description)) {
                            catData.descriptions.push(description);
                        }
                    }

                    // По линиям
                    const lineData = byLine.get(downtime.line);
                    if (lineData) {
                        if (!lineData.downtimeByCategory.has(category)) {
                            lineData.downtimeByCategory.set(category, { minutes: 0, descriptions: [] });
                        }
                        const catData = lineData.downtimeByCategory.get(category);
                        catData.minutes += duration;
                        if (description && !catData.descriptions.includes(description)) {
                            catData.descriptions.push(description);
                        }
                    }

                    // По продуктам - используем продукт из соответствующей строки
                    matchingRows.forEach(row => {
                        const productData = byProduct.get(row.product);
                        if (productData) {
                            if (!productData.downtimeByCategory.has(category)) {
                                productData.downtimeByCategory.set(category, { minutes: 0, descriptions: [] });
                            }
                            const catData = productData.downtimeByCategory.get(category);
                            catData.minutes += duration;
                            if (description && !catData.descriptions.includes(description)) {
                                catData.descriptions.push(description);
                            }
                        }
                    });
                });

        // Функция для преобразования данных с простоями
        const processData = (keyValue, data, key) => {
            const efficiency = data.plan > 0 ? Math.round((data.fact / data.plan) * 100) : 0;
            const downtimeCategoriesRaw = Array.from(data.downtimeByCategory.entries())
                .map(([category, catData]) => ({
                    category,
                    minutes: Math.round(catData.minutes || 0),
                    descriptions: catData.descriptions || []
                }))
                .filter(d => d.minutes > 0);

            const totalDowntimeMinutes = downtimeCategoriesRaw.reduce((sum, d) => sum + d.minutes, 0);
            const downtimeCategories = downtimeCategoriesRaw
                .map(d => ({
                    ...d,
                    percent: totalDowntimeMinutes > 0 
                        ? Math.round((d.minutes / totalDowntimeMinutes) * 10000) / 100
                        : 0
                }))
                .sort((a, b) => b.percent - a.percent);

            // Ограничиваем сумму простоев, чтобы не превышать 100% - efficiency
            const totalDowntimePercent = downtimeCategories.reduce((sum, d) => sum + d.percent, 0);
            const maxDowntimePercent = Math.max(0, 100 - efficiency);
            const scale = totalDowntimePercent > maxDowntimePercent && totalDowntimePercent > 0 
                ? maxDowntimePercent / totalDowntimePercent 
                : 1;

            return {
                [key]: keyValue,
                plan: Math.round(data.plan),
                fact: Math.round(data.fact),
                efficiency,
                count: data.count,
                downtimeCategories: downtimeCategories.map(d => ({
                    ...d,
                    percent: Math.round(d.percent * scale * 100) / 100
                }))
            };
        };

        return {
            byDate: Array.from(byDate.entries())
                .map(([date, data]) => processData(date, data, 'date'))
                .filter(item => item.date) // Фильтруем элементы без даты
                .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
            byLine: Array.from(byLine.entries())
                .map(([line, data]) => processData(line, data, 'line'))
                .filter(item => item.line) // Фильтруем элементы без линии
                .sort((a, b) => (a.line || '').localeCompare(b.line || '')),
            byProduct: Array.from(byProduct.entries())
                .map(([product, data]) => processData(product, data, 'product'))
                .filter(item => item.product) // Фильтруем элементы без продукта
                .sort((a, b) => b.fact - a.fact)
                .slice(0, 15) // Топ 15 продуктов
        };
    }, [filteredRows, filteredDowntimeRows, excludedDowntimeTypes]);


    const handleFileChange = async (event) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        setIsParsing(true);
        setParseError('');
        setResults([]);
        setFlatRows([]);
        setFlatDowntimeRows([]);

        try {
            const worker = productionWorkerRef.current;
            if (!worker) {
                setParseError('Worker не инициализирован');
                setIsParsing(false);
                return;
            }

            // Подготавливаем данные файлов для воркера
            const filesData = [];
            const transferables = [];
            for (const file of files) {
                try {
                    const data = await file.arrayBuffer();
                    if (!data || data.byteLength === 0) {
                        throw new Error(`Файл ${file.name} пуст или поврежден`);
                    }
                    filesData.push({
                        data: data,
                        fileName: file.name
                    });
                    transferables.push(data);
                } catch (fileErr) {
                    throw new Error(`Ошибка чтения файла ${file.name}: ${fileErr.message}`);
                }
            }

            if (filesData.length === 0) {
                throw new Error('Нет файлов для обработки');
            }

            // Устанавливаем таймаут для обнаружения зависаний
            const timeoutId = setTimeout(() => {
                console.error('Таймаут при обработке файлов');
                setParseError('Таймаут: обработка файлов занимает слишком много времени. Попробуйте загрузить файлы по одному.');
                setIsParsing(false);
            }, 120000); // 2 минуты

            const requestId = ++productionWorkerReqIdRef.current;
            
            // Сохраняем обработчик для очистки таймаута
            const timeoutRef = { current: timeoutId };
            const originalOnMessage = worker.onmessage;
            
            // Временно перехватываем сообщения для очистки таймаута
            worker.onmessage = (e) => {
                const { type: msgType, requestId: msgRequestId, error } = e.data || {};
                
                // Очищаем таймаут при получении ответа для этого запроса
                if (msgRequestId === requestId) {
                    clearTimeout(timeoutRef.current);
                    // Восстанавливаем оригинальный обработчик
                    worker.onmessage = originalOnMessage;
                }
                
                // Вызываем оригинальный обработчик
                if (originalOnMessage) {
                    originalOnMessage(e);
                }
            };
            
            console.log(`Отправка ${filesData.length} файлов воркеру, requestId: ${requestId}`);
            worker.postMessage({
                type: 'parseFiles',
                requestId,
                payload: {
                    files: filesData
                }
            }, transferables);
        } catch (err) {
            console.error('Ошибка при загрузке файлов:', err);
            setParseError(err?.message || 'Ошибка чтения Excel файла');
            setIsParsing(false);
        } finally {
            event.target.value = '';
        }
    };

    // Инициализация воркера
    useEffect(() => {
        if (productionWorkerRef.current) return;

        try {
            console.log('Инициализация production worker...');
            const worker = new Worker(new URL('../../production.worker.js', import.meta.url), { type: 'module' });
            productionWorkerRef.current = worker;

            worker.onmessage = (e) => {
                const { type, requestId, results, flatRows: workerFlatRows, flatDowntimeRows: workerFlatDowntimeRows, error } = e.data || {};
                
                console.log(`Получено сообщение от воркера: type=${type}, requestId=${requestId}, error=${error ? 'yes' : 'no'}`);
                
                if (error) {
                    console.error('Ошибка от воркера:', error);
                    setParseError(error);
                    setIsParsing(false);
                    return;
                }

                if (type === 'parseFiles') {
                    console.log(`Парсинг завершен, результатов: ${results?.length || 0}`);
                    setResults(results || []);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(results || []));
                    setIsParsing(false);
                    // Пересчет flatRows произойдет автоматически через useEffect при изменении results
                } else if (type === 'calculateFlatRows') {
                    console.log(`Расчет завершен, flatRows: ${workerFlatRows?.length || 0}, flatDowntimeRows: ${workerFlatDowntimeRows?.length || 0}`);
                    setFlatRows(workerFlatRows || []);
                    setFlatDowntimeRows(workerFlatDowntimeRows || []);
                }
            };

            worker.onerror = (err) => {
                console.error('Worker error:', err);
                setParseError(err?.message || 'Ошибка воркера при обработке файлов');
                setIsParsing(false);
            };

            console.log('Production worker инициализирован');
        } catch (err) {
            console.error('Ошибка при создании воркера:', err);
            setParseError(`Ошибка инициализации воркера: ${err.message}`);
        }

        return () => {
            if (productionWorkerRef.current) {
                try { 
                    productionWorkerRef.current.terminate(); 
                    console.log('Production worker завершен');
                } catch (_) {}
                productionWorkerRef.current = null;
            }
        };
    }, []);

    // Загрузка данных из localStorage при монтировании
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                setResults(parsed);
                // Пересчитываем flatRows для загруженных данных
                if (productionWorkerRef.current) {
                    const requestId = ++productionWorkerReqIdRef.current;
                    productionWorkerRef.current.postMessage({
                        type: 'calculateFlatRows',
                        requestId,
                        payload: {
                            results: parsed,
                            excludedDowntimeTypes: Array.from(excludedDowntimeTypes)
                        }
                    });
                }
            }
        } catch (err) {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    // Пересчет flatRows при изменении excludedDowntimeTypes или results
    useEffect(() => {
        if (!productionWorkerRef.current || results.length === 0) return;
        
        const requestId = ++productionWorkerReqIdRef.current;
        productionWorkerRef.current.postMessage({
            type: 'calculateFlatRows',
            requestId,
            payload: {
                results,
                excludedDowntimeTypes: Array.from(excludedDowntimeTypes)
            }
        });
    }, [excludedDowntimeTypes, results]);

    // Закрытие селектора простоев при клике вне его
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (downtimeSelectorRef.current && !downtimeSelectorRef.current.contains(event.target)) {
                setIsDowntimeSelectorOpen(false);
            }
        };
        if (isDowntimeSelectorOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isDowntimeSelectorOpen]);

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
                                placeholder={activeTab === 'production' ? 'Поиск по продукту...' : 'Поиск по простою...'}
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
                            {uniqueDates.length > 0 ? uniqueDates.map(date => (
                                <option key={date} value={date}>{date}</option>
                            )) : (
                                <option value="" disabled>Нет доступных дат</option>
                            )}
                        </select>
                    </div>
                    {activeTab === 'production' && uniqueDowntimeTypes.length > 0 && (
                        <div className="relative w-full" ref={downtimeSelectorRef}>
                            <button
                                type="button"
                                onClick={() => setIsDowntimeSelectorOpen(!isDowntimeSelectorOpen)}
                                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[250px] flex items-center justify-between hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Filter size={16} className="text-slate-400" />
                                    <span className="text-left">
                                        {excludedDowntimeTypes.size > 0 
                                            ? `Исключено: ${excludedDowntimeTypes.size} вид(ов)`
                                            : 'Виды простоев, не влияющие на план'
                                        }
                                    </span>
                                </div>
                                <ChevronDown 
                                    size={16} 
                                    className={`text-slate-400 transition-transform ${isDowntimeSelectorOpen ? 'rotate-180' : ''}`} 
                                />
                            </button>
                            {isDowntimeSelectorOpen && (
                                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                    <div className="p-2">
                                        {uniqueDowntimeTypes.length === 0 ? (
                                            <div className="px-3 py-2 text-sm text-slate-500 text-center">
                                                Нет доступных видов простоев
                                            </div>
                                        ) : (
                                            uniqueDowntimeTypes.map(type => {
                                                const isSelected = excludedDowntimeTypes.has(type);
                                                return (
                                                    <label
                                                        key={type}
                                                        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer rounded transition-colors"
                                                    >
                                                        <div className={`flex-shrink-0 w-4 h-4 border-2 rounded flex items-center justify-center transition-colors ${
                                                            isSelected 
                                                                ? 'bg-blue-600 border-blue-600' 
                                                                : 'border-slate-300 bg-white'
                                                        }`}>
                                                            {isSelected && <Check size={12} className="text-white" />}
                                                        </div>
                                                        <span className="text-sm text-slate-700 flex-1">{type}</span>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                const newSet = new Set(excludedDowntimeTypes);
                                                                if (e.target.checked) {
                                                                    newSet.add(type);
                                                                } else {
                                                                    newSet.delete(type);
                                                                }
                                                                setExcludedDowntimeTypes(newSet);
                                                                localStorage.setItem('productionExcludedDowntimeTypes', JSON.stringify(Array.from(newSet)));
                                                            }}
                                                            className="hidden"
                                                        />
                                                    </label>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
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
                        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                            <button
                                onClick={() => setActiveTab('production')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    activeTab === 'production'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                Производство
                            </button>
                            <button
                                onClick={() => setActiveTab('downtime')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    activeTab === 'downtime'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                Простои
                            </button>
                            <button
                                onClick={() => setActiveTab('charts')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    activeTab === 'charts'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                <BarChart3 size={16} />
                                Графики
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {activeTab === 'production' && (
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
                                            <th className="px-4 py-3 border-b text-center">Доступное время (мин)</th>
                                            <th className="px-4 py-3 border-b text-center">Время простоев (мин)</th>
                                            <th className="px-4 py-3 border-b text-center">План</th>
                                            <th className="px-4 py-3 border-b text-center">Смена</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
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
                                                    <td className="px-4 py-3 text-center text-slate-700 font-semibold">
                                                        {typeof row.qty === 'number' ? Math.round(row.qty) : row.qty}
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-slate-600">
                                                        {row.availableMinutes !== null && row.availableMinutes !== undefined 
                                                            ? <span>{Math.round(row.availableMinutes)}</span>
                                                            : <span className="text-slate-400">—</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-slate-600">
                                                        {row.downtimeMinutes !== null && row.downtimeMinutes !== undefined 
                                                            ? <span>{Math.round(row.downtimeMinutes)}</span>
                                                            : <span className="text-slate-400">—</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-slate-700">
                                                        {row.plan !== null && row.plan !== undefined 
                                                            ? <span className="font-semibold">{Math.round(row.plan)}</span>
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
                            )}
                            {activeTab === 'downtime' && (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 border-b">Дата</th>
                                            <th className="px-4 py-3 border-b">Файл</th>
                                            <th className="px-4 py-3 border-b">Линия</th>
                                            <th className="px-4 py-3 border-b">Категория (F-G)</th>
                                            <th className="px-4 py-3 border-b">Вид (H)</th>
                                            <th className="px-4 py-3 border-b">Время начала (I)</th>
                                            <th className="px-4 py-3 border-b">Время конца (J)</th>
                                            <th className="px-4 py-3 border-b">Описание (L-N)</th>
                                            <th className="px-4 py-3 border-b text-center">Длительность (мин)</th>
                                            <th className="px-4 py-3 border-b text-center">Смена</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredDowntimeRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                                                    Нет данных для отображения
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredDowntimeRows.map((row, idx) => (
                                                <tr key={`${row.date}_${row.shift}_${idx}`} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3 text-slate-700 font-medium">{row.date}</td>
                                                    <td className="px-4 py-3 text-slate-500 text-xs">{row.fileName}</td>
                                                    <td className="px-4 py-3 text-slate-700">{row.line}</td>
                                                    <td className="px-4 py-3 text-slate-800 font-medium">{row.category || '—'}</td>
                                                    <td className="px-4 py-3 text-slate-700">{row.type || '—'}</td>
                                                    <td className="px-4 py-3 text-slate-600">{row.start || '—'}</td>
                                                    <td className="px-4 py-3 text-slate-600">{row.end || '—'}</td>
                                                    <td className="px-4 py-3 text-slate-600">{row.description || '—'}</td>
                                                    <td className="px-4 py-3 text-center text-slate-700">
                                                        {row.durationMinutes !== null && row.durationMinutes !== undefined 
                                                            ? <span className="font-semibold">{Math.round(row.durationMinutes)}</span>
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
                            )}
                            {activeTab === 'charts' && (
                                <div className="p-6 space-y-6">
                                    {chartData.byDate.length === 0 ? (
                                        <div className="text-center py-12 text-slate-400">
                                            <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                                            <p className="text-lg font-medium">Нет данных для графиков</p>
                                            <p className="text-sm mt-2">Загрузите Excel файл для просмотра графиков</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Общая статистика */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-medium text-blue-700">Общий план</span>
                                                        <TrendingUp size={20} className="text-blue-600" />
                                                    </div>
                                                    <div className="text-3xl font-bold text-blue-900">
                                                        {chartData.byDate.reduce((sum, d) => sum + d.plan, 0).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-medium text-green-700">Общий факт</span>
                                                        <TrendingUp size={20} className="text-green-600" />
                                                    </div>
                                                    <div className="text-3xl font-bold text-green-900">
                                                        {chartData.byDate.reduce((sum, d) => sum + d.fact, 0).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-medium text-purple-700">Средняя эффективность</span>
                                                        <BarChart3 size={20} className="text-purple-600" />
                                                    </div>
                                                    <div className="text-3xl font-bold text-purple-900">
                                                        {chartData.byDate.length > 0 
                                                            ? Math.round(chartData.byDate.reduce((sum, d) => sum + d.efficiency, 0) / chartData.byDate.length)
                                                            : 0}%
                                                    </div>
                                                </div>
                                            </div>

                                            {/* График по датам */}
                                            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                                    <BarChart3 size={20} className="text-blue-600" />
                                                    Выработка по датам
                                                </h3>
                                                <div className="space-y-4">
                                                    {chartData.byDate.map((item, idx) => {
                                                        const efficiencyPercent = Math.min(item.efficiency, 100);
                                                        const isOverPlan = item.fact >= item.plan;
                                                        const isGreen = item.efficiency >= 95;
                                                        const isExpanded = expandedCharts.byDate.has(item.date);
                                                        let leftOffset = efficiencyPercent;
                                                        
                                                        return (
                                                            <div key={idx} className="space-y-2 border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                                                                <div className="flex items-center justify-between text-sm">
                                                                    <div className="flex items-center gap-2 flex-1">
                                                                        <button
                                                                            onClick={() => {
                                                                                const newExpanded = new Set(expandedCharts.byDate);
                                                                                if (isExpanded) {
                                                                                    newExpanded.delete(item.date);
                                                                                } else {
                                                                                    newExpanded.add(item.date);
                                                                                }
                                                                                setExpandedCharts({ ...expandedCharts, byDate: newExpanded });
                                                                            }}
                                                                            className="p-1 hover:bg-slate-200 rounded transition-colors"
                                                                        >
                                                                            {isExpanded ? (
                                                                                <ChevronDown size={16} className="text-slate-600" />
                                                                            ) : (
                                                                                <ChevronRight size={16} className="text-slate-600" />
                                                                            )}
                                                                        </button>
                                                                        <span className="font-medium text-slate-700">{item.date}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 text-xs">
                                                                        <span className="text-blue-600">План: {item.plan.toLocaleString()}</span>
                                                                        <span className={`font-semibold ${isOverPlan ? 'text-green-600' : 'text-orange-600'}`}>
                                                                            Факт: {item.fact.toLocaleString()}
                                                                        </span>
                                                                        <span className={`font-semibold ${isGreen ? 'text-green-600' : item.efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                            {item.efficiency}%
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="relative h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                                    {/* Факт - процент от плана */}
                                                                    <div 
                                                                        className={`absolute left-0 top-0 h-full rounded-lg transition-all duration-500 ${
                                                                            isGreen
                                                                                ? 'bg-gradient-to-r from-green-400 to-green-500' 
                                                                                : isOverPlan 
                                                                                    ? 'bg-gradient-to-r from-green-400 to-green-500'
                                                                                    : 'bg-gradient-to-r from-orange-400 to-orange-500'
                                                                        }`}
                                                                        style={{ width: `${efficiencyPercent}%` }}
                                                                    />
                                                                    {/* Простои по категориям */}
                                                                    {item.downtimeCategories && item.downtimeCategories.map((downtime, dIdx) => {
                                                                        const maxAvailable = 100 - efficiencyPercent;
                                                                        const usedSoFar = leftOffset - efficiencyPercent;
                                                                        const remainingAvailable = maxAvailable - usedSoFar;
                                                                        const width = Math.min(downtime.percent, remainingAvailable);
                                                                        const currentLeft = leftOffset;
                                                                        if (width > 0) {
                                                                            leftOffset += width;
                                                                            return (
                                                                                <div
                                                                                    key={dIdx}
                                                                                    className={`absolute top-0 h-full ${getCategoryColor(downtime.category)} transition-all duration-500 border-r border-slate-300`}
                                                                                    style={{ 
                                                                                        left: `${currentLeft}%`, 
                                                                                        width: `${width}%` 
                                                                                    }}
                                                                                    title={`${downtime.category}: ${downtime.minutes || 0} мин (${downtime.percent.toFixed(1)}%)`}
                                                                                />
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })}
                                                                </div>
                                                                {/* Детальная информация при раскрытии */}
                                                                {isExpanded && (
                                                                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                                                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                                                            <div>
                                                                                <span className="text-slate-500">Количество записей: </span>
                                                                                <span className="font-semibold text-slate-700">{item.count}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-slate-500">Эффективность: </span>
                                                                                <span className={`font-semibold ${isGreen ? 'text-green-600' : item.efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                                    {item.efficiency}%
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {item.downtimeCategories && item.downtimeCategories.length > 0 && (
                                                                            <div className="mt-2">
                                                                                <div className="text-xs font-semibold text-slate-700 mb-2">Детализация простоев:</div>
                                                                                <div className="space-y-2">
                                                                                    {item.downtimeCategories.map((downtime, dIdx) => (
                                                                                        <div key={dIdx} className="bg-slate-50 p-3 rounded border border-slate-200">
                                                                                            <div className="flex items-center justify-between mb-2">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className={`w-3 h-3 rounded ${getCategoryColor(downtime.category)}`} />
                                                                                                    <span className="text-sm font-semibold text-slate-700">{downtime.category}</span>
                                                                                                </div>
                                                                                                <span className="text-sm font-semibold text-slate-600">
                                                                                                    {downtime.minutes || 0} мин · {downtime.percent.toFixed(2)}%
                                                                                                </span>
                                                                                            </div>
                                                                                            {downtime.descriptions && downtime.descriptions.length > 0 && (
                                                                                                <div className="mt-2 space-y-1">
                                                                                                    {downtime.descriptions.map((desc, descIdx) => (
                                                                                                        <div key={descIdx} className="text-xs text-slate-600 pl-5">
                                                                                                            • {desc}
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* График по линиям */}
                                            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                                    <BarChart3 size={20} className="text-blue-600" />
                                                    Выработка по линиям
                                                </h3>
                                                <div className="space-y-4">
                                                    {chartData.byLine.map((item, idx) => {
                                                        const efficiencyPercent = Math.min(item.efficiency, 100);
                                                        const isOverPlan = item.fact >= item.plan;
                                                        const isGreen = item.efficiency >= 95;
                                                        const isExpanded = expandedCharts.byLine.has(item.line);
                                                        let leftOffset = efficiencyPercent;
                                                        
                                                        return (
                                                            <div key={idx} className="space-y-2 border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                                                                <div className="flex items-center justify-between text-sm">
                                                                    <div className="flex items-center gap-2 flex-1">
                                                                        <button
                                                                            onClick={() => {
                                                                                const newExpanded = new Set(expandedCharts.byLine);
                                                                                if (isExpanded) {
                                                                                    newExpanded.delete(item.line);
                                                                                } else {
                                                                                    newExpanded.add(item.line);
                                                                                }
                                                                                setExpandedCharts({ ...expandedCharts, byLine: newExpanded });
                                                                            }}
                                                                            className="p-1 hover:bg-slate-200 rounded transition-colors"
                                                                        >
                                                                            {isExpanded ? (
                                                                                <ChevronDown size={16} className="text-slate-600" />
                                                                            ) : (
                                                                                <ChevronRight size={16} className="text-slate-600" />
                                                                            )}
                                                                        </button>
                                                                        <span className="font-medium text-slate-700">{item.line}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 text-xs">
                                                                        <span className="text-blue-600">План: {item.plan.toLocaleString()}</span>
                                                                        <span className={`font-semibold ${isOverPlan ? 'text-green-600' : 'text-orange-600'}`}>
                                                                            Факт: {item.fact.toLocaleString()}
                                                                        </span>
                                                                        <span className={`font-semibold ${isGreen ? 'text-green-600' : item.efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                            {item.efficiency}%
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="relative h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                                    {/* Факт - процент от плана */}
                                                                    <div 
                                                                        className={`absolute left-0 top-0 h-full rounded-lg transition-all duration-500 ${
                                                                            isGreen
                                                                                ? 'bg-gradient-to-r from-green-400 to-green-500' 
                                                                                : isOverPlan 
                                                                                    ? 'bg-gradient-to-r from-green-400 to-green-500'
                                                                                    : 'bg-gradient-to-r from-orange-400 to-orange-500'
                                                                        }`}
                                                                        style={{ width: `${efficiencyPercent}%` }}
                                                                    />
                                                                    {/* Простои по категориям */}
                                                                    {item.downtimeCategories && item.downtimeCategories.map((downtime, dIdx) => {
                                                                        const maxAvailable = 100 - efficiencyPercent;
                                                                        const usedSoFar = leftOffset - efficiencyPercent;
                                                                        const remainingAvailable = maxAvailable - usedSoFar;
                                                                        const width = Math.min(downtime.percent, remainingAvailable);
                                                                        const currentLeft = leftOffset;
                                                                        if (width > 0) {
                                                                            leftOffset += width;
                                                                            return (
                                                                                <div
                                                                                    key={dIdx}
                                                                                    className={`absolute top-0 h-full ${getCategoryColor(downtime.category)} transition-all duration-500 border-r border-slate-300`}
                                                                                    style={{ 
                                                                                        left: `${currentLeft}%`, 
                                                                                        width: `${width}%` 
                                                                                    }}
                                                                                    title={`${downtime.category}: ${downtime.minutes || 0} мин (${downtime.percent.toFixed(1)}%)`}
                                                                                />
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })}
                                                                </div>
                                                                {/* Детальная информация при раскрытии */}
                                                                {isExpanded && (
                                                                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                                                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                                                            <div>
                                                                                <span className="text-slate-500">Количество записей: </span>
                                                                                <span className="font-semibold text-slate-700">{item.count}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-slate-500">Эффективность: </span>
                                                                                <span className={`font-semibold ${isGreen ? 'text-green-600' : item.efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                                    {item.efficiency}%
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {item.downtimeCategories && item.downtimeCategories.length > 0 && (
                                                                            <div className="mt-2">
                                                                                <div className="text-xs font-semibold text-slate-700 mb-2">Детализация простоев:</div>
                                                                                <div className="space-y-2">
                                                                                    {item.downtimeCategories.map((downtime, dIdx) => (
                                                                                        <div key={dIdx} className="bg-slate-50 p-3 rounded border border-slate-200">
                                                                                            <div className="flex items-center justify-between mb-2">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className={`w-3 h-3 rounded ${getCategoryColor(downtime.category)}`} />
                                                                                                    <span className="text-sm font-semibold text-slate-700">{downtime.category}</span>
                                                                                                </div>
                                                                                                <span className="text-sm font-semibold text-slate-600">
                                                                                                    {downtime.minutes || 0} мин · {downtime.percent.toFixed(2)}%
                                                                                                </span>
                                                                                            </div>
                                                                                            {downtime.descriptions && downtime.descriptions.length > 0 && (
                                                                                                <div className="mt-2 space-y-1">
                                                                                                    {downtime.descriptions.map((desc, descIdx) => (
                                                                                                        <div key={descIdx} className="text-xs text-slate-600 pl-5">
                                                                                                            • {desc}
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* График по продуктам (топ 15) */}
                                            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                                    <BarChart3 size={20} className="text-blue-600" />
                                                    Выработка по продуктам (Топ 15)
                                                </h3>
                                                <div className="space-y-4">
                                                    {chartData.byProduct.map((item, idx) => {
                                                        const efficiencyPercent = Math.min(item.efficiency, 100);
                                                        const isOverPlan = item.fact >= item.plan;
                                                        const isGreen = item.efficiency >= 95;
                                                        const isExpanded = expandedCharts.byProduct.has(item.product);
                                                        let leftOffset = efficiencyPercent;
                                                        
                                                        return (
                                                            <div key={idx} className="space-y-2 border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                                                                <div className="flex items-center justify-between text-sm">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        <button
                                                                            onClick={() => {
                                                                                const newExpanded = new Set(expandedCharts.byProduct);
                                                                                if (isExpanded) {
                                                                                    newExpanded.delete(item.product);
                                                                                } else {
                                                                                    newExpanded.add(item.product);
                                                                                }
                                                                                setExpandedCharts({ ...expandedCharts, byProduct: newExpanded });
                                                                            }}
                                                                            className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
                                                                        >
                                                                            {isExpanded ? (
                                                                                <ChevronDown size={16} className="text-slate-600" />
                                                                            ) : (
                                                                                <ChevronRight size={16} className="text-slate-600" />
                                                                            )}
                                                                        </button>
                                                                        <span className="font-medium text-slate-700 truncate">{item.product}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 text-xs flex-shrink-0">
                                                                        <span className="text-blue-600">План: {item.plan.toLocaleString()}</span>
                                                                        <span className={`font-semibold ${isOverPlan ? 'text-green-600' : 'text-orange-600'}`}>
                                                                            Факт: {item.fact.toLocaleString()}
                                                                        </span>
                                                                        <span className={`font-semibold ${isGreen ? 'text-green-600' : item.efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                            {item.efficiency}%
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="relative h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                                    {/* Факт - процент от плана */}
                                                                    <div 
                                                                        className={`absolute left-0 top-0 h-full rounded-lg transition-all duration-500 ${
                                                                            isGreen
                                                                                ? 'bg-gradient-to-r from-green-400 to-green-500' 
                                                                                : isOverPlan 
                                                                                    ? 'bg-gradient-to-r from-green-400 to-green-500'
                                                                                    : 'bg-gradient-to-r from-orange-400 to-orange-500'
                                                                        }`}
                                                                        style={{ width: `${efficiencyPercent}%` }}
                                                                    />
                                                                    {/* Простои по категориям */}
                                                                    {item.downtimeCategories && item.downtimeCategories.map((downtime, dIdx) => {
                                                                        const maxAvailable = 100 - efficiencyPercent;
                                                                        const usedSoFar = leftOffset - efficiencyPercent;
                                                                        const remainingAvailable = maxAvailable - usedSoFar;
                                                                        const width = Math.min(downtime.percent, remainingAvailable);
                                                                        const currentLeft = leftOffset;
                                                                        if (width > 0) {
                                                                            leftOffset += width;
                                                                            return (
                                                                                <div
                                                                                    key={dIdx}
                                                                                    className={`absolute top-0 h-full ${getCategoryColor(downtime.category)} transition-all duration-500 border-r border-slate-300`}
                                                                                    style={{ 
                                                                                        left: `${currentLeft}%`, 
                                                                                        width: `${width}%` 
                                                                                    }}
                                                                                    title={`${downtime.category}: ${downtime.minutes || 0} мин (${downtime.percent.toFixed(1)}%)`}
                                                                                />
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })}
                                                                </div>
                                                                {/* Детальная информация при раскрытии */}
                                                                {isExpanded && (
                                                                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                                                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                                                            <div>
                                                                                <span className="text-slate-500">Количество записей: </span>
                                                                                <span className="font-semibold text-slate-700">{item.count}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-slate-500">Эффективность: </span>
                                                                                <span className={`font-semibold ${isGreen ? 'text-green-600' : item.efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                                    {item.efficiency}%
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {item.downtimeCategories && item.downtimeCategories.length > 0 && (
                                                                            <div className="mt-2">
                                                                                <div className="text-xs font-semibold text-slate-700 mb-2">Детализация простоев:</div>
                                                                                <div className="space-y-2">
                                                                                    {item.downtimeCategories.map((downtime, dIdx) => (
                                                                                        <div key={dIdx} className="bg-slate-50 p-3 rounded border border-slate-200">
                                                                                            <div className="flex items-center justify-between mb-2">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className={`w-3 h-3 rounded ${getCategoryColor(downtime.category)}`} />
                                                                                                    <span className="text-sm font-semibold text-slate-700">{downtime.category}</span>
                                                                                                </div>
                                                                                                <span className="text-sm font-semibold text-slate-600">
                                                                                                    {downtime.minutes || 0} мин · {downtime.percent.toFixed(2)}%
                                                                                                </span>
                                                                                            </div>
                                                                                            {downtime.descriptions && downtime.descriptions.length > 0 && (
                                                                                                <div className="mt-2 space-y-1">
                                                                                                    {downtime.descriptions.map((desc, descIdx) => (
                                                                                                        <div key={descIdx} className="text-xs text-slate-600 pl-5">
                                                                                                            • {desc}
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { STORAGE_KEYS } from '../utils';
import { getCategoryColorHex } from '../components/views/productionViewUtils';
import { generateProductionReportHtml } from '../components/views/productionReportHtml';

const STORAGE_KEY = STORAGE_KEYS.PRODUCTION_RESULTS;

export function useProductionData() {
    const { persistStateKey, productionResults: contextProductionResults, productionExcludedDowntimeTypes: contextExcludedTypes } = useData();

    const fileInputRef = useRef(null);
    const [results, setResults] = useState([]);
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState('');
    const [filterLine, setFilterLine] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [activeTab, setActiveTab] = useState('production');
    const [reportError, setReportError] = useState('');
    const [reportDates, setReportDates] = useState([]);
    const [reportTargets, setReportTargets] = useState({});
    const [excludedDowntimeTypes, setExcludedDowntimeTypes] = useState(() => new Set());
    const [isDowntimeSelectorOpen, setIsDowntimeSelectorOpen] = useState(false);
    const downtimeSelectorRef = useRef(null);

    const productionWorkerRef = useRef(null);
    const productionWorkerReqIdRef = useRef(0);
    const [flatRows, setFlatRows] = useState([]);
    const [flatDowntimeRows, setFlatDowntimeRows] = useState([]);

    const [expandedCharts, setExpandedCharts] = useState({
        byDate: new Set(),
        byLine: new Set(),
        byProduct: new Set()
    });
    const [lineSlideIndex, setLineSlideIndex] = useState(0);
    const [isLineSlideVisible, setIsLineSlideVisible] = useState(true);

    const processFiles = useCallback(async (files) => {
        if (!files || files.length === 0) return;
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
            const filesData = [];
            const transferables = [];
            for (const file of files) {
                try {
                    const data = await file.arrayBuffer();
                    if (!data || data.byteLength === 0) throw new Error(`Файл ${file.name} пуст или поврежден`);
                    filesData.push({ data, fileName: file.name });
                    transferables.push(data);
                } catch (fileErr) {
                    throw new Error(`Ошибка чтения файла ${file.name}: ${fileErr.message}`);
                }
            }
            if (filesData.length === 0) throw new Error('Нет файлов для обработки');
            const timeoutId = setTimeout(() => {
                setParseError('Таймаут: обработка файлов занимает слишком много времени. Попробуйте загрузить файлы по одному.');
                setIsParsing(false);
            }, 120000);
            const requestId = ++productionWorkerReqIdRef.current;
            const timeoutRef = { current: timeoutId };
            const originalOnMessage = worker.onmessage;
            worker.onmessage = (e) => {
                const { requestId: msgRequestId } = e.data || {};
                if (msgRequestId === requestId) {
                    clearTimeout(timeoutRef.current);
                    worker.onmessage = originalOnMessage;
                }
                if (originalOnMessage) originalOnMessage(e);
            };
            worker.postMessage({ type: 'parseFiles', requestId, payload: { files: filesData } }, transferables);
        } catch (err) {
            setParseError(err?.message || 'Ошибка чтения Excel файла');
            setIsParsing(false);
        }
    }, []);

    const uniqueLines = useMemo(() => {
        const lines = new Set([...flatRows.map(r => r.line), ...flatDowntimeRows.map(r => r.line)]);
        return Array.from(lines).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0], 10) ?? NaN;
            const numB = parseInt(b.match(/\d+/)?.[0], 10) ?? NaN;
            if (!isNaN(numA) && !isNaN(numB)) return numA !== numB ? numA - numB : a.localeCompare(b);
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;
            return a.localeCompare(b);
        });
    }, [flatRows, flatDowntimeRows]);

    const uniqueDowntimeTypes = useMemo(() => {
        const types = new Set();
        flatDowntimeRows.forEach(row => { if (row.type?.trim()) types.add(row.type.trim()); });
        return Array.from(types).sort();
    }, [flatDowntimeRows]);

    const uniqueDates = useMemo(() => {
        const dates = new Set();
        results.forEach(r => { if (r?.date?.trim()) dates.add(r.date); });
        return Array.from(dates).sort((a, b) => {
            const numA = parseInt(a, 10), numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
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
                if (![row.category, row.type, row.description].filter(Boolean).some(v => String(v).toLowerCase().includes(search))) return false;
            }
            return true;
        });
    }, [flatDowntimeRows, filterLine, filterDate, filterProduct]);

    const buildLineSlidesForDates = useCallback((dates) => {
        if (!dates?.length) return [];
        const dateSet = new Set(dates);
        const rowsForDates = flatRows.filter(row => dateSet.has(row.date));
        const downtimesForDates = flatDowntimeRows.filter(row => dateSet.has(row.date));
        const lines = [...new Set(rowsForDates.map(r => r.line))].sort();
        return lines.map((line) => {
            const lineRows = rowsForDates.filter(r => r.line === line);
            const lineDowntimes = downtimesForDates.filter(d => d.line === line);
            const plan = lineRows.reduce((s, r) => s + (r.plan || 0), 0);
            const fact = lineRows.reduce((s, r) => s + (typeof r.qty === 'number' ? r.qty : 0), 0);
            const speeds = lineRows.map(r => r.speed || 0).filter(s => s > 0);
            const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
            const downtimeMap = new Map();
            const downtimeDescriptions = new Map();
            lineDowntimes.filter(d => !excludedDowntimeTypes.has(String(d.type || '').trim())).forEach((d) => {
                const category = d.category || 'Без категории';
                downtimeMap.set(category, (downtimeMap.get(category) || 0) + (d.durationMinutes || 0));
                const descList = downtimeDescriptions.get(category) || new Set();
                if (d.description) descList.add(String(d.description));
                downtimeDescriptions.set(category, descList);
            });
            const downtimeList = Array.from(downtimeMap.entries())
                .map(([category, minutes]) => ({
                    category,
                    minutes: Math.round(minutes),
                    underproduction: avgSpeed > 0 ? Math.round((minutes / 60) * avgSpeed) : 0,
                    color: getCategoryColorHex(category),
                    descriptions: Array.from(downtimeDescriptions.get(category) || []).filter(Boolean)
                }))
                .filter(item => item.minutes > 0)
                .sort((a, b) => b.minutes - a.minutes);
            const totalDowntimeMinutes = downtimeList.reduce((s, i) => s + i.minutes, 0);
            const segments = downtimeList.map(item => ({ ...item, percent: totalDowntimeMinutes > 0 ? (item.minutes / totalDowntimeMinutes) * 100 : 0 }));
            return { line, plan, fact, segments, downtimeList, efficiency: plan > 0 ? Math.round((fact / plan) * 100) : 0, totalDowntimeMinutes };
        });
    }, [flatRows, flatDowntimeRows, excludedDowntimeTypes]);

    const lineSlides = useMemo(() => (filterDate ? buildLineSlidesForDates([filterDate]) : []), [buildLineSlidesForDates, filterDate]);
    const sortedReportDates = useMemo(() => (reportDates.length === 0 ? [] : uniqueDates.filter(d => new Set(reportDates).has(d))), [reportDates, uniqueDates]);
    const reportLineSlides = useMemo(() => buildLineSlidesForDates(sortedReportDates), [buildLineSlidesForDates, sortedReportDates]);

    const lineDailySeries = useMemo(() => {
        if (sortedReportDates.length === 0 || reportLineSlides.length === 0) return {};
        const dateSet = new Set(sortedReportDates);
        const rowsForDates = flatRows.filter(row => dateSet.has(row.date));
        const lineMap = new Map();
        rowsForDates.forEach((row) => {
            if (!lineMap.has(row.line)) lineMap.set(row.line, new Map());
            const dateMap = lineMap.get(row.line);
            const entry = dateMap.get(row.date) || { plan: 0, fact: 0 };
            entry.plan += row.plan || 0;
            entry.fact += typeof row.qty === 'number' ? row.qty : 0;
            dateMap.set(row.date, entry);
        });
        const getDayLabel = (date) => {
            const parts = String(date).split(/[\.\-\/]/).filter(Boolean);
            if (parts[0]?.length <= 2) return String(parseInt(parts[0], 10));
            if (parts.length >= 3) return String(parseInt(parts[2], 10));
            const m = String(date).match(/(\d{1,2})/);
            return m ? String(parseInt(m[1], 10)) : String(date);
        };
        return reportLineSlides.reduce((acc, line) => {
            const dateMap = lineMap.get(line.line) || new Map();
            acc[line.line] = sortedReportDates.map((date) => {
                const entry = dateMap.get(date) || { plan: 0, fact: 0 };
                return { date, dayLabel: getDayLabel(date), plan: Math.round(entry.plan), fact: Math.round(entry.fact), efficiency: entry.plan > 0 ? Math.round((entry.fact / entry.plan) * 100) : 0 };
            });
            return acc;
        }, {});
    }, [flatRows, reportLineSlides, sortedReportDates]);

    useEffect(() => { if (reportLineSlides.length === 0) return; setReportTargets(prev => { const next = { ...prev }; reportLineSlides.forEach(l => { if (next[l.line] === undefined || next[l.line] === null || next[l.line] === '') next[l.line] = 85; }); return next; }); }, [reportLineSlides]);
    useEffect(() => setLineSlideIndex(0), [filterDate, lineSlides.length]);
    useEffect(() => { setIsLineSlideVisible(false); const id = setTimeout(() => setIsLineSlideVisible(true), 50); return () => clearTimeout(id); }, [lineSlideIndex, filterDate]);
    useEffect(() => { if (!filterDate) setReportError(''); }, [filterDate]);
    useEffect(() => { if (reportDates.length === 0) setReportError(''); }, [reportDates]);
    useEffect(() => { if (reportDates.length === 0) return; const allowed = new Set(uniqueDates); const next = reportDates.filter(d => allowed.has(d)); if (next.length !== reportDates.length) setReportDates(next); }, [reportDates, uniqueDates]);

    const getReportPayload = useCallback(() => {
        if (sortedReportDates.length === 0) { setReportError('Выберите даты для формирования отчета.'); return; }
        if (reportLineSlides.length === 0) { setReportError('Нет данных для выбранного периода.'); return; }
        setReportError('');
        try {
            const normalizedTargets = reportLineSlides.reduce((acc, line) => {
                const raw = reportTargets[line.line];
                const num = typeof raw === 'number' ? raw : parseFloat(raw);
                acc[line.line] = Math.max(0, Math.min(100, Number.isFinite(num) ? num : 85));
                return acc;
            }, {});
            return generateProductionReportHtml({ dates: sortedReportDates, lineSlides: reportLineSlides, lineDailySeries, lineTargets: normalizedTargets });
        } catch (e) {
            setReportError('Не удалось сформировать HTML-отчет. Попробуйте еще раз.');
        }
    }, [lineDailySeries, reportLineSlides, reportTargets, sortedReportDates]);

    const openHtmlReport = useCallback(() => { const p = getReportPayload(); if (!p) return; const blob = new Blob([p.html], { type: 'text/html;charset=utf-8' }); const url = window.URL.createObjectURL(blob); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => window.URL.revokeObjectURL(url), 30000); }, [getReportPayload]);
    const downloadHtmlReport = useCallback(() => { const p = getReportPayload(); if (!p) return; const blob = new Blob([p.html], { type: 'text/html;charset=utf-8' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = p.fileName; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); }, [getReportPayload]);

    const chartData = useMemo(() => {
        const byDate = new Map(), byLine = new Map(), byProduct = new Map();
        filteredRows.forEach(row => {
            const plan = row.plan || 0, fact = typeof row.qty === 'number' ? row.qty : 0;
            for (const [map, key] of [[byDate, row.date], [byLine, row.line], [byProduct, row.product]]) {
                if (!map.has(key)) map.set(key, { plan: 0, fact: 0, count: 0, downtimeByCategory: new Map() });
                const d = map.get(key);
                d.plan += plan; d.fact += fact; d.count += 1;
            }
        });
        filteredDowntimeRows.filter(d => !excludedDowntimeTypes.has(String(d.type || '').trim())).forEach(downtime => {
            const duration = downtime.durationMinutes || 0, category = downtime.category || 'Без категории', desc = downtime.description || '';
            const matching = filteredRows.filter(r => r.date === downtime.date && r.line === downtime.line && r.shift === downtime.shift);
            for (const [map, key] of [[byDate, downtime.date], [byLine, downtime.line]]) {
                const data = map.get(key);
                if (data) { if (!data.downtimeByCategory.has(category)) data.downtimeByCategory.set(category, { minutes: 0, descriptions: [] }); const c = data.downtimeByCategory.get(category); c.minutes += duration; if (desc && !c.descriptions.includes(desc)) c.descriptions.push(desc); }
            }
            matching.forEach(row => { const data = byProduct.get(row.product); if (data) { if (!data.downtimeByCategory.has(category)) data.downtimeByCategory.set(category, { minutes: 0, descriptions: [] }); const c = data.downtimeByCategory.get(category); c.minutes += duration; if (desc && !c.descriptions.includes(desc)) c.descriptions.push(desc); } });
        });
        const processData = (keyVal, data, key) => {
            const efficiency = data.plan > 0 ? Math.round((data.fact / data.plan) * 100) : 0;
            const raw = Array.from(data.downtimeByCategory.entries()).map(([cat, c]) => ({ category: cat, minutes: Math.round(c.minutes || 0), descriptions: c.descriptions || [] })).filter(d => d.minutes > 0);
            const total = raw.reduce((s, d) => s + d.minutes, 0);
            const categories = raw.map(d => ({ ...d, percent: total > 0 ? Math.round((d.minutes / total) * 10000) / 100 : 0 })).sort((a, b) => b.percent - a.percent);
            const maxD = Math.max(0, 100 - efficiency), sumD = categories.reduce((s, d) => s + d.percent, 0), scale = sumD > maxD && sumD > 0 ? maxD / sumD : 1;
            return { [key]: keyVal, plan: Math.round(data.plan), fact: Math.round(data.fact), efficiency, count: data.count, downtimeCategories: categories.map(d => ({ ...d, percent: Math.round(d.percent * scale * 100) / 100 })) };
        };
        return {
            byDate: Array.from(byDate.entries()).map(([k, v]) => processData(k, v, 'date')).filter(i => i.date).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
            byLine: Array.from(byLine.entries()).map(([k, v]) => processData(k, v, 'line')).filter(i => i.line).sort((a, b) => (a.line || '').localeCompare(b.line || '')),
            byProduct: Array.from(byProduct.entries()).map(([k, v]) => processData(k, v, 'product')).filter(i => i.product).sort((a, b) => b.fact - a.fact).slice(0, 15)
        };
    }, [filteredRows, filteredDowntimeRows, excludedDowntimeTypes]);

    const handleFileChange = useCallback(async (event) => { const files = Array.from(event.target.files || []); await processFiles(files); event.target.value = ''; }, [processFiles]);

    useEffect(() => {
        if (productionWorkerRef.current) return;
        try {
            const worker = new Worker(new URL('../production.worker.js', import.meta.url), { type: 'module' });
            productionWorkerRef.current = worker;
            worker.onmessage = (e) => {
                const { type, results: res, flatRows: wFlat, flatDowntimeRows: wDowntime, error } = e.data || {};
                if (error) { setParseError(error); setIsParsing(false); return; }
                if (type === 'parseFiles') { setResults(res || []); persistStateKey(STORAGE_KEY, res || []); setIsParsing(false); }
                else if (type === 'calculateFlatRows') { setFlatRows(wFlat || []); setFlatDowntimeRows(wDowntime || []); }
            };
            worker.onerror = (err) => { setParseError(err?.message || 'Ошибка воркера'); setIsParsing(false); };
        } catch (err) { setParseError(`Ошибка инициализации воркера: ${err.message}`); }
        return () => { try { productionWorkerRef.current?.terminate(); } catch (_) {} productionWorkerRef.current = null; };
    }, [persistStateKey]);

    useEffect(() => { window.__receiveProductionFiles = async (files) => { if (Array.isArray(files)) await processFiles(files); }; return () => { delete window.__receiveProductionFiles; }; }, [processFiles]);
    useEffect(() => { const onMessage = async (e) => { if (e.origin !== window.location.origin) return; const { type, files } = e.data || {}; if (type === 'productionFiles' && Array.isArray(files)) await processFiles(files); }; window.addEventListener('message', onMessage); return () => window.removeEventListener('message', onMessage); }, [processFiles]);

    useEffect(() => {
        const stored = contextProductionResults;
        if (stored?.length > 0) {
            setResults(stored);
            if (productionWorkerRef.current) {
                const excluded = contextExcludedTypes instanceof Set ? contextExcludedTypes : new Set(Array.isArray(contextExcludedTypes) ? contextExcludedTypes : []);
                productionWorkerRef.current.postMessage({ type: 'calculateFlatRows', requestId: ++productionWorkerReqIdRef.current, payload: { results: stored, excludedDowntimeTypes: Array.from(excluded) } });
            }
        }
    }, [contextProductionResults, contextExcludedTypes]);

    useEffect(() => { const from = contextExcludedTypes instanceof Set ? contextExcludedTypes : new Set(Array.isArray(contextExcludedTypes) ? contextExcludedTypes : []); if (from.size > 0) setExcludedDowntimeTypes(from); }, [contextExcludedTypes]);

    useEffect(() => {
        if (!productionWorkerRef.current || results.length === 0) return;
        productionWorkerRef.current.postMessage({ type: 'calculateFlatRows', requestId: ++productionWorkerReqIdRef.current, payload: { results, excludedDowntimeTypes: Array.from(excludedDowntimeTypes) } });
    }, [excludedDowntimeTypes, results]);

    useEffect(() => {
        const handleClickOutside = (e) => { if (downtimeSelectorRef.current && !downtimeSelectorRef.current.contains(e.target)) setIsDowntimeSelectorOpen(false); };
        if (isDowntimeSelectorOpen) { document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }
    }, [isDowntimeSelectorOpen]);

    useEffect(() => { const style = document.createElement('style'); style.textContent = '@keyframes pieGrow { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }'; document.head.appendChild(style); return () => { if (document.head.contains(style)) document.head.removeChild(style); }; }, []);

    const setExcludedDowntimeTypesAndPersist = useCallback((newSet) => { setExcludedDowntimeTypes(newSet); persistStateKey(STORAGE_KEYS.PRODUCTION_EXCLUDED_DOWNTIME_TYPES, Array.from(newSet)); }, [persistStateKey]);

    return {
        fileInputRef,
        results,
        isParsing,
        parseError,
        filterLine,
        setFilterLine,
        filterDate,
        setFilterDate,
        filterProduct,
        setFilterProduct,
        activeTab,
        setActiveTab,
        reportError,
        reportDates,
        setReportDates,
        reportTargets,
        setReportTargets,
        excludedDowntimeTypes,
        setExcludedDowntimeTypes: setExcludedDowntimeTypesAndPersist,
        isDowntimeSelectorOpen,
        setIsDowntimeSelectorOpen,
        downtimeSelectorRef,
        flatRows,
        flatDowntimeRows,
        expandedCharts,
        setExpandedCharts,
        lineSlideIndex,
        setLineSlideIndex,
        isLineSlideVisible,
        uniqueLines,
        uniqueDowntimeTypes,
        uniqueDates,
        filteredRows,
        filteredDowntimeRows,
        lineSlides,
        sortedReportDates,
        reportLineSlides,
        lineDailySeries,
        chartData,
        processFiles,
        handleFileChange,
        openHtmlReport,
        downloadHtmlReport,
        persistStateKey,
        STORAGE_KEYS
    };
}

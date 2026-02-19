import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Factory, FileUp, Loader2, Search, Filter, X, ChevronDown, Check, BarChart3, TrendingUp, ChevronRight, RefreshCw, Clock, Printer } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { STORAGE_KEYS } from '../../utils';
import {
    ALL_CATEGORIES,
    getDefaultLineNorms,
    getLineNumberFromRow,
    compareDowntimesToNorms,
    computePlanByLineDate,
    isPlannedDowntime
} from '../../utils/normsComparison';
// Палитра отчёта: цвет и HEX для категорий простоев
// Полуночный синий #003366 — база/план | Стальной серый #546E7A — нейтральный | Темный изумруд #00695C — успех
// Винный #880E4F — риски | Глубокий охристый #B8860B — умеренные результаты | Темный индиго #283593 — инновации | Аспидно-сизый #37474F — итоги
const DOWNTIME_CATEGORY_COLORS = {
    'КИПиА':           { class: 'bg-[#283593]', hex: '#283593' }, // Темный индиго — инновации
    'Механические':    { class: 'bg-[#880E4F]', hex: '#880E4F' }, // Винный — риски
    'Энергетические':  { class: 'bg-[#B8860B]', hex: '#B8860B' }, // Глубокий охристый
    'Организационные': { class: 'bg-[#546E7A]', hex: '#546E7A' }, // Стальной серый — нейтральный
    'Сервисные':       { class: 'bg-[#00695C]', hex: '#00695C' }, // Темный изумруд — успех
    'Технологические': { class: 'bg-[#37474F]', hex: '#37474F' }, // Аспидно-сизый — итоги
    'Плановые':        { class: 'bg-[#003366]', hex: '#003366' }  // Полуночный синий — план/база
};

const FALLBACK_CATEGORY_COLORS = [
    'bg-red-400', 'bg-pink-400', 'bg-cyan-400', 'bg-yellow-400', 'bg-gray-400'
];
const FALLBACK_CATEGORY_HEX = {
    'bg-red-400': '#f87171', 'bg-pink-400': '#f472b6', 'bg-cyan-400': '#22d3ee',
    'bg-yellow-400': '#facc15', 'bg-gray-400': '#9ca3af'
};

/** Цвет сегмента «Доступное время» на графиках (100% = work time) */
const AVAILABLE_TIME_COLOR = '#22c55e';

const CATEGORY_KEYS = Object.keys(DOWNTIME_CATEGORY_COLORS);

/** Нормализация названия категории для подстановки цвета: trim + поиск по ключам без учёта регистра */
const resolveCategoryKey = (category) => {
    const raw = (category || '').trim();
    if (!raw) return null;
    if (DOWNTIME_CATEGORY_COLORS[raw]) return raw;
    const lower = raw.toLowerCase();
    const found = CATEGORY_KEYS.find((k) => k.toLowerCase() === lower);
    return found || null;
};

const getCategoryColor = (category) => {
    const key = resolveCategoryKey(category);
    if (key) return DOWNTIME_CATEGORY_COLORS[key].class;
    let hash = 0;
    const str = (category || '');
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return FALLBACK_CATEGORY_COLORS[Math.abs(hash) % FALLBACK_CATEGORY_COLORS.length];
};

const getCategoryColorHex = (category) => {
    if (category === 'Доступное время') return AVAILABLE_TIME_COLOR;
    const key = resolveCategoryKey(category);
    if (key) return DOWNTIME_CATEGORY_COLORS[key].hex;
    const className = getCategoryColor(category);
    return FALLBACK_CATEGORY_HEX[className] || '#94a3b8';
};

/** Естественная сортировка: 1, 2, 10 вместо 1, 10, 2 */
const naturalCompare = (a, b) => {
    const sa = String(a ?? '');
    const sb = String(b ?? '');
    const partsA = sa.split(/(\d+)/).filter(Boolean);
    const partsB = sb.split(/(\d+)/).filter(Boolean);
    for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
        const pa = partsA[i];
        const pb = partsB[i];
        const na = parseInt(pa, 10);
        const nb = parseInt(pb, 10);
        if (!isNaN(na) && !isNaN(nb)) {
            if (na !== nb) return na - nb;
        } else {
            const cmp = pa.localeCompare(pb, undefined, { numeric: true });
            if (cmp !== 0) return cmp;
        }
    }
    return partsA.length - partsB.length;
};

const buildConicGradient = (segments) => {
    if (!segments || segments.length === 0) return 'conic-gradient(#e2e8f0 0% 100%)';
    let current = 0;
    const parts = segments.map((seg) => {
        const start = current;
        const end = current + seg.percent;
        current = end;
        return `${seg.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
};

const LINE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function NormsTab({ productionLineNorms, setProductionLineNorms, flatDowntimeRows }) {
    const [currentLine, setCurrentLine] = useState('1');
    const lineNorms = productionLineNorms || getDefaultLineNorms(LINE_NUMBERS);
    const normsForLine = lineNorms[currentLine] || {};
    const lineOptions = useMemo(() => {
        const fromData = new Set();
        (flatDowntimeRows || []).forEach((row) => {
            const num = getLineNumberFromRow(row);
            if (num) fromData.add(num);
        });
        const combined = new Set([...LINE_NUMBERS.map(String), ...fromData]);
        return Array.from(combined).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }, [flatDowntimeRows]);

    const handleNormChange = (cat, value) => {
        const num = parseInt(value, 10);
        setProductionLineNorms((prev) => {
            const base = prev ?? getDefaultLineNorms(LINE_NUMBERS);
            return {
                ...base,
                [currentLine]: { ...(base[currentLine] || {}), [cat]: Number.isNaN(num) ? 0 : num },
            };
        });
    };

    const { comparison, other } = useMemo(
        () => compareDowntimesToNorms(flatDowntimeRows || [], lineNorms),
        [flatDowntimeRows, lineNorms]
    );

    return (
        <div className="p-6 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Нормативы плановых остановок (мин)</h3>
                <div className="flex items-center gap-4 mb-4">
                    <label className="text-sm font-medium text-slate-700">Линия:</label>
                    <select
                        value={currentLine}
                        onChange={(e) => setCurrentLine(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white text-slate-800 min-w-[100px]"
                    >
                        {lineOptions.map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Категория</th>
                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Норма (мин)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {ALL_CATEGORIES.map((cat) => (
                                <tr key={cat}>
                                    <td className="px-4 py-2 text-slate-700">{cat}</td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={normsForLine[cat] ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value.replace(/\D/g, '');
                                                handleNormChange(cat, v === '' ? '' : v);
                                            }}
                                            className="rounded border border-slate-300 px-2 py-1 text-sm bg-white text-slate-800 w-24"
                                            placeholder="0"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-slate-500 mt-2">Нормативы сохраняются при изменении.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Сравнение с нормативами</h3>
                {!flatDowntimeRows || flatDowntimeRows.length === 0 ? (
                    <p className="text-sm text-slate-500">Загрузите файлы производства, чтобы увидеть сравнение простоев с нормативами.</p>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">Факт / норма (мин)</h4>
                            {comparison.length === 0 ? (
                                <p className="text-sm text-slate-500">Нет плановых простоев с заданным нормативом и известной длительностью.</p>
                            ) : (
                                <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-auto max-h-60 font-sans whitespace-pre-wrap">
                                    {comparison.join('\n')}
                                </pre>
                            )}
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">Без нормы или не распознаны</h4>
                            {other.length === 0 ? (
                                <p className="text-sm text-slate-500">Нет таких простоев.</p>
                            ) : (
                                <pre className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-auto max-h-60 font-sans whitespace-pre-wrap">
                                    {other.join('\n')}
                                </pre>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const ProductionView = () => {
    const {
        productionResults,
        setProductionResults,
        productionExcludedDowntimeTypes,
        setProductionExcludedDowntimeTypes,
        productionLineNorms,
        setProductionLineNorms
    } = useData();
    const fileInputRef = useRef(null);
    const results = productionResults ?? [];
    const [isParsing, setIsParsing] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [parseError, setParseError] = useState('');
    const [filterLine, setFilterLine] = useState('');
    const [filterDates, setFilterDates] = useState([]);
    const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
    const [filterProduct, setFilterProduct] = useState('');
    const [activeTab, setActiveTab] = useState('production');
    const [debugPlanModalOpen, setDebugPlanModalOpen] = useState(false);
    const [debugPlanLineKey, setDebugPlanLineKey] = useState('all');
    const [debugPlanDate, setDebugPlanDate] = useState('all');
    const debugPlanPreRef = useRef(null);
    const excludedDowntimeTypes = useMemo(
        () => new Set(productionExcludedDowntimeTypes || []),
        [productionExcludedDowntimeTypes]
    );
    const [isDowntimeSelectorOpen, setIsDowntimeSelectorOpen] = useState(false);
    const downtimeSelectorRef = useRef(null);
    const dateFilterRef = useRef(null);
    
    // Worker state
    const productionWorkerRef = useRef(null);
    const productionWorkerReqIdRef = useRef(0);
    const [flatRows, setFlatRows] = useState([]);
    const [flatDowntimeRows, setFlatDowntimeRows] = useState([]);
    
    // Состояние для раскрытых графиков
    const [chartsDetailMode, setChartsDetailMode] = useState('summary'); // 'summary' | 'unplanned' — во втором режиме в категориях показываем вклад неплановых остановок
    const [offerPrintOnOpen, setOfferPrintOnOpen] = useState(true); // при открытии отчёта сразу предлагать печать
    const [expandedCharts, setExpandedCharts] = useState({
        byDate: new Set(),
        byLine: new Set(),
        byProduct: new Set()
    });
    const [lineSlideIndex, setLineSlideIndex] = useState(0);
    const [isLineSlideVisible, setIsLineSlideVisible] = useState(true);

    // Выбранные файлы: ref для сессии, state для отображения и кнопки «Обновить»
    const lastSelectedFilesRef = useRef([]);
    /** Последние известные mtime по путям (для автопроверки изменений в Electron) */
    const lastMtimesRef = useRef({});
    const productionCheckIntervalRef = useRef(null);
    const runCheckRef = useRef(null);
    /** Для фонового слияния: при получении parseFiles ответа мержим только эти файлы */
    const pendingBackgroundMergeRef = useRef(null);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncStatus, setSyncStatus] = useState({
        lastCheckAt: null,
        nextCheckAt: null,
        fileStats: [],
        lastReloadAt: null,
        error: null,
        checking: false,
    });
    const [selectedFileNames, setSelectedFileNames] = useState(() => {
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.PRODUCTION_SELECTED_FILE_NAMES) : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch (_) {}
        return [];
    });
    const [hasFilesInRef, setHasFilesInRef] = useState(false);
    const [selectedFilePaths, setSelectedFilePaths] = useState([]);

    const isElectron = typeof window !== 'undefined' && window.electronAPI;
    const basename = (p) => String(p).replace(/^.*[/\\]/, '');

    const processFiles = useCallback(async (files, options = {}) => {
        if (!files || files.length === 0) return;
        const silent = options.silent === true;
        setIsUpdating(true);

        if (!silent) {
            setIsParsing(true);
            setParseError('');
            setProductionResults([]);
            setFlatRows([]);
            setFlatDowntimeRows([]);
        }

        try {
            const worker = productionWorkerRef.current;
            if (!worker) {
                setParseError('Worker не инициализирован');
                setIsUpdating(false);
                if (!silent) setIsParsing(false);
                return;
            }

            // Подготавливаем данные файлов для воркера (File или { arrayBuffer, fileName } из Electron)
            const filesData = [];
            const transferables = [];
            for (const file of files) {
                try {
                    let data;
                    let fileName;
                    if (file.arrayBuffer != null && file.fileName != null) {
                        data = file.arrayBuffer instanceof ArrayBuffer ? file.arrayBuffer : file.arrayBuffer;
                        fileName = file.fileName;
                    } else {
                        data = await file.arrayBuffer();
                        fileName = file.name;
                    }
                    if (!data || data.byteLength === 0) {
                        throw new Error(`Файл ${fileName} пуст или поврежден`);
                    }
                    filesData.push({
                        data: data,
                        fileName: fileName
                    });
                    transferables.push(data);
                } catch (fileErr) {
                    const name = file.fileName ?? file.name ?? '?';
                    throw new Error(`Ошибка чтения файла ${name}: ${fileErr.message}`);
                }
            }

            if (filesData.length === 0) {
                throw new Error('Нет файлов для обработки');
            }

            // Таймаут для обнаружения зависаний (в silent-режиме спиннер не показываем)
            const timeoutId = setTimeout(() => {
                console.error('Таймаут при обработке файлов');
                setParseError('Таймаут: обработка файлов занимает слишком много времени. Попробуйте загрузить файлы по одному.');
                setIsUpdating(false);
                if (!silent) setIsParsing(false);
            }, 120000); // 2 минуты

            const requestId = ++productionWorkerReqIdRef.current;

            // Сохраняем обработчик для очистки таймаута
            const timeoutRef = { current: timeoutId };
            const originalOnMessage = worker.onmessage;

            // Временно перехватываем сообщения для очистки таймаута
            worker.onmessage = (e) => {
                const { requestId: msgRequestId } = e.data || {};

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
            setIsUpdating(false);
            if (!silent) setIsParsing(false);
        }
    }, []);


    const uniqueLines = useMemo(() => {
        const lines = new Set([
            ...flatRows.map(r => r.line),
            ...flatDowntimeRows.map(r => r.line)
        ]);
        return Array.from(lines).sort(naturalCompare);
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
        return Array.from(dates).sort(naturalCompare);
    }, [results]);

    const { planByLineDate, factByLineDate, debugByLineDate, workTimeByLineDate, availableByLineDate, normsBreakdownByLineDate } = useMemo(() => {
        return computePlanByLineDate(
            flatRows,
            flatDowntimeRows,
            productionLineNorms ?? getDefaultLineNorms(LINE_NUMBERS)
        );
    }, [flatRows, flatDowntimeRows, productionLineNorms]);

    const filteredRows = useMemo(() => {
        return flatRows.filter(row => {
            if (filterLine && row.line !== filterLine) return false;
            if (filterDates.length > 0 && !filterDates.includes(row.date)) return false;
            if (filterProduct && !row.product.toLowerCase().includes(filterProduct.toLowerCase())) return false;
            return true;
        });
    }, [flatRows, filterLine, filterDates, filterProduct]);

    const filteredDowntimeRows = useMemo(() => {
        return flatDowntimeRows.filter(row => {
            if (filterLine && row.line !== filterLine) return false;
            if (filterDates.length > 0 && !filterDates.includes(row.date)) return false;
            if (filterProduct) {
                const search = filterProduct.toLowerCase();
                const match = [
                    row.category,
                    row.type,
                    row.description,
                    row.comment
                ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
                if (!match) return false;
            }
            return true;
        });
    }, [flatDowntimeRows, filterLine, filterDates, filterProduct]);

    const buildLineSlidesForDates = useCallback((dates) => {
        if (!dates || dates.length === 0) return [];
        const dateSet = new Set(dates);
        const rowsForDates = flatRows.filter(row => dateSet.has(row.date));
        const downtimesForDates = flatDowntimeRows.filter(row => dateSet.has(row.date));
        const lines = Array.from(new Set(rowsForDates.map(r => r.line))).sort(naturalCompare);
        return lines.map((line) => {
            const lineKey = getLineNumberFromRow({ line });
            const lineRows = rowsForDates.filter(r => r.line === line);
            const lineDowntimes = downtimesForDates.filter(d => d.line === line);
            let plan = 0;
            let fact = 0;
            if (lineKey && planByLineDate[lineKey]) {
                for (const date of dates) {
                    plan += planByLineDate[lineKey][date] ?? 0;
                    fact += factByLineDate[lineKey] ? (factByLineDate[lineKey][date] ?? 0) : 0;
                }
            }

            // Рассчитываем среднюю скорость линии (среднее арифметическое всех скоростей продуктов)
            const speeds = lineRows.map(r => r.speed || 0).filter(s => s > 0);
            const avgSpeed = speeds.length > 0
                ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length
                : 0;

            const downtimeMap = new Map();
            /** По категории: описание -> { minutes, comments[] } */
            const descriptionDataMap = new Map();
            lineDowntimes
                .filter(d => !excludedDowntimeTypes.has(String(d.type || '').trim()))
                .forEach((d) => {
                    const category = d.category || 'Без категории';
                    const prev = downtimeMap.get(category) || 0;
                    const dur = d.durationMinutes || 0;
                    downtimeMap.set(category, prev + dur);
                    const desc = (d.description && String(d.description).trim()) || 'Без описания';
                    if (!descriptionDataMap.has(category)) descriptionDataMap.set(category, new Map());
                    const catDesc = descriptionDataMap.get(category);
                    if (!catDesc.has(desc)) catDesc.set(desc, { minutes: 0, comments: [] });
                    const data = catDesc.get(desc);
                    data.minutes += dur;
                    const comment = (d.comment && String(d.comment).trim()) || '';
                    if (comment && !data.comments.includes(comment)) data.comments.push(comment);
                });
            const downtimeList = Array.from(downtimeMap.entries())
                .map(([category, minutes]) => {
                    const underproduction = avgSpeed > 0
                        ? Math.round((minutes / 60) * avgSpeed)
                        : 0;
                    const descToData = descriptionDataMap.get(category) || new Map();
                    const descriptionsWithMinutes = Array.from(descToData.entries())
                        .map(([description, data]) => ({
                            description: description || 'Без описания',
                            minutes: Math.round(data.minutes),
                            comments: (data.comments || []).filter(Boolean)
                        }))
                        .sort((a, b) => b.minutes - a.minutes);
                    return {
                        category,
                        minutes: Math.round(minutes),
                        underproduction,
                        color: getCategoryColorHex(category),
                        descriptions: descriptionsWithMinutes.map(({ description }) => description),
                        descriptionsWithMinutes
                    };
                })
                .filter(item => item.minutes > 0)
                .sort((a, b) => b.minutes - a.minutes);
            const totalDowntimeMinutes = downtimeList.reduce((sum, item) => sum + item.minutes, 0);
            const segments = downtimeList.map(item => ({
                ...item,
                percent: totalDowntimeMinutes > 0 ? (item.minutes / totalDowntimeMinutes) * 100 : 0
            }));
            const efficiency = plan > 0 ? Math.round((fact / plan) * 100) : 0;
            return {
                line,
                plan,
                fact,
                segments,
                downtimeList,
                efficiency,
                totalDowntimeMinutes
            };
        });
    }, [flatRows, flatDowntimeRows, excludedDowntimeTypes, planByLineDate, factByLineDate]);

    const lineSlides = useMemo(() => {
        const datesToUse = filterDates.length > 0 ? filterDates : uniqueDates;
        if (!datesToUse || datesToUse.length === 0) return [];
        return buildLineSlidesForDates(datesToUse);
    }, [buildLineSlidesForDates, filterDates, uniqueDates]);

    useEffect(() => {
        setLineSlideIndex(0);
    }, [filterDates, lineSlides.length]);

    useEffect(() => {
        setIsLineSlideVisible(false);
        const id = setTimeout(() => setIsLineSlideVisible(true), 50);
        return () => clearTimeout(id);
    }, [lineSlideIndex, filterDates]);

    // Данные для графиков — план/факт из planByLineDate/factByLineDate
    const chartData = useMemo(() => {
        const byDate = new Map();
        const byLine = new Map();
        const byProduct = new Map();

        const lineKeysByDate = new Map();
        const datesByLine = new Map();
        filteredRows.forEach(row => {
            const lineKey = getLineNumberFromRow(row);
            if (!byDate.has(row.date)) {
                byDate.set(row.date, { plan: 0, fact: 0, count: 0, downtimeByCategory: new Map(), unplannedByCategory: new Map() });
            }
            if (!lineKeysByDate.has(row.date)) lineKeysByDate.set(row.date, new Set());
            if (lineKey) lineKeysByDate.get(row.date).add(lineKey);
            if (!byLine.has(row.line)) {
                byLine.set(row.line, { plan: 0, fact: 0, count: 0, downtimeByCategory: new Map(), unplannedByCategory: new Map() });
            }
            if (!datesByLine.has(row.line)) datesByLine.set(row.line, new Set());
            datesByLine.get(row.line).add(row.date);
            if (!byProduct.has(row.product)) {
                byProduct.set(row.product, { plan: 0, fact: 0, count: 0, downtimeByCategory: new Map(), unplannedByCategory: new Map() });
            }
            byDate.get(row.date).count += 1;
            byLine.get(row.line).count += 1;
            byProduct.get(row.product).count += 1;
        });

        byDate.forEach((data, date) => {
            const lineKeys = lineKeysByDate.get(date);
            if (lineKeys) {
                lineKeys.forEach(lk => {
                    data.plan += planByLineDate[lk]?.[date] ?? 0;
                    data.fact += factByLineDate[lk]?.[date] ?? 0;
                });
            }
        });
        byLine.forEach((data, line) => {
            const lineKey = getLineNumberFromRow({ line });
            const dates = datesByLine.get(line);
            if (lineKey && dates) {
                dates.forEach(date => {
                    data.plan += planByLineDate[lineKey]?.[date] ?? 0;
                    data.fact += factByLineDate[lineKey]?.[date] ?? 0;
                });
            }
        });

        byDate.forEach((data, date) => {
            const lineKeys = lineKeysByDate.get(date);
            if (!lineKeys || !workTimeByLineDate) return;
            data.workTime = 0;
            data.available = 0;
            data.normsBreakdown = {};
            lineKeys.forEach(lk => {
                data.workTime += workTimeByLineDate[lk]?.[date] ?? 0;
                data.available += availableByLineDate[lk]?.[date] ?? 0;
                const nb = normsBreakdownByLineDate[lk]?.[date];
                if (nb && typeof nb === 'object') {
                    Object.entries(nb).forEach(([cat, mins]) => {
                        data.normsBreakdown[cat] = (data.normsBreakdown[cat] || 0) + mins;
                    });
                }
            });
        });
        byLine.forEach((data, line) => {
            const lineKey = getLineNumberFromRow({ line });
            const dates = datesByLine.get(line);
            if (!lineKey || !dates || !workTimeByLineDate?.[lineKey]) return;
            data.workTime = 0;
            data.available = 0;
            data.normsBreakdown = {};
            dates.forEach(date => {
                data.workTime += workTimeByLineDate[lineKey][date] ?? 0;
                data.available += availableByLineDate[lineKey]?.[date] ?? 0;
                const nb = normsBreakdownByLineDate[lineKey]?.[date];
                if (nb && typeof nb === 'object') {
                    Object.entries(nb).forEach(([cat, mins]) => {
                        data.normsBreakdown[cat] = (data.normsBreakdown[cat] || 0) + mins;
                    });
                }
            });
        });

        const rowCountByLineDate = new Map();
        filteredRows.forEach(row => {
            const lineKey = getLineNumberFromRow(row);
            if (!lineKey) return;
            const key = `${lineKey}\t${row.date}`;
            rowCountByLineDate.set(key, (rowCountByLineDate.get(key) || 0) + 1);
        });
        filteredRows.forEach(row => {
            const lineKey = getLineNumberFromRow(row);
            const fact = typeof row.qty === 'number' ? row.qty : 0;
            const key = lineKey ? `${lineKey}\t${row.date}` : null;
            const count = key ? rowCountByLineDate.get(key) || 1 : 1;
            const planShare = (lineKey && planByLineDate[lineKey]?.[row.date] != null)
                ? planByLineDate[lineKey][row.date] / count
                : 0;
            const productData = byProduct.get(row.product);
            if (productData) {
                productData.plan += planShare;
                productData.fact += fact;
            }
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
                        if (!isPlannedDowntime(downtime)) {
                            if (!dateData.unplannedByCategory.has(category)) {
                                dateData.unplannedByCategory.set(category, []);
                            }
                            dateData.unplannedByCategory.get(category).push({
                                type: downtime.type || '',
                                description: description || '',
                                durationMinutes: duration,
                                line: downtime.line,
                                comment: downtime.comment || '',
                                start: downtime.start || '',
                                end: downtime.end || '',
                                shift: downtime.shift || ''
                            });
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
                        if (!isPlannedDowntime(downtime)) {
                            if (!lineData.unplannedByCategory.has(category)) {
                                lineData.unplannedByCategory.set(category, []);
                            }
                            lineData.unplannedByCategory.get(category).push({
                                type: downtime.type || '',
                                description: description || '',
                                durationMinutes: duration,
                                date: downtime.date,
                                comment: downtime.comment || '',
                                start: downtime.start || '',
                                end: downtime.end || '',
                                shift: downtime.shift || ''
                            });
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
                            if (!isPlannedDowntime(downtime)) {
                                if (!productData.unplannedByCategory.has(category)) {
                                    productData.unplannedByCategory.set(category, []);
                                }
                                productData.unplannedByCategory.get(category).push({
                                    type: downtime.type || '',
                                    description: description || '',
                                    durationMinutes: duration,
                                    date: downtime.date,
                                    line: downtime.line,
                                    comment: downtime.comment || '',
                                    start: downtime.start || '',
                                    end: downtime.end || '',
                                    shift: downtime.shift || ''
                                });
                            }
                        }
                    });
                });

        const processData = (keyValue, data, key) => {
            const efficiency = data.plan > 0 ? Math.round((data.fact / data.plan) * 100) : 0;
            let downtimeCategories;
            if ((key === 'date' || key === 'line') && data.workTime != null && data.workTime > 0 && data.available != null && data.normsBreakdown) {
                const workTime = data.workTime;
                if (chartsDetailMode === 'summary') {
                    const available = Math.round(data.available);
                    const normsBreakdown = data.normsBreakdown;
                    const segments = [
                        { category: 'Доступное время', minutes: available, percent: workTime > 0 ? Math.round((available / workTime) * 10000) / 100 : 0, descriptions: [] }
                    ];
                    Object.entries(normsBreakdown)
                        .filter(([, mins]) => mins > 0)
                        .sort((a, b) => b[1] - a[1])
                        .forEach(([category, mins]) => {
                            segments.push({
                                category,
                                minutes: Math.round(mins),
                                percent: workTime > 0 ? Math.round((mins / workTime) * 10000) / 100 : 0,
                                descriptions: []
                            });
                        });
                    downtimeCategories = segments;
                } else {
                    // Режим «С вкладом неплановых»: полоски по сырым категориям (КИПиА, Механические и т.д.)
                    const rawEntries = Array.from((data.downtimeByCategory || new Map()).entries())
                        .map(([category, catData]) => ({
                            category,
                            minutes: Math.round(catData.minutes || 0),
                            descriptions: catData.descriptions || []
                        }))
                        .filter(d => d.minutes > 0)
                        .sort((a, b) => b.minutes - a.minutes);
                    const totalRawDowntime = rawEntries.reduce((sum, d) => sum + d.minutes, 0);
                    const availableMinutes = Math.max(0, workTime - totalRawDowntime);
                    const segments = [
                        { category: 'Доступное время', minutes: availableMinutes, percent: workTime > 0 ? Math.round((availableMinutes / workTime) * 10000) / 100 : 0, descriptions: [] }
                    ];
                    rawEntries.forEach(({ category, minutes, descriptions }) => {
                        segments.push({
                            category,
                            minutes,
                            percent: workTime > 0 ? Math.round((minutes / workTime) * 10000) / 100 : 0,
                            descriptions
                        });
                    });
                    downtimeCategories = segments;
                }
            } else {
                const downtimeCategoriesRaw = Array.from((data.downtimeByCategory || new Map()).entries())
                    .map(([category, catData]) => ({
                        category,
                        minutes: Math.round(catData.minutes || 0),
                        descriptions: catData.descriptions || []
                    }))
                    .filter(d => d.minutes > 0);
                const totalDowntimeMinutes = downtimeCategoriesRaw.reduce((sum, d) => sum + d.minutes, 0);
                downtimeCategories = downtimeCategoriesRaw
                    .map(d => ({
                        ...d,
                        percent: totalDowntimeMinutes > 0 ? Math.round((d.minutes / totalDowntimeMinutes) * 10000) / 100 : 0
                    }))
                    .sort((a, b) => b.percent - a.percent);
                const totalDowntimePercent = downtimeCategories.reduce((sum, d) => sum + d.percent, 0);
                const maxDowntimePercent = Math.max(0, 100 - efficiency);
                const scale = totalDowntimePercent > maxDowntimePercent && totalDowntimePercent > 0 ? maxDowntimePercent / totalDowntimePercent : 1;
                downtimeCategories = downtimeCategories.map(d => ({ ...d, percent: Math.round(d.percent * scale * 100) / 100 }));
            }
            return {
                [key]: keyValue,
                plan: Math.round(data.plan),
                fact: Math.round(data.fact),
                efficiency,
                count: data.count,
                downtimeCategories,
                unplannedByCategory: data.unplannedByCategory
                    ? Object.fromEntries(Array.from(data.unplannedByCategory.entries()))
                    : {}
            };
        };

        return {
            byDate: Array.from(byDate.entries())
                .map(([date, data]) => processData(date, data, 'date'))
                .filter(item => item.date)
                .sort((a, b) => naturalCompare(a.date, b.date)),
            byLine: Array.from(byLine.entries())
                .map(([line, data]) => processData(line, data, 'line'))
                .filter(item => item.line)
                .sort((a, b) => naturalCompare(a.line, b.line)),
            byProduct: Array.from(byProduct.entries())
                .map(([product, data]) => processData(product, data, 'product'))
                .filter(item => item.product) // Фильтруем элементы без продукта
                .sort((a, b) => b.fact - a.fact)
                .slice(0, 15) // Топ 15 продуктов
        };
    }, [filteredRows, filteredDowntimeRows, excludedDowntimeTypes, planByLineDate, factByLineDate, workTimeByLineDate, availableByLineDate, normsBreakdownByLineDate, chartsDetailMode]);

    /** Экспорт отчёта «Доля неплановых простоев» в оформленном виде для печати */
    const openUnplannedReportPrint = useCallback(() => {
        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const parts = [];

        parts.push('<div class="report">');
        parts.push('<h1 class="report-title">Доля неплановых простоев</h1>');
        parts.push('<div class="report-meta">Сформировано: ' + esc(new Date().toLocaleString('ru')) + '</div>');

        const shiftClass = (s) => (s && String(s).trim() === 'Ночь' ? ' shift-night' : (s && String(s).trim() === 'День' ? ' shift-day' : ''));
        const shiftLabel = (s) => (s && (String(s).trim() === 'День' || String(s).trim() === 'Ночь') ? ' [' + String(s).trim() + '] ' : '');
        const renderItem = (item, keyLabel) => {
            const keyValue = item[keyLabel];
            const headerLabel = keyLabel === 'line'
                ? (/^Линия\s/i.test(String(keyValue)) ? keyValue : 'Линия ' + keyValue)
                : keyValue;
            const buf = [];
            buf.push('<div class="item-block">');
            buf.push('<div class="item-header">');
            buf.push('<div class="item-date"><strong>' + esc(headerLabel) + '</strong></div>');
            buf.push('<div class="item-kpis">');
            buf.push('<span class="kpi"><span class="kpi-label">План</span> ' + (item.plan || 0).toLocaleString('ru') + '</span>');
            buf.push('<span class="kpi"><span class="kpi-label">Факт</span> ' + (item.fact || 0).toLocaleString('ru') + '</span>');
            buf.push('<span class="kpi kpi-eff"><span class="kpi-label">Эфф.</span> <strong>' + (item.efficiency ?? 0) + '%</strong></span>');
            buf.push('</div>');
            buf.push('</div>');
            if (item.downtimeCategories && item.downtimeCategories.length > 0) {
                buf.push('<div class="item-detail-title">Детализация простоев</div>');
                for (const d of item.downtimeCategories) {
                    buf.push('<div class="item-category-row"><div class="item-category-name"><strong>' + esc(d.category) + '</strong></div><div class="item-category-min">' + (d.minutes || 0) + ' мин</div><div class="item-category-pct">' + (d.percent ?? 0).toFixed(2) + '%</div></div>');
                    const unplanned = (item.unplannedByCategory && item.unplannedByCategory[d.category]) || [];
                    if (unplanned.length > 0) {
                        if (keyLabel === 'line') {
                            for (const s of unplanned) {
                                const descParts = [s.type, s.description].filter(Boolean);
                                if (descParts[0] === d.category) descParts.shift();
                                const desc = descParts.map((x) => esc(x)).join(' — ') || '';
                                const commentPart = (s.comment && String(s.comment).trim()) ? ' — ' + esc(s.comment) : '';
                                const timeRange = (s.start && s.end) ? ' ' + esc(s.start) + ' - ' + esc(s.end) : '';
                                const sc = shiftClass(s.shift);
                                const sl = shiftLabel(s.shift);
                                buf.push('<div class="item-unplanned-line' + sc + '">— ' + esc(d.category) + sl + '— ' + desc + timeRange + ' · ' + (s.durationMinutes ?? 0) + ' мин' + commentPart + '</div>');
                            }
                        } else {
                            const byLine = new Map();
                            for (const s of unplanned) {
                                const lineKey = s.line != null && String(s.line).trim() !== '' ? String(s.line).trim() : '—';
                                if (!byLine.has(lineKey)) byLine.set(lineKey, []);
                                byLine.get(lineKey).push(s);
                            }
                            const sortedLines = Array.from(byLine.keys()).sort((a, b) => (a === '—' ? 1 : b === '—' ? -1 : String(a).localeCompare(b, undefined, { numeric: true })));
                            for (const lineKey of sortedLines) {
                                const stops = byLine.get(lineKey);
                                const lineLabel = /^Линия\s/i.test(String(lineKey)) ? lineKey : 'Линия ' + lineKey;
                                buf.push('<div class="item-line-group"><strong>' + esc(lineLabel) + '</strong></div>');
                                for (const s of stops) {
                                    const descParts = [s.type, s.description].filter(Boolean);
                                    if (descParts[0] === d.category) descParts.shift();
                                    const desc = descParts.map((x) => esc(x)).join(' — ') || '';
                                    const commentPart = (s.comment && String(s.comment).trim()) ? ' — ' + esc(s.comment) : '';
                                    const timeRange = (s.start && s.end) ? ' ' + esc(s.start) + ' - ' + esc(s.end) : '';
                                    const sc = shiftClass(s.shift);
                                    const sl = shiftLabel(s.shift);
                                    buf.push('<div class="item-unplanned-line' + sc + '">— ' + esc(d.category) + sl + '— ' + desc + timeRange + ' · ' + (s.durationMinutes ?? 0) + ' мин' + commentPart + '</div>');
                                }
                            }
                        }
                    }
                }
            }
            buf.push('</div>');
            return buf.join('\n');
        };

        parts.push('<section class="report-section">');
        parts.push('<h2 class="section-title">Разбор по линиям</h2>');
        for (const item of chartData.byLine) {
            parts.push(renderItem(item, 'line'));
        }
        parts.push('</section>');
        parts.push('</div>');

        const bodyHtml = parts.join('\n');
        const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Доля неплановых простоев</title>'
            + '<style>'
            + 'body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:18px;font-size:13px;line-height:1.45;color:#111827;background:#fff;}'
            + '.report{max-width:980px;margin:0 auto;}'
            + '.report-title{font-size:22px;font-weight:700;margin:0 0 6px;color:#0f172a;}'
            + '.report-meta{font-size:12px;color:#475569;margin-bottom:14px;}'
            + '.report-section{margin-top:10px;}'
            + '.section-title{font-size:16px;font-weight:700;margin:0 0 10px;padding:0 0 6px;border-bottom:2px solid #1f2937;color:#111827;}'
            + '.item-block{margin-bottom:10px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;break-inside:avoid;}'
            + '.item-header{display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:6px;}'
            + '.item-date{font-size:15px;color:#0f172a;}'
            + '.item-kpis{display:flex;gap:8px;flex-wrap:wrap;}'
            + '.kpi{display:inline-block;padding:2px 8px;border:1px solid #d1d5db;border-radius:999px;font-size:12px;color:#0f172a;background:#f8fafc;}'
            + '.kpi-label{color:#334155;font-weight:600;margin-right:4px;}'
            + '.kpi-eff{border-color:#94a3b8;}'
            + '.item-detail-title{font-weight:700;color:#1f2937;margin:8px 0 4px;}'
            + '.item-category-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:baseline;padding:2px 0;border-bottom:1px dotted #d1d5db;}'
            + '.item-category-name{color:#111827;}'
            + '.item-category-min,.item-category-pct{font-variant-numeric:tabular-nums;color:#334155;}'
            + '.item-line-group{margin:6px 0 2px 10px;color:#0f172a;}'
            + '.item-unplanned-line{margin:2px 0 2px 20px;padding-left:8px;border-left:2px solid #9ca3af;color:#1f2937;}'
            + '.item-unplanned-line.shift-day{border-left-color:#eab308;background:#fef9c3;}'
            + '.item-unplanned-line.shift-night{border-left-color:#3b82f6;background:#dbeafe;}'
            + '@media print{body{margin:10mm;color:#000;} .item-block{border-color:#999;} .section-title{border-bottom-color:#000;} .kpi{background:#fff;} .item-unplanned-line{border-left-color:#666;} .item-unplanned-line.shift-day{border-left-color:#b45309;background:#fef3c7;} .item-unplanned-line.shift-night{border-left-color:#1d4ed8;background:#dbeafe;}}</style></head><body>'
            + bodyHtml
            + '</body></html>';
        const w = window.open('', '_blank');
        if (w) {
            w.document.write(html);
            w.document.close();
            w.focus();
            if (offerPrintOnOpen) setTimeout(() => w.print(), 300);
        }
    }, [chartData, offerPrintOnOpen]);

    useEffect(() => {
        if (!isElectron) return;
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTION_SELECTED_FILE_PATHS);
            if (raw) {
                const paths = JSON.parse(raw);
                if (Array.isArray(paths) && paths.length > 0) {
                    setSelectedFilePaths(paths);
                    setSelectedFileNames(paths.map(basename));
                    setHasFilesInRef(true);
                }
            }
        } catch (_) {}
    }, [isElectron]);

    const handleFileChange = (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;
        lastSelectedFilesRef.current = files;
        const names = files.map(f => f.name);
        setSelectedFileNames(names);
        setHasFilesInRef(true);
        try {
            localStorage.setItem(STORAGE_KEYS.PRODUCTION_SELECTED_FILE_NAMES, JSON.stringify(names));
        } catch (_) {}
    };

    const handleSelectFiles = useCallback(async () => {
        if (isElectron && window.electronAPI) {
            try {
                const paths = await window.electronAPI.productionSelectFiles();
                if (paths && paths.length > 0) {
                    setSelectedFilePaths(paths);
                    setSelectedFileNames(paths.map(basename));
                    setHasFilesInRef(true);
                    try {
                        localStorage.setItem(STORAGE_KEYS.PRODUCTION_SELECTED_FILE_PATHS, JSON.stringify(paths));
                        localStorage.setItem(STORAGE_KEYS.PRODUCTION_SELECTED_FILE_NAMES, JSON.stringify(paths.map(basename)));
                    } catch (_) {}
                }
            } catch (err) {
                console.error('productionSelectFiles', err);
                setParseError(err?.message || 'Ошибка выбора файлов');
            }
        } else {
            fileInputRef.current?.click();
        }
    }, [isElectron]);

    const handleRefresh = useCallback(async () => {
        if (isElectron && window.electronAPI) {
            let pathsToUse = selectedFilePaths;
            if (pathsToUse.length === 0) {
                try {
                    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTION_SELECTED_FILE_PATHS);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            pathsToUse = parsed;
                            setSelectedFilePaths(parsed);
                            setSelectedFileNames(parsed.map(basename));
                            setHasFilesInRef(true);
                        }
                    }
                } catch (_) {}
            }
            if (pathsToUse.length > 0) {
                try {
                    const entries = await window.electronAPI.productionReadFiles(pathsToUse);
                    if (entries && entries.length > 0) await processFiles(entries, { silent: true });
                    else setParseError('Не удалось прочитать файлы');
                } catch (err) {
                    console.error('productionReadFiles', err);
                    setParseError(err?.message || 'Ошибка чтения файлов');
                }
            } else {
                setParseError('Сначала выберите файлы');
            }
        } else {
            const files = lastSelectedFilesRef.current;
            if (files && files.length > 0) processFiles(files, { silent: true });
            else setParseError('Сначала выберите файлы');
        }
    }, [processFiles, isElectron, selectedFilePaths]);

    /** Фоновое обновление только изменённых файлов: парсим entries и мержим в productionResults по fileName */
    const runBackgroundMerge = useCallback(async (entries, changedFileNames) => {
        const worker = productionWorkerRef.current;
        if (!worker || !entries?.length || !changedFileNames?.length) return;
        const filesData = [];
        const transferables = [];
        for (const file of entries) {
            const data = file.arrayBuffer != null
                ? (file.arrayBuffer instanceof ArrayBuffer ? file.arrayBuffer : file.arrayBuffer)
                : null;
            const fileName = file.fileName || (file.path && basename(file.path)) || '';
            if (!data || data.byteLength === 0) continue;
            filesData.push({ data, fileName });
            transferables.push(data);
        }
        if (filesData.length === 0) return;
        pendingBackgroundMergeRef.current = { changedFileNames };
        worker.postMessage(
            { type: 'parseFiles', requestId: 0, payload: { files: filesData } },
            transferables
        );
    }, []);

    // Автопроверка изменений файлов по mtime (только Electron)
    const PRODUCTION_CHECK_INTERVAL_MS = 60000;
    useEffect(() => {
        if (!isElectron || !window.electronAPI?.productionGetFileStats || selectedFilePaths.length === 0) {
            runCheckRef.current = null;
            return;
        }

        const runCheck = async () => {
            setSyncStatus((prev) => ({ ...prev, checking: true, error: null }));
            try {
                const stats = await window.electronAPI.productionGetFileStats(selectedFilePaths);
                if (!Array.isArray(stats) || stats.length === 0) {
                    setSyncStatus((prev) => ({ ...prev, checking: false }));
                    return;
                }
                const prev = lastMtimesRef.current;
                const changedPaths = [];
                for (const { path: p, mtimeMs } of stats) {
                    if (prev[p] !== mtimeMs) changedPaths.push(p);
                }
                for (const { path: p, mtimeMs } of stats) {
                    lastMtimesRef.current = { ...lastMtimesRef.current, [p]: mtimeMs };
                }
                const now = Date.now();
                const fileStats = stats.map(({ path: p, mtimeMs }) => ({
                    path: p,
                    fileName: basename(p),
                    mtimeMs,
                    updatedAt: mtimeMs != null ? new Date(mtimeMs).toLocaleString('ru') : '—',
                }));
                setSyncStatus((prev) => ({
                    ...prev,
                    lastCheckAt: now,
                    nextCheckAt: now + PRODUCTION_CHECK_INTERVAL_MS,
                    fileStats,
                    checking: false,
                    error: null,
                }));
                if (changedPaths.length > 0) {
                    const entries = await window.electronAPI.productionReadFiles(changedPaths);
                    if (entries && entries.length > 0) {
                        const changedFileNames = changedPaths.map((p) => basename(p));
                        await runBackgroundMerge(entries, changedFileNames);
                        setSyncStatus((prev) => ({ ...prev, lastReloadAt: Date.now() }));
                    }
                }
            } catch (err) {
                console.error('production mtime check', err);
                setSyncStatus((prev) => ({
                    ...prev,
                    checking: false,
                    error: err?.message || 'Ошибка проверки',
                }));
            }
        };

        runCheckRef.current = runCheck;

        const initAndSchedule = async () => {
            try {
                const stats = await window.electronAPI.productionGetFileStats(selectedFilePaths);
                if (Array.isArray(stats)) {
                    const next = {};
                    stats.forEach(({ path: p, mtimeMs }) => { next[p] = mtimeMs; });
                    lastMtimesRef.current = next;
                    const now = Date.now();
                    setSyncStatus((prev) => ({
                        ...prev,
                        lastCheckAt: now,
                        nextCheckAt: now + PRODUCTION_CHECK_INTERVAL_MS,
                        fileStats: stats.map(({ path: p, mtimeMs }) => ({
                            path: p,
                            fileName: basename(p),
                            mtimeMs,
                            updatedAt: mtimeMs != null ? new Date(mtimeMs).toLocaleString('ru') : '—',
                        })),
                    }));
                }
            } catch (_) {}
            return setInterval(runCheck, PRODUCTION_CHECK_INTERVAL_MS);
        };

        initAndSchedule().then((id) => { productionCheckIntervalRef.current = id; });
        return () => {
            runCheckRef.current = null;
            if (productionCheckIntervalRef.current != null) {
                clearInterval(productionCheckIntervalRef.current);
                productionCheckIntervalRef.current = null;
            }
        };
    }, [isElectron, selectedFilePaths, runBackgroundMerge]);

    const handleCheckNow = useCallback(() => {
        runCheckRef.current?.();
    }, []);

    // Инициализация воркера
    useEffect(() => {
        if (productionWorkerRef.current) return;

        try {
            const worker = new Worker(new URL('../../production.worker.js', import.meta.url), { type: 'module' });
            productionWorkerRef.current = worker;

            worker.onmessage = (e) => {
                const { type, requestId, results, flatRows: workerFlatRows, flatDowntimeRows: workerFlatDowntimeRows, error } = e.data || {};
                
                
                if (error) {
                    console.error('Ошибка от воркера:', error);
                    setParseError(error);
                    setIsUpdating(false);
                    setIsParsing(false);
                    return;
                }

                if (type === 'parseFiles') {
                    const pending = pendingBackgroundMergeRef.current;
                    if (pending) {
                        pendingBackgroundMergeRef.current = null;
                        setProductionResults((prev) => {
                            const base = prev ?? [];
                            const without = base.filter((r) => !pending.changedFileNames.includes(r.fileName));
                            return [...without, ...(results || [])];
                        });
                    } else {
                        setProductionResults(results || []);
                    }
                    setIsUpdating(false);
                    setIsParsing(false);
                } else if (type === 'calculateFlatRows') {
                    setFlatRows(workerFlatRows || []);
                    setFlatDowntimeRows(workerFlatDowntimeRows || []);
                }
            };

            worker.onerror = (err) => {
                console.error('Worker error:', err);
                setParseError(err?.message || 'Ошибка воркера при обработке файлов');
                setIsUpdating(false);
                setIsParsing(false);
            };

        } catch (err) {
            console.error('Ошибка при создании воркера:', err);
            setParseError(`Ошибка инициализации воркера: ${err.message}`);
        }

        return () => {
            if (productionWorkerRef.current) {
                try { 
                    productionWorkerRef.current.terminate(); 
                } catch (_) {}
                productionWorkerRef.current = null;
            }
        };
    }, []);

    // Прием данных напрямую от окна выбора файлов
    useEffect(() => {
        window.__receiveProductionFiles = async (files) => {
            if (Array.isArray(files)) {
                await processFiles(files);
            }
        };
        return () => {
            delete window.__receiveProductionFiles;
        };
    }, [processFiles]);

    // Слушатель сообщений от окна выбора файлов (fallback)
    useEffect(() => {
        const onMessage = async (event) => {
            if (event.origin !== window.location.origin) return;
            const { type, files } = event.data || {};
            if (type === 'productionFiles' && Array.isArray(files)) {
                await processFiles(files);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [processFiles]);

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
            if (dateFilterRef.current && !dateFilterRef.current.contains(event.target)) {
                setIsDateFilterOpen(false);
            }
        };
        if (isDowntimeSelectorOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isDowntimeSelectorOpen]);
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dateFilterRef.current && !dateFilterRef.current.contains(event.target)) {
                setIsDateFilterOpen(false);
            }
        };
        if (isDateFilterOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isDateFilterOpen]);

    // Добавляем CSS анимацию для пирога
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = '@keyframes pieGrow { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }';
        document.head.appendChild(style);
        return () => {
            if (document.head.contains(style)) {
                document.head.removeChild(style);
            }
        };
    }, []);

    const formatTime = (ms) => (ms != null ? new Date(ms).toLocaleString('ru') : '—');
    const [countdownTick, setCountdownTick] = useState(0);
    useEffect(() => {
        if (!showSyncModal || syncStatus.nextCheckAt == null) return;
        const id = setInterval(() => setCountdownTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [showSyncModal, syncStatus.nextCheckAt]);
    const nextCheckIn = syncStatus.nextCheckAt != null
        ? Math.max(0, Math.ceil((syncStatus.nextCheckAt - Date.now()) / 1000))
        : null;

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {showSyncModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowSyncModal(false)}>
                    <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Clock size={20} className="text-slate-500" />
                                Синхронизация файлов
                            </h3>
                            <button type="button" onClick={() => setShowSyncModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="px-6 py-4 overflow-y-auto space-y-4">
                            {syncStatus.error && (
                                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                                    {syncStatus.error}
                                </div>
                            )}
                            <div className="grid grid-cols-1 gap-2 text-sm">
                                <div className="flex justify-between text-slate-600">
                                    <span>Последняя проверка:</span>
                                    <span className="font-medium text-slate-800">{formatTime(syncStatus.lastCheckAt)}</span>
                                </div>
                                {nextCheckIn !== null && (
                                    <div className="flex justify-between text-slate-600">
                                        <span>Следующая проверка через:</span>
                                        <span className="font-medium text-slate-800">{nextCheckIn} с</span>
                                    </div>
                                )}
                                {syncStatus.lastReloadAt != null && (
                                    <div className="flex justify-between text-slate-600">
                                        <span>Данные обновлены:</span>
                                        <span className="font-medium text-green-700">{formatTime(syncStatus.lastReloadAt)}</span>
                                    </div>
                                )}
                            </div>
                            {syncStatus.fileStats.length > 0 && (
                                <div>
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Время изменения файлов</div>
                                    <ul className="space-y-2 border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                                        {syncStatus.fileStats.map(({ fileName, updatedAt, path }) => (
                                            <li key={path} className="px-4 py-2 bg-slate-50 flex justify-between items-center text-sm">
                                                <span className="font-medium text-slate-700 truncate mr-2" title={path}>{fileName}</span>
                                                <span className="text-slate-600 flex-shrink-0">{updatedAt}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex justify-between gap-3">
                            <button
                                type="button"
                                onClick={handleCheckNow}
                                disabled={syncStatus.checking}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                            >
                                {syncStatus.checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                {syncStatus.checking ? 'Проверка…' : 'Проверить сейчас'}
                            </button>
                            <button type="button" onClick={() => setShowSyncModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200">
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
                    <div className="flex items-center gap-2 flex-wrap">
                        {(isUpdating || isParsing || syncStatus?.checking) && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
                                <Loader2 size={14} className="animate-spin flex-shrink-0" />
                                <span>Обновление…</span>
                            </div>
                        )}
                        <button
                            onClick={handleSelectFiles}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                        >
                            <FileUp size={16} />
                            Выбор файлов
                        </button>
                        <button
                            onClick={handleRefresh}
                            disabled={!hasFilesInRef && !(isElectron && selectedFilePaths.length > 0)}
                            title={!(hasFilesInRef || (isElectron && selectedFilePaths.length > 0)) ? 'Сначала выберите файлы' : 'Загрузить данные из выбранных файлов'}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={16} />
                            Обновить
                        </button>
                        {isElectron && selectedFilePaths.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowSyncModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors border border-slate-200"
                                title="Статус синхронизации файлов"
                            >
                                <Clock size={16} />
                                Синхронизация
                            </button>
                        )}
                        {uniqueDowntimeTypes.length > 0 && (
                            <div className="relative" ref={downtimeSelectorRef}>
                                <button
                                    type="button"
                                    onClick={() => setIsDowntimeSelectorOpen(!isDowntimeSelectorOpen)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                    title="Виды простоев, не влияющие на план"
                                >
                                    <Filter size={16} className="text-slate-400 flex-shrink-0" />
                                    <span className="whitespace-nowrap">
                                        {excludedDowntimeTypes.size > 0
                                            ? `Искл.: ${excludedDowntimeTypes.size}`
                                            : 'Простои (искл.)'}
                                    </span>
                                    <ChevronDown size={14} className={`text-slate-400 flex-shrink-0 transition-transform ${isDowntimeSelectorOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isDowntimeSelectorOpen && (
                                    <div className="absolute z-50 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px] max-h-60 overflow-y-auto">
                                        <div className="p-2 border-b border-slate-100 text-xs font-semibold text-slate-500">Не влияющие на план</div>
                                        <div className="p-2">
                                            {uniqueDowntimeTypes.map(type => {
                                                const isSelected = excludedDowntimeTypes.has(type);
                                                return (
                                                    <label
                                                        key={type}
                                                        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer rounded transition-colors"
                                                    >
                                                        <div className={`flex-shrink-0 w-4 h-4 border-2 rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                                            {isSelected && <Check size={12} className="text-white" />}
                                                        </div>
                                                        <span className="text-sm text-slate-700 flex-1">{type}</span>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                const newSet = new Set(excludedDowntimeTypes);
                                                                if (e.target.checked) newSet.add(type);
                                                                else newSet.delete(type);
                                                                setProductionExcludedDowntimeTypes(Array.from(newSet));
                                                            }}
                                                            className="hidden"
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xls,.xlsx,.xlsm"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </div>
                {selectedFileNames.length > 0 && (
                    <div className="mt-2 text-xs text-slate-500">
                        Выбрано: {selectedFileNames.join(', ')}
                    </div>
                )}
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
                    <div className="relative" ref={dateFilterRef}>
                        <button
                            type="button"
                            onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
                            className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px] flex items-center justify-between hover:bg-slate-50"
                        >
                            <span className="flex items-center gap-2">
                                <Filter size={16} className="text-slate-400 flex-shrink-0" />
                                {filterDates.length === 0
                                    ? 'Все даты'
                                    : filterDates.length === 1
                                        ? filterDates[0]
                                        : `Выбрано: ${filterDates.length} дат`}
                            </span>
                            <ChevronDown size={16} className={`text-slate-400 flex-shrink-0 transition-transform ${isDateFilterOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isDateFilterOpen && (
                            <div className="absolute z-50 left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[200px] max-h-56 overflow-y-auto">
                                <div className="p-2 border-b border-slate-100 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFilterDates([...uniqueDates])}
                                        className="px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
                                    >
                                        Выбрать все
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterDates([])}
                                        className="px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
                                    >
                                        Сбросить
                                    </button>
                                </div>
                                <div className="p-2 grid grid-cols-1 gap-0.5">
                                    {uniqueDates.length === 0 ? (
                                        <div className="text-xs text-slate-500 py-2">Нет доступных дат</div>
                                    ) : (
                                        uniqueDates.map((date) => {
                                            const isSelected = filterDates.includes(date);
                                            return (
                                                <label key={date} className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 rounded cursor-pointer text-sm text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => {
                                                            setFilterDates((prev) =>
                                                                prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
                                                            );
                                                        }}
                                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span>{date}</span>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
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
                        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                            <button
                                onClick={() => setActiveTab('production')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    activeTab === 'production'
                                        ? 'bg-rose-600 text-white shadow-sm'
                                        : 'bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600'
                                }`}
                            >
                                Производство
                            </button>
                            <button
                                onClick={() => setActiveTab('downtime')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    activeTab === 'downtime'
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-600'
                                }`}
                            >
                                Простои
                            </button>
                            <button
                                onClick={() => setActiveTab('charts')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    activeTab === 'charts'
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                                }`}
                            >
                                <BarChart3 size={16} />
                                Графики
                            </button>
                            <button
                                onClick={() => setActiveTab('lines')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    activeTab === 'lines'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600'
                                }`}
                            >
                                Линии
                            </button>
                            <button
                                onClick={() => setActiveTab('norms')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    activeTab === 'norms'
                                        ? 'bg-teal-600 text-white shadow-sm'
                                        : 'bg-slate-50 text-slate-600 hover:bg-teal-50 hover:text-teal-600'
                                }`}
                            >
                                Нормативы
                            </button>
                            {(flatRows.length > 0 || results.length > 0) && (
                                <button
                                    type="button"
                                    onClick={() => setDebugPlanModalOpen(true)}
                                    className="ml-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200"
                                >
                                    Дебаг плана
                                </button>
                            )}
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
                                            <th className="px-4 py-3 border-b text-center">Смена</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
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
                                            <th className="px-4 py-3 border-b">Категория (H)</th>
                                            <th className="px-4 py-3 border-b">Время начала (I)</th>
                                            <th className="px-4 py-3 border-b">Время конца (J)</th>
                                            <th className="px-4 py-3 border-b">Описание (F-G)</th>
                                            <th className="px-4 py-3 border-b">Комментарий (L-N)</th>
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
                                                    <td className="px-4 py-3 text-slate-600">{row.start || '—'}</td>
                                                    <td className="px-4 py-3 text-slate-600">{row.end || '—'}</td>
                                                    <td className="px-4 py-3 text-slate-600">{row.description || '—'}</td>
                                                    <td className="px-4 py-3 text-slate-600">{row.comment || '—'}</td>
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
                                            {/* Легенда по цветам категорий простоев */}
                                            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Легенда — категории простоев</div>
                                                <div className="flex flex-wrap gap-x-6 gap-y-2">
                                                    {Object.entries(DOWNTIME_CATEGORY_COLORS).map(([name, { hex }]) => (
                                                        <div key={name} className="flex items-center gap-2">
                                                            <div
                                                                className="w-3.5 h-3.5 rounded flex-shrink-0 border border-slate-200"
                                                                style={{ backgroundColor: hex }}
                                                                aria-hidden
                                                            />
                                                            <span className="text-sm text-slate-700">{name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            {/* Режим детализации под графиками */}
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="text-sm font-medium text-slate-600">Режим детализации:</span>
                                                <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                                                    <button
                                                        type="button"
                                                        onClick={() => setChartsDetailMode('summary')}
                                                        className={`px-4 py-2 text-sm font-medium transition-colors ${chartsDetailMode === 'summary' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                                    >
                                                        Доля плановых простоев
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setChartsDetailMode('unplanned')}
                                                        className={`px-4 py-2 text-sm font-medium transition-colors ${chartsDetailMode === 'unplanned' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                                    >
                                                        Доля неплановых простоев
                                                    </button>
                                                </div>
                                                <span className="text-xs text-slate-500">
                                                    {chartsDetailMode === 'summary' ? 'Полоски и детализация по нормативным (плановым) категориям.' : 'Полоски по сырым категориям; раскройте дату или линию (▶) для списка неплановых остановок.'}
                                                </span>
                                                {chartsDetailMode === 'unplanned' && (
                                                    <div className="inline-flex items-center gap-3">
                                                        <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                                                            <input
                                                                type="checkbox"
                                                                checked={offerPrintOnOpen}
                                                                onChange={(e) => setOfferPrintOnOpen(e.target.checked)}
                                                                className="rounded border-slate-300 text-slate-700 focus:ring-slate-500"
                                                            />
                                                            Сразу предложить печать
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={openUnplannedReportPrint}
                                                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors"
                                                            title="Сформировать текстовый отчёт и открыть в новом окне для печати"
                                                        >
                                                            <Printer size={16} />
                                                            Печать (текстовый отчёт)
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
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
                                                        const isTimeBreakdown = item.downtimeCategories?.[0]?.category === 'Доступное время';
                                                        let leftOffset = isTimeBreakdown ? 0 : efficiencyPercent;
                                                        
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
                                                                    {!isTimeBreakdown && (
                                                                        /* Факт - процент от плана (только для режима без разбивки времени) */
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
                                                                    )}
                                                                    {/* Доступное время + нормативные категории (byDate) или простои по категориям */}
                                                                    {item.downtimeCategories && item.downtimeCategories.map((downtime, dIdx) => {
                                                                        const maxAvailable = isTimeBreakdown ? 100 : (100 - efficiencyPercent);
                                                                        const usedSoFar = leftOffset - (isTimeBreakdown ? 0 : efficiencyPercent);
                                                                        const remainingAvailable = maxAvailable - usedSoFar;
                                                                        const width = Math.min(downtime.percent, remainingAvailable);
                                                                        const currentLeft = leftOffset;
                                                                        if (width > 0) {
                                                                            leftOffset += width;
                                                                            return (
                                                                                <div
                                                                                    key={dIdx}
                                                                                    className="absolute top-0 h-full transition-all duration-500 border-r border-slate-300"
                                                                                    style={{ 
                                                                                        left: `${currentLeft}%`, 
                                                                                        width: `${width}%`,
                                                                                        backgroundColor: getCategoryColorHex(downtime.category)
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
                                                                                    {item.downtimeCategories.map((downtime, dIdx) => {
                                                                                        const unplannedList = chartsDetailMode === 'unplanned' && item.unplannedByCategory?.[downtime.category];
                                                                                        return (
                                                                                        <div key={dIdx} className="bg-slate-50 p-3 rounded border border-slate-200">
                                                                                            <div className="flex items-center justify-between mb-2">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className="w-3 h-3 rounded" style={{ backgroundColor: getCategoryColorHex(downtime.category) }} />
                                                                                                    <span className="text-sm font-semibold text-slate-700">{downtime.category}</span>
                                                                                                </div>
                                                                                                <span className="text-sm font-semibold text-slate-600">
                                                                                                    {downtime.minutes || 0} мин · {downtime.percent.toFixed(2)}%
                                                                                                </span>
                                                                                            </div>
                                                                                            {chartsDetailMode === 'summary' && downtime.descriptions && downtime.descriptions.length > 0 && (
                                                                                                <div className="mt-2 space-y-1">
                                                                                                    {downtime.descriptions.map((desc, descIdx) => (
                                                                                                        <div key={descIdx} className="text-xs text-slate-600 pl-5">
                                                                                                            • {desc}
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                            {chartsDetailMode === 'unplanned' && unplannedList && unplannedList.length > 0 && (
                                                                                                <div className="mt-2 space-y-1">
                                                                                                    <div className="text-xs font-medium text-slate-600 mb-1">Неплановые остановки:</div>
                                                                                                    {unplannedList.map((stop, sIdx) => {
                                                                                                        const showType = stop.type && stop.type !== downtime.category;
                                                                                                        return (
                                                                                                        <div key={sIdx} className="text-xs text-slate-600 pl-5 border-l-2 border-amber-300 py-0.5">
                                                                                                            {stop.start && stop.end && <span className="text-slate-500 font-medium">{stop.start} - {stop.end}</span>}
                                                                                                            {stop.start && stop.end && (showType || stop.description) && <span> · </span>}
                                                                                                            {showType && <span className="text-amber-700">{stop.type}</span>}
                                                                                                            {showType && stop.description && <span> — </span>}
                                                                                                            {stop.description && <span>{stop.description}</span>}
                                                                                                            <span className="text-slate-500"> · {stop.durationMinutes} мин</span>
                                                                                                            {stop.line && <span className="text-slate-400"> · линия {stop.line}</span>}
                                                                                                            {stop.comment && String(stop.comment).trim() && <span className="text-slate-500 italic"> — {stop.comment}</span>}
                                                                                                        </div>
                                                                                                        ); })}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ); })}
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
                                                        const isTimeBreakdown = item.downtimeCategories?.[0]?.category === 'Доступное время';
                                                        let leftOffset = isTimeBreakdown ? 0 : efficiencyPercent;
                                                        
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
                                                                    {!isTimeBreakdown && (
                                                                        /* Факт - процент от плана (только для режима без разбивки времени) */
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
                                                                    )}
                                                                    {/* Доступное время + нормативные категории (byLine) или простои по категориям */}
                                                                    {item.downtimeCategories && item.downtimeCategories.map((downtime, dIdx) => {
                                                                        const maxAvailable = isTimeBreakdown ? 100 : (100 - efficiencyPercent);
                                                                        const usedSoFar = leftOffset - (isTimeBreakdown ? 0 : efficiencyPercent);
                                                                        const remainingAvailable = maxAvailable - usedSoFar;
                                                                        const width = Math.min(downtime.percent, remainingAvailable);
                                                                        const currentLeft = leftOffset;
                                                                        if (width > 0) {
                                                                            leftOffset += width;
                                                                            return (
                                                                                <div
                                                                                    key={dIdx}
                                                                                    className="absolute top-0 h-full transition-all duration-500 border-r border-slate-300"
                                                                                    style={{ 
                                                                                        left: `${currentLeft}%`, 
                                                                                        width: `${width}%`,
                                                                                        backgroundColor: getCategoryColorHex(downtime.category)
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
                                                                                    {item.downtimeCategories.map((downtime, dIdx) => {
                                                                                        const unplannedListLine = chartsDetailMode === 'unplanned' && item.unplannedByCategory?.[downtime.category];
                                                                                        return (
                                                                                        <div key={dIdx} className="bg-slate-50 p-3 rounded border border-slate-200">
                                                                                            <div className="flex items-center justify-between mb-2">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className="w-3 h-3 rounded" style={{ backgroundColor: getCategoryColorHex(downtime.category) }} />
                                                                                                    <span className="text-sm font-semibold text-slate-700">{downtime.category}</span>
                                                                                                </div>
                                                                                                <span className="text-sm font-semibold text-slate-600">
                                                                                                    {downtime.minutes || 0} мин · {downtime.percent.toFixed(2)}%
                                                                                                </span>
                                                                                            </div>
                                                                                            {chartsDetailMode === 'summary' && downtime.descriptions && downtime.descriptions.length > 0 && (
                                                                                                <div className="mt-2 space-y-1">
                                                                                                    {downtime.descriptions.map((desc, descIdx) => (
                                                                                                        <div key={descIdx} className="text-xs text-slate-600 pl-5">
                                                                                                            • {desc}
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                            {chartsDetailMode === 'unplanned' && unplannedListLine && unplannedListLine.length > 0 && (
                                                                                                <div className="mt-2 space-y-1">
                                                                                                    <div className="text-xs font-medium text-slate-600 mb-1">Неплановые остановки:</div>
                                                                                                    {unplannedListLine.map((stop, sIdx) => {
                                                                                                        const showType = stop.type && stop.type !== downtime.category;
                                                                                                        return (
                                                                                                        <div key={sIdx} className="text-xs text-slate-600 pl-5 border-l-2 border-amber-300 py-0.5">
                                                                                                            {stop.start && stop.end && <span className="text-slate-500 font-medium">{stop.start} - {stop.end}</span>}
                                                                                                            {stop.start && stop.end && (showType || stop.description) && <span> · </span>}
                                                                                                            {showType && <span className="text-amber-700">{stop.type}</span>}
                                                                                                            {showType && stop.description && <span> — </span>}
                                                                                                            {stop.description && <span>{stop.description}</span>}
                                                                                                            <span className="text-slate-500"> · {stop.durationMinutes} мин</span>
                                                                                                            {stop.date && <span className="text-slate-400"> · {stop.date}</span>}
                                                                                                            {stop.comment && String(stop.comment).trim() && <span className="text-slate-500 italic"> — {stop.comment}</span>}
                                                                                                        </div>
                                                                                                        ); })}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                            ); })}
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
                            {activeTab === 'norms' && (
                                <NormsTab
                                    productionLineNorms={productionLineNorms ?? getDefaultLineNorms([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])}
                                    setProductionLineNorms={setProductionLineNorms}
                                    flatDowntimeRows={flatDowntimeRows}
                                />
                            )}
                            {activeTab === 'lines' && (
                                <div className="p-6 space-y-6">
                                    {lineSlides.length === 0 ? (
                                        uniqueDates.length === 0 ? (
                                            <div className="text-center py-12 text-slate-400">
                                                <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                                                <p className="text-lg font-medium">Нет данных</p>
                                                <p className="text-sm mt-2">Загрузите файл для просмотра линий</p>
                                            </div>
                                        ) : (
                                            <div className="text-center py-12 text-slate-400">
                                                <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                                                <p className="text-lg font-medium">Нет линий</p>
                                                <p className="text-sm mt-2">{filterDates.length > 0 ? 'На выбранные даты нет данных по линиям' : 'Нет данных по линиям'}</p>
                                            </div>
                                        )
                                    ) : (
                                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                                            <div className="flex items-center justify-between mb-6">
                                                <div>
                                                    <h3 className="text-lg font-bold text-slate-800">Линия: {lineSlides[lineSlideIndex]?.line}</h3>
                                                    <div className="text-xs text-slate-500">Даты: {filterDates.length === 0 ? 'Все даты' : filterDates.length === 1 ? filterDates[0] : `${filterDates.length} дат`}</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setLineSlideIndex((prev) => Math.max(0, prev - 1))}
                                                        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                                                        disabled={lineSlideIndex === 0}
                                                    >
                                                        Назад
                                                    </button>
                                                    <div className="text-sm text-slate-500">
                                                        {lineSlideIndex + 1} / {lineSlides.length}
                                                    </div>
                                                    <button
                                                        onClick={() => setLineSlideIndex((prev) => Math.min(lineSlides.length - 1, prev + 1))}
                                                        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                                                        disabled={lineSlideIndex >= lineSlides.length - 1}
                                                    >
                                                        Вперёд
                                                    </button>
                                                </div>
                                            </div>

                                            <div
                                                className={`transition-opacity duration-500 ease-out ${
                                                    isLineSlideVisible ? 'opacity-100' : 'opacity-0'
                                                }`}
                                            >
                                                <div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-8">
                                                    <div className="flex flex-col items-center">
                                                        <div className="relative h-96 w-96">
                                                            <div
                                                                key={`pie-${lineSlideIndex}-${filterDates.join(',')}`}
                                                                className="h-96 w-96 rounded-full border border-slate-200 shadow-sm"
                                                                style={{ 
                                                                    background: buildConicGradient(lineSlides[lineSlideIndex]?.segments || []),
                                                                    animation: 'pieGrow 1.2s ease-out'
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="mt-4 text-lg font-medium text-slate-600">
                                                            Простои по категориям (мин)
                                                        </div>
                                                        {/* Легенда по цветам категорий */}
                                                        <div className="mt-3 w-full max-w-sm">
                                                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Легенда</div>
                                                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                                                {Object.entries(DOWNTIME_CATEGORY_COLORS).map(([name, { hex }]) => (
                                                                    <div key={name} className="flex items-center gap-2">
                                                                        <div
                                                                            className="w-3 h-3 rounded-full flex-shrink-0 border border-slate-200"
                                                                            style={{ backgroundColor: hex }}
                                                                            aria-hidden
                                                                        />
                                                                        <span className="text-sm text-slate-700">{name}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        
                                                        {/* План / Факт / Эффективность */}
                                                        <div className="mt-6 w-full max-w-md">
                                                            <div className="grid grid-cols-3 gap-3">
                                                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 text-center shadow-sm">
                                                                    <div className="text-xs font-medium text-blue-600 mb-1">План</div>
                                                                    <div className="text-2xl font-bold text-blue-700">
                                                                        {lineSlides[lineSlideIndex]?.plan?.toLocaleString() || 0}
                                                                    </div>
                                                                </div>
                                                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4 text-center shadow-sm">
                                                                    <div className="text-xs font-medium text-purple-600 mb-1">Факт</div>
                                                                    <div className="text-2xl font-bold text-purple-700">
                                                                        {lineSlides[lineSlideIndex]?.fact?.toLocaleString() || 0}
                                                                    </div>
                                                                </div>
                                                                <div className={`bg-gradient-to-br border rounded-xl p-4 text-center shadow-sm ${
                                                                    (lineSlides[lineSlideIndex]?.efficiency || 0) >= 95
                                                                        ? 'from-green-50 to-green-100 border-green-200'
                                                                        : (lineSlides[lineSlideIndex]?.efficiency || 0) >= 80
                                                                        ? 'from-yellow-50 to-yellow-100 border-yellow-200'
                                                                        : 'from-red-50 to-red-100 border-red-200'
                                                                }`}>
                                                                    <div className={`text-xs font-medium mb-1 ${
                                                                        (lineSlides[lineSlideIndex]?.efficiency || 0) >= 95
                                                                            ? 'text-green-600'
                                                                            : (lineSlides[lineSlideIndex]?.efficiency || 0) >= 80
                                                                            ? 'text-yellow-600'
                                                                            : 'text-red-600'
                                                                    }`}>
                                                                        Эффективность
                                                                    </div>
                                                                    <div className={`text-2xl font-bold ${
                                                                        (lineSlides[lineSlideIndex]?.efficiency || 0) >= 95
                                                                            ? 'text-green-700'
                                                                            : (lineSlides[lineSlideIndex]?.efficiency || 0) >= 80
                                                                            ? 'text-yellow-700'
                                                                            : 'text-red-700'
                                                                    }`}>
                                                                        {lineSlides[lineSlideIndex]?.efficiency || 0}%
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0 overflow-y-auto max-h-[65vh]">
                                                        {lineSlides[lineSlideIndex]?.downtimeList?.length ? (
                                                            <div className="space-y-3 pr-1">
                                                                {lineSlides[lineSlideIndex].downtimeList.slice(0, 6).map((item) => (
                                                                    <div key={item.category} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 min-w-0">
                                                                        <div className="flex items-center gap-4 text-lg flex-wrap">
                                                                            <div className="flex items-center gap-2 min-w-0">
                                                                                <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: item.color }} />
                                                                                <span className="text-slate-700 font-semibold truncate">{item.category}</span>
                                                                            </div>
                                                                            <div className="flex items-baseline gap-3 flex-shrink-0">
                                                                                <span className="font-semibold text-slate-600">{item.minutes} мин</span>
                                                                                <span className="text-slate-500 text-base">
                                                                                    {item.underproduction?.toLocaleString() || 0} шт
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {(item.descriptionsWithMinutes?.length || item.timeRanges?.length || item.comments?.length) ? (
                                                                            <div className="mt-2 text-base text-slate-600 break-words space-y-1.5">
                                                                                {item.descriptionsWithMinutes?.slice(0, 2).map((entry, idx) => (
                                                                                    <div key={`${item.category}_d_${idx}`} className="whitespace-normal break-words">
                                                                                        <div className="flex items-baseline gap-3 flex-wrap">
                                                                                            <span className="min-w-0">• {entry.description}</span>
                                                                                            <span className="text-slate-700 font-semibold whitespace-nowrap flex-shrink-0">{entry.minutes} мин</span>
                                                                                        </div>
                                                                                        {entry.comments?.length > 0 && (
                                                                                            <details className="mt-0.5 group/c">
                                                                                                <summary className="text-sm text-slate-500 cursor-pointer list-none inline-flex items-center gap-1 hover:text-slate-700">
                                                                                                    <ChevronDown size={12} className="inline group-open/c:rotate-180 transition-transform" />
                                                                                                    Комментарии ({entry.comments.length})
                                                                                                </summary>
                                                                                                <div className="mt-0.5 pl-4 text-sm text-slate-500">
                                                                                                    {entry.comments.map((c, cIdx) => (
                                                                                                        <div key={cIdx}>↳ {c}</div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </details>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                                {item.descriptionsWithMinutes?.length > 2 ? (
                                                                                    <details className="group mt-1.5">
                                                                                        <summary className="text-sm text-emerald-600 hover:text-emerald-700 cursor-pointer list-none inline-flex items-center gap-1 font-medium">
                                                                                            <ChevronDown size={14} className="inline group-open:rotate-180 transition-transform" />
                                                                                            Показать все простои (ещё {item.descriptionsWithMinutes.length - 2})
                                                                                        </summary>
                                                                                        <div className="mt-2 pl-4 space-y-1 border-l-2 border-slate-200">
                                                                                            {item.descriptionsWithMinutes.slice(2).map((entry, idx) => (
                                                                                                <div key={`${item.category}_full_${idx}`} className="whitespace-normal break-words text-sm">
                                                                                                    <div className="flex items-baseline gap-3 flex-wrap">
                                                                                                        <span className="min-w-0">• {entry.description}</span>
                                                                                                        <span className="font-semibold text-slate-700 whitespace-nowrap flex-shrink-0">{entry.minutes} мин</span>
                                                                                                    </div>
                                                                                                    {entry.comments?.length > 0 && (
                                                                                                        <details className="mt-0.5 group/c">
                                                                                                            <summary className="text-xs text-slate-500 cursor-pointer list-none inline-flex items-center gap-1 hover:text-slate-700">
                                                                                                                <ChevronDown size={10} className="inline group-open/c:rotate-180 transition-transform" />
                                                                                                                Комментарии ({entry.comments.length})
                                                                                                            </summary>
                                                                                                            <div className="mt-0.5 pl-4 text-xs text-slate-500">
                                                                                                                {entry.comments.map((c, cIdx) => (
                                                                                                                    <div key={cIdx}>↳ {c}</div>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        </details>
                                                                                                    )}
                                                                                                </div>
                                                                                            ))}
                                                                                            {item.timeRanges?.length > 0 && (
                                                                                                <div className="pt-2 text-xs">
                                                                                                    <span className="font-medium text-slate-500">Промежутки: </span>
                                                                                                    {item.timeRanges.join(', ')}
                                                                                                </div>
                                                                                            )}
                                                                                            {item.comments?.length > 0 && (
                                                                                                <div className="pt-1 text-xs space-y-0.5">
                                                                                                    <span className="font-medium text-slate-500">Комментарии: </span>
                                                                                                    {item.comments.map((c, idx) => (
                                                                                                        <div key={`${item.category}_c_${idx}`}>• {c}</div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </details>
                                                                                ) : (
                                                                                    item.timeRanges?.length > 0 && (
                                                                                        <div className="text-sm text-slate-500">Промежутки: {item.timeRanges.slice(0, 3).join(', ')}{item.timeRanges.length > 3 ? ` +${item.timeRanges.length - 3}` : ''}</div>
                                                                                    )
                                                                                )}
                                                                                {item.descriptionsWithMinutes?.length <= 2 && item.descriptionsWithMinutes?.length > 0 && (item.timeRanges?.length > 0 || item.comments?.length > 0) && (
                                                                                    <details className="group mt-1.5">
                                                                                        <summary className="text-sm text-emerald-600 hover:text-emerald-700 cursor-pointer list-none inline-flex items-center gap-1 font-medium">
                                                                                            <ChevronDown size={14} className="inline group-open:rotate-180 transition-transform" />
                                                                                            Промежутки и комментарии
                                                                                        </summary>
                                                                                        <div className="mt-2 pl-4 space-y-1 border-l-2 border-slate-200 text-sm">
                                                                                            {item.timeRanges?.length > 0 && <div><span className="text-slate-500">Промежутки: </span>{item.timeRanges.join(', ')}</div>}
                                                                                            {item.comments?.map((c, idx) => <div key={idx}>• {c}</div>)}
                                                                                        </div>
                                                                                    </details>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="mt-2 text-base text-slate-400">Описание отсутствует</div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="text-base text-slate-400">Нет простоев</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Полоса как в графиках */}
                                                <div className="mt-8">
                                                    <div className="relative h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                        {(() => {
                                                            const slide = lineSlides[lineSlideIndex];
                                                            const plan = slide?.plan || 0;
                                                            const fact = slide?.fact || 0;
                                                            const efficiencyPercent = plan > 0 ? Math.min(100, (fact / plan) * 100) : 0;
                                                            const isGreen = efficiencyPercent >= 95;
                                                            let leftOffset = efficiencyPercent;
                                                            const totalDowntimePercent = (slide?.segments || []).reduce((sum, s) => sum + s.percent, 0);
                                                            const maxDowntimePercent = Math.max(0, 100 - efficiencyPercent);
                                                            const scale = totalDowntimePercent > maxDowntimePercent && totalDowntimePercent > 0
                                                                ? maxDowntimePercent / totalDowntimePercent
                                                                : 1;
                                                            return (
                                                                <>
                                                                    <div
                                                                        className={`absolute left-0 top-0 h-full rounded-lg transition-all duration-500 ${
                                                                            isGreen ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-orange-400 to-orange-500'
                                                                        }`}
                                                                        style={{ width: `${efficiencyPercent}%` }}
                                                                    />
                                                                    {(slide?.segments || []).map((seg, idx) => {
                                                                        const width = Math.min(seg.percent * scale, 100 - leftOffset);
                                                                        const currentLeft = leftOffset;
                                                                        if (width <= 0) return null;
                                                                        leftOffset += width;
                                                                        return (
                                                                            <div
                                                                                key={`${seg.category}_${idx}`}
                                                                                className="absolute top-0 h-full border-r border-slate-300 transition-all duration-500"
                                                                                style={{ left: `${currentLeft}%`, width: `${width}%`, backgroundColor: seg.color }}
                                                                                title={`${seg.category}: ${seg.minutes} мин (${seg.percent.toFixed(1)}%)`}
                                                                            />
                                                                        );
                                                                    })}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
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
            {debugPlanModalOpen && (() => {
                const lineKeys = Object.keys(debugByLineDate).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
                const lineOptions = ['all', ...lineKeys];
                const datesForLine = debugPlanLineKey === 'all' ? [] : Object.keys(debugByLineDate[debugPlanLineKey] || {}).sort(naturalCompare);
                const dateOptions = debugPlanLineKey === 'all' ? ['all'] : ['all', ...datesForLine];
                let debugText = '';
                if (debugPlanLineKey === 'all') {
                    const parts = [];
                    lineKeys.forEach((lk) => {
                        Object.keys(debugByLineDate[lk] || {}).sort(naturalCompare).forEach((dt) => {
                            parts.push((debugByLineDate[lk][dt] || []).join('\n'));
                        });
                    });
                    debugText = parts.join('\n\n');
                } else if (debugPlanDate === 'all') {
                    debugText = datesForLine.map((dt) => (debugByLineDate[debugPlanLineKey][dt] || []).join('\n')).join('\n\n');
                } else {
                    debugText = (debugByLineDate[debugPlanLineKey] && debugByLineDate[debugPlanLineKey][debugPlanDate])
                        ? debugByLineDate[debugPlanLineKey][debugPlanDate].join('\n')
                        : '';
                }
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDebugPlanModalOpen(false)}>
                        <div className="bg-white rounded-xl shadow-xl w-max max-w-[90vw] min-w-0 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                                <h3 className="text-lg font-bold text-slate-800">Расчёт плана по нормативам (отладка)</h3>
                                <button type="button" onClick={() => setDebugPlanModalOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Закрыть">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="px-4 py-3 flex flex-wrap gap-3 items-center border-b border-slate-100">
                                <label className="flex items-center gap-2">
                                    <span className="text-sm text-slate-600">Линия:</span>
                                    <select
                                        value={debugPlanLineKey}
                                        onChange={(e) => { setDebugPlanLineKey(e.target.value); setDebugPlanDate('all'); }}
                                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                                    >
                                        {lineOptions.map((k) => (
                                            <option key={k} value={k}>{k === 'all' ? 'Все' : `Линия ${k}`}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex items-center gap-2">
                                    <span className="text-sm text-slate-600">Дата:</span>
                                    <select
                                        value={debugPlanDate}
                                        onChange={(e) => setDebugPlanDate(e.target.value)}
                                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                                    >
                                        {dateOptions.map((d) => (
                                            <option key={d} value={d}>{d === 'all' ? 'Все' : d}</option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const el = debugPlanPreRef.current;
                                        if (el) {
                                            const text = el.textContent || '';
                                            navigator.clipboard.writeText(text).then(() => {}, () => {});
                                        }
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                                >
                                    Копировать
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                <pre ref={debugPlanPreRef} className="text-sm font-mono bg-slate-900 text-slate-100 p-4 rounded-lg whitespace-pre overflow-x-auto leading-relaxed">
                                    {debugText || 'Нет данных для выбранного контекста.'}
                                </pre>
                            </div>
                            <div className="px-4 py-3 border-t border-slate-200 flex justify-end">
                                <button type="button" onClick={() => setDebugPlanModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300">
                                    Закрыть
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default React.memo(ProductionView);

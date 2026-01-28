import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Droplet, Plus, Clock4, Database, GripVertical, Trash2 } from 'lucide-react';
import { STORAGE_KEYS, loadFromLocalStorage, saveToLocalStorage, debounce } from '../../utils';
import { TRANSITION_RULES_BASE } from './transitionRulesBase';
import { openReportPreview, exportReportAsPdf } from '../../export/reportExport';

const LINE_OPTIONS = [
    'Линия 1',
    'Линия 2',
    'Линия 3',
    'Линия 4',
    'Линия 5 (Сиропы)',
    'Линия 6 (Bag-in-Box)',
    'Линия 7 (Топпинги)',
    'Линия 8 (Соусы)',
    'Линия 9 (Пюре)',
    'Линия 10 (ПЭТ)',
    'Линия 11 (Лимонады)'
];

const DEFAULT_CIP_DURATIONS = {
    line1: { cip1: '', cip2: '', cip3: '' }
};

const DEFAULT_SPEED_LINES = [
    {
        id: 'line_1',
        name: 'Линия 1',
        entries: [
            { id: 'line_1_0', format: '1,8 л', speed: '1000' }
        ]
    },
    {
        id: 'line_2',
        name: 'Линия 2',
        entries: [
            { id: 'line_2_0', format: '0,25 л', speed: '6500' }
        ]
    },
    {
        id: 'line_3',
        name: 'Линия 3',
        entries: [
            { id: 'line_3_0', format: '0,75 л', speed: '3700' },
            { id: 'line_3_1', format: '1,0 л', speed: '4600' }
        ]
    },
    {
        id: 'line_4',
        name: 'Линия 4',
        entries: [
            { id: 'line_4_0', format: '0,25 л / 0,33 л', speed: '5600' }
        ]
    },
    {
        id: 'line_5',
        name: 'Линия 5 (Сиропы)',
        entries: [
            { id: 'line_5_0', format: '0,25 л', speed: '2900' },
            { id: 'line_5_1', format: '0,7 л', speed: '1600' },
            { id: 'line_5_2', format: '1,0 л', speed: '2200' }
        ]
    },
    {
        id: 'line_6',
        name: 'Линия 6 (Bag-in-Box)',
        entries: [
            { id: 'line_6_0', format: '3,0 л', speed: '300' }
        ]
    },
    {
        id: 'line_7',
        name: 'Линия 7 (Топпинги)',
        entries: [
            { id: 'line_7_0', format: '1,0 кг', speed: '200' },
            { id: 'line_7_1', format: '25 кг', speed: '8' }
        ]
    },
    {
        id: 'line_8',
        name: 'Линия 8 (Соусы)',
        entries: [
            { id: 'line_8_0', format: '10,0 кг', speed: '210' }
        ]
    },
    {
        id: 'line_9',
        name: 'Линия 9 (Пюре)',
        entries: [
            { id: 'line_9_0', format: 'Налив (Кеги/Бочки?)', speed: '15' }
        ]
    },
    {
        id: 'line_10',
        name: 'Линия 10 (ПЭТ)',
        entries: [
            { id: 'line_10_0', format: '1,0 л', speed: '450' }
        ]
    },
    {
        id: 'line_11',
        name: 'Линия 11 (Лимонады)',
        entries: [
            { id: 'line_11_0', format: 'Банка/Бутылка', speed: '3000' }
        ]
    }
];

const DEFAULT_PRODUCTS = [
    {
        id: 1,
        date: '27.01.2026',
        manualDate: false,
        start: '07:00',
        end: '',
        manualStart: false,
        manualEnd: false,
        name: 'Лимонад классический 0.5л',
        qty: '18 000',
        speed: '6 000'
    },
    {
        id: 2,
        date: '27.01.2026',
        manualDate: false,
        start: '',
        end: '',
        manualStart: false,
        manualEnd: false,
        name: 'Кола 0.5л',
        qty: '22 000',
        speed: '7 500'
    },
    {
        id: 3,
        date: '27.01.2026',
        manualDate: false,
        start: '',
        end: '',
        manualStart: false,
        manualEnd: false,
        name: 'Вода газ. 1.5л',
        qty: '12 500',
        speed: '4 200'
    },
    {
        id: 4,
        date: '27.01.2026',
        manualDate: false,
        start: '',
        end: '',
        manualStart: false,
        manualEnd: false,
        name: 'Сок яблочный 1л',
        qty: '9 800',
        speed: '3 300'
    }
];

const TRANSITION_RULES_VERSION = 'rules_sets_2026_01_27';

const PRODUCT_PARSE_PATTERN = /^(?<type>Сироп|Нектар|Сок|Топпинг|Основа|Концентрат|Морс|Лимонад|Пюре|Переборка|соус|Тоник|Энергетический напиток|Напиток(?: с витаминами| тонизирующий)?)\s+(?<flavor>.+?)(?=\s+\d+(?:[,.]\d+)?\s*(?:л|кг|мл|г)|\s+0,33|\s+ТМ\s*[«"]|\s*[-–—]\s*\d|\s*$)(?:\s+(?<volume>\d+(?:[,.]\d+)?\s*(?:л|кг|мл|г)|0,33))?(?:\s+(?:ПЭТ|ст|бут))?(?:\s+ТМ\s*[«"](?<brand>[^"»]+)[»"])?(?:\s*(?:[-–—])?\s*(?<qty>[\d\s]+)\s*(?:шт|шт\.|штук))?/iu;

const extractTypeFlavor = (value) => {
    if (!value) return { type: '', flavor: '' };
    const match = String(value).match(PRODUCT_PARSE_PATTERN);
    if (!match?.groups?.type || !match?.groups?.flavor) {
        return { type: '', flavor: '' };
    }
    return {
        type: match.groups.type.trim(),
        flavor: match.groups.flavor.trim()
    };
};

const buildTransitionKey = (type, flavor) => (
    [type, flavor]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
);

const splitTransitionList = (value) => (
    String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
);

const DEFAULT_CIP_BETWEEN = [
    {
        id: 101,
        date: '27.01.2026',
        manualDate: false,
        start: '',
        end: '',
        manualStart: false,
        manualEnd: false,
        type: 'CIP 1'
    },
    {
        id: 102,
        date: '27.01.2026',
        manualDate: false,
        start: '',
        end: '',
        manualStart: false,
        manualEnd: false,
        type: 'CIP 2'
    },
    {
        id: 103,
        date: '27.01.2026',
        manualDate: false,
        start: '',
        end: '',
        manualStart: false,
        manualEnd: false,
        type: 'CIP 3'
    }
];

const DEFAULT_LINE_EVENTS = [
    {
        category: 'Передача смены',
        event: 'smena',
        durations: {
            'Линия 1': 20,
            'Линия 2': 20,
            'Линия 3': 20,
            'Линия 4': 20,
            'Линия 5 (Сиропы)': 20,
            'Линия 6 (Bag-in-Box)': 20,
            'Линия 7 (Топпинги)': 20,
            'Линия 8 (Соусы)': 20,
            'Линия 9 (Пюре)': 20,
            'Линия 10 (ПЭТ)': 20,
            'Линия 11 (Лимонады)': 20
        }
    },
    {
        category: 'Запуск линии',
        event: 'Запуск линии',
        durations: {
            'Линия 1': 30,
            'Линия 2': 30,
            'Линия 3': 30,
            'Линия 4': 30,
            'Линия 5 (Сиропы)': 30,
            'Линия 6 (Bag-in-Box)': 30,
            'Линия 7 (Топпинги)': 10,
            'Линия 8 (Соусы)': 30,
            'Линия 9 (Пюре)': 30,
            'Линия 10 (ПЭТ)': 30,
            'Линия 11 (Лимонады)': 30
        }
    },
    {
        category: 'Смена ассортимента',
        event: '',
        durations: {
            'Линия 1': 15,
            'Линия 2': 15,
            'Линия 3': 15,
            'Линия 4': 15,
            'Линия 5 (Сиропы)': 15,
            'Линия 6 (Bag-in-Box)': 0,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 15,
            'Линия 9 (Пюре)': 0,
            'Линия 10 (ПЭТ)': 15,
            'Линия 11 (Лимонады)': 15
        }
    },
    {
        category: 'Переналадка формата',
        event: '',
        durations: {
            'Линия 1': 120,
            'Линия 2': 120,
            'Линия 3': 60,
            'Линия 4': 60,
            'Линия 5 (Сиропы)': 240,
            'Линия 6 (Bag-in-Box)': 0,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 0,
            'Линия 9 (Пюре)': 0,
            'Линия 10 (ПЭТ)': 0,
            'Линия 11 (Лимонады)': 0
        }
    },
    {
        category: 'Стерилизация',
        event: '',
        durations: {
            'Линия 1': 0,
            'Линия 2': 0,
            'Линия 3': 0,
            'Линия 4': 0,
            'Линия 5 (Сиропы)': 0,
            'Линия 6 (Bag-in-Box)': 0,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 40,
            'Линия 9 (Пюре)': 40,
            'Линия 10 (ПЭТ)': 0,
            'Линия 11 (Лимонады)': 0
        }
    },
    {
        category: 'CIP1 (холодная вода)',
        event: 'CIP1c',
        durations: {
            'Линия 1': 40,
            'Линия 2': 40,
            'Линия 3': 40,
            'Линия 4': 150,
            'Линия 5 (Сиропы)': 20,
            'Линия 6 (Bag-in-Box)': 0,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 0,
            'Линия 9 (Пюре)': 0,
            'Линия 10 (ПЭТ)': 0,
            'Линия 11 (Лимонады)': 0
        }
    },
    {
        category: 'CIP1 (горячая вода)',
        event: 'CIP1h',
        durations: {
            'Линия 1': 0,
            'Линия 2': 0,
            'Линия 3': 0,
            'Линия 4': 0,
            'Линия 5 (Сиропы)': 40,
            'Линия 6 (Bag-in-Box)': 30,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 0,
            'Линия 9 (Пюре)': 0,
            'Линия 10 (ПЭТ)': 40,
            'Линия 11 (Лимонады)': 0
        }
    },
    {
        category: 'CIP2 (щелочная)',
        event: 'CIP2',
        durations: {
            'Линия 1': 240,
            'Линия 2': 240,
            'Линия 3': 240,
            'Линия 4': 240,
            'Линия 5 (Сиропы)': 240,
            'Линия 6 (Bag-in-Box)': 120,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 240,
            'Линия 9 (Пюре)': 240,
            'Линия 10 (ПЭТ)': 240,
            'Линия 11 (Лимонады)': 240
        }
    },
    {
        category: 'CIP3 (щелочь, кислота)',
        event: 'CIP3',
        durations: {
            'Линия 1': 300,
            'Линия 2': 300,
            'Линия 3': 300,
            'Линия 4': 300,
            'Линия 5 (Сиропы)': 300,
            'Линия 6 (Bag-in-Box)': 180,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 300,
            'Линия 9 (Пюре)': 300,
            'Линия 10 (ПЭТ)': 300,
            'Линия 11 (Лимонады)': 300
        }
    },
    {
        category: 'Настройка ЧЗ',
        event: '',
        durations: {
            'Линия 1': 0,
            'Линия 2': 0,
            'Линия 3': 0,
            'Линия 4': 0,
            'Линия 5 (Сиропы)': 0,
            'Линия 6 (Bag-in-Box)': 0,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 0,
            'Линия 9 (Пюре)': 0,
            'Линия 10 (ПЭТ)': 0,
            'Линия 11 (Лимонады)': 0
        }
    },
    {
        category: 'Вытеснение',
        event: 'O',
        durations: {
            'Линия 1': 30,
            'Линия 2': 30,
            'Линия 3': 30,
            'Линия 4': 30,
            'Линия 5 (Сиропы)': 30,
            'Линия 6 (Bag-in-Box)': 30,
            'Линия 7 (Топпинги)': 30,
            'Линия 8 (Соусы)': 30,
            'Линия 9 (Пюре)': 30,
            'Линия 10 (ПЭТ)': 30,
            'Линия 11 (Лимонады)': 30
        }
    }
];

const PlanningView = () => {
    const storedPlanning = useMemo(
        () => loadFromLocalStorage(STORAGE_KEYS.PLANNING_STATE, {}),
        []
    );
    const resolveLineOption = (value) => (
        LINE_OPTIONS.includes(value) ? value : LINE_OPTIONS[0]
    );

    const [activeTab, setActiveTab] = useState(() => storedPlanning.activeTab || 'schedule');
    const [cipDurations, setCipDurations] = useState(
        () => storedPlanning.cipDurations || DEFAULT_CIP_DURATIONS
    );
    const [baseProducts, setBaseProducts] = useState(
        () => storedPlanning.baseProducts || []
    );
    const [productImportError, setProductImportError] = useState('');
    const [planImportError, setPlanImportError] = useState('');
    const [pasteText, setPasteText] = useState('');
    const [isProductImportOpen, setIsProductImportOpen] = useState(false);
    const [isPlanImportOpen, setIsPlanImportOpen] = useState(false);
    const [selectedPlanLine, setSelectedPlanLine] = useState(
        () => resolveLineOption(storedPlanning.selectedPlanLine)
    );
    const [speedLines, setSpeedLines] = useState(
        () => storedPlanning.speedLines || DEFAULT_SPEED_LINES
    );
    const [products, setProducts] = useState(
        () => storedPlanning.products || DEFAULT_PRODUCTS
    );
    const [cipBetween, setCipBetween] = useState(
        () => storedPlanning.cipBetween || DEFAULT_CIP_BETWEEN
    );
    const [dragIndex, setDragIndex] = useState(null);
    const useStoredTransitionRules = storedPlanning.transitionRulesVersion === TRANSITION_RULES_VERSION;
    const [transitionRules, setTransitionRules] = useState(
        () => (useStoredTransitionRules
            ? storedPlanning.transitionRules || TRANSITION_RULES_BASE
            : TRANSITION_RULES_BASE)
    );
    const [lineEvents, setLineEvents] = useState(
        () => storedPlanning.lineEvents || DEFAULT_LINE_EVENTS
    );
    const [transitionSearch, setTransitionSearch] = useState({});
    const [transitionResult, setTransitionResult] = useState(null);
    const [transitionStatus, setTransitionStatus] = useState('idle');
    const [transitionError, setTransitionError] = useState('');
    const [transitionProgress, setTransitionProgress] = useState(0);
    const [transitionProgressNodes, setTransitionProgressNodes] = useState(null);
    const [transitionCompareResult, setTransitionCompareResult] = useState(null);
    const [transitionSaveStatus, setTransitionSaveStatus] = useState('');
    const [transitionSearchQuery, setTransitionSearchQuery] = useState('');
    const [transitionAlgorithm, setTransitionAlgorithm] = useState(
        () => storedPlanning.transitionAlgorithm || 'auto'
    );
    const [hoveredTransitionRuleId, setHoveredTransitionRuleId] = useState(null);
    const [activeTransitionCell, setActiveTransitionCell] = useState(null);
    const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState(() => storedPlanning.exportType || 'html');
    const [exportLines, setExportLines] = useState(() => {
        const stored = (storedPlanning.exportLines || [])
            .map(resolveLineOption)
            .filter(Boolean);
        if (stored.length > 0) return stored;
        return [resolveLineOption(storedPlanning.selectedPlanLine || LINE_OPTIONS[0])];
    });
    const transitionWorkerRef = useRef(null);
    const transitionSaveTimeoutRef = useRef(null);
    const normalizedLinesRef = useRef(false);
    const baseProductByName = useMemo(
        () => new Map(baseProducts.map((product) => [product.name, product])),
        [baseProducts]
    );

    const getTransitionKeyForProduct = (product) => {
        if (!product) return '';
        const key = buildTransitionKey(product.type, product.flavor);
        return key || String(product.name || '').trim().toLowerCase();
    };

    const getTransitionKeyForName = (name) => {
        if (!name) return '';
        const baseProduct = baseProductByName.get(name);
        if (baseProduct) return getTransitionKeyForProduct(baseProduct);
        const { type, flavor } = extractTypeFlavor(name);
        const key = buildTransitionKey(type, flavor);
        return key || String(name).trim().toLowerCase();
    };

    const normalizeTransitionList = (value) => {
        const items = String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .map(item => getTransitionKeyForName(item))
            .filter(Boolean);
        return Array.from(new Set(items)).join(', ');
    };

    const transitionRuleMap = useMemo(() => {
        const map = new Map();
        (transitionRules || []).forEach((rule) => {
            const key = getTransitionKeyForName(rule.productName);
            if (!key) return;
            map.set(key, {
                baseCip: rule.baseCip || 'cip1',
                exceptions: {
                    cip1: new Set(splitTransitionList(rule.cip1).map(getTransitionKeyForName).filter(Boolean)),
                    cip2: new Set(splitTransitionList(rule.cip2).map(getTransitionKeyForName).filter(Boolean)),
                    cip3: new Set(splitTransitionList(rule.cip3).map(getTransitionKeyForName).filter(Boolean))
                }
            });
        });
        return map;
    }, [transitionRules, getTransitionKeyForName]);

    const getTransitionCipKey = (rule, toKey) => {
        if (!rule) return 'cip1';
        if (rule.exceptions.cip1.has(toKey)) return 'cip1';
        if (rule.exceptions.cip2.has(toKey)) return 'cip2';
        if (rule.exceptions.cip3.has(toKey)) return 'cip3';
        return rule.baseCip || 'cip1';
    };

    const currentTransitionOrder = useMemo(() => (
        products
            .filter(product => product.line === selectedPlanLine)
            .map(product => getTransitionKeyForName(product.name))
            .filter(Boolean)
    ), [products, selectedPlanLine, getTransitionKeyForName]);

    const bestCompareResult = useMemo(() => {
        if (!transitionCompareResult) return null;
        const hk = transitionCompareResult.heldKarp;
        const heur = transitionCompareResult.heuristic;
        if (!hk || !heur) return null;
        const hkCost = hk.totalCost ?? Infinity;
        const heurCost = heur.totalCost ?? Infinity;
        if (heurCost < hkCost) {
            return { label: 'Эвристика', order: heur.order || [], totalCost: heurCost };
        }
        return { label: 'Held–Karp', order: hk.order || [], totalCost: hkCost };
    }, [transitionCompareResult]);

    const buildMissingTransitionMap = useCallback((line) => {
        const map = new Map();
        const lineProducts = products
            .map((product, index) => ({ product, index }))
            .filter(({ product }) => product.line === line);
        for (let i = 0; i < lineProducts.length - 1; i += 1) {
            const from = lineProducts[i];
            const to = lineProducts[i + 1];
            const fromKey = getTransitionKeyForName(from.product.name);
            const toKey = getTransitionKeyForName(to.product.name);
            const rule = transitionRuleMap.get(fromKey);
            if (!rule || !transitionRuleMap.has(toKey)) {
                map.set(from.index, true);
            }
        }
        return map;
    }, [products, transitionRuleMap, getTransitionKeyForName]);

    const missingTransitionByIndex = useMemo(
        () => buildMissingTransitionMap(selectedPlanLine),
        [buildMissingTransitionMap, selectedPlanLine]
    );

    const transitionAnalytics = useMemo(() => {
        const getCipDuration = (cipKey) => {
            const eventKeyMap = {
                cip1: 'CIP1c',
                cip2: 'CIP2',
                cip3: 'CIP3'
            };
            const eventKey = eventKeyMap[cipKey];
            if (!eventKey) return null;
            const event = lineEvents.find(e => e.event === eventKey);
            if (!event) return null;
            const raw = event.durations?.[selectedPlanLine];
            if (raw === '' || raw === null || raw === undefined) return null;
            const value = Number(raw);
            return Number.isFinite(value) ? value : null;
        };
        const getTransitions = (order) => {
            const rows = [];
            let total = 0;
            let missingDurations = 0;
            let missingRules = 0;
            for (let i = 0; i < order.length - 1; i += 1) {
                const from = order[i];
                const to = order[i + 1];
                const rule = transitionRuleMap.get(from);
                const hasToRule = transitionRuleMap.has(to);
                if (!rule || !hasToRule) {
                    rows.push({ from, to, cipKey: null, duration: null, reason: 'missing-rule' });
                    missingRules += 1;
                    continue;
                }
                const cipKey = getTransitionCipKey(rule, to);
                const duration = getCipDuration(cipKey);
                rows.push({ from, to, cipKey, duration, reason: duration === null ? 'missing-duration' : null });
                if (duration === null) {
                    missingDurations += 1;
                } else {
                    total += duration;
                }
            }
            return { rows, total, missingDurations, missingRules };
        };
        const was = getTransitions(currentTransitionOrder);
        const now = getTransitions(transitionResult?.order || []);
        return { was, now };
    }, [lineEvents, selectedPlanLine, transitionRuleMap, currentTransitionOrder, transitionResult]);

    const filteredTransitionRules = useMemo(() => {
        const query = transitionSearchQuery.trim().toLowerCase();
        if (!query) return transitionRules;
        return (transitionRules || []).filter((rule) => {
            const haystack = [
                rule.productName,
                rule.cip1,
                rule.cip2,
                rule.cip3
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(query);
        });
    }, [transitionRules, transitionSearchQuery]);

    const createTransitionWorker = () => {
        const worker = new Worker(
            new URL('../../workers/transitionOptimizer.worker.js', import.meta.url),
            { type: 'module' }
        );
        transitionWorkerRef.current = worker;
        worker.onmessage = (event) => {
            const { type, payload } = event.data || {};
            if (type === 'result') {
                setTransitionResult(payload);
                setTransitionCompareResult(null);
                setTransitionStatus('done');
                setTransitionProgress(1);
                setTransitionProgressNodes(payload?.nodesExplored ?? null);
            }
            if (type === 'compare') {
                setTransitionCompareResult(payload);
                setTransitionResult(null);
                setTransitionStatus('done');
                setTransitionProgress(1);
                setTransitionProgressNodes(null);
            }
            if (type === 'progress') {
                setTransitionProgress(payload?.progress || 0);
                if (payload?.nodesExplored !== undefined) {
                    setTransitionProgressNodes(payload.nodesExplored);
                } else {
                    setTransitionProgressNodes(null);
                }
            }
        };
        return worker;
    };

    useEffect(() => {
        const worker = createTransitionWorker();
        return () => {
            worker.terminate();
            transitionWorkerRef.current = null;
        };
    }, []);

    const stopTransitionOptimization = () => {
        if (transitionWorkerRef.current) {
            transitionWorkerRef.current.terminate();
            transitionWorkerRef.current = null;
        }
        setTransitionStatus('idle');
        setTransitionProgress(0);
        setTransitionProgressNodes(null);
        createTransitionWorker();
    };

    useEffect(() => {
        setTransitionRules((prev) => {
            if (!prev || prev.length === 0) return prev;
            let changed = false;
            const next = prev.map((rule) => {
                const nextProduct = getTransitionKeyForName(rule.productName);
                const nextCip1 = normalizeTransitionList(rule.cip1);
                const nextCip2 = normalizeTransitionList(rule.cip2);
                const nextCip3 = normalizeTransitionList(rule.cip3);
                const updated = {
                    ...rule,
                    productName: nextProduct,
                    cip1: nextCip1,
                    cip2: nextCip2,
                    cip3: nextCip3
                };
                if (
                    nextProduct !== String(rule.productName || '').trim()
                    || nextCip1 !== String(rule.cip1 || '')
                    || nextCip2 !== String(rule.cip2 || '')
                    || nextCip3 !== String(rule.cip3 || '')
                ) {
                    changed = true;
                }
                return updated;
            });
            return changed ? next : prev;
        });
    }, [baseProducts]);

    useEffect(() => {
        return () => {
            if (transitionSaveTimeoutRef.current) {
                clearTimeout(transitionSaveTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (normalizedLinesRef.current) return;
        let changed = false;
        const nextProducts = products.map((product) => {
            if (product.line) return product;
            changed = true;
            return { ...product, line: selectedPlanLine };
        });
        const nextCipBetween = cipBetween.map((cip) => {
            if (cip.line) return cip;
            changed = true;
            return { ...cip, line: selectedPlanLine };
        });
        if (changed) {
            setProducts(nextProducts);
            setCipBetween(nextCipBetween);
        }
        normalizedLinesRef.current = true;
    }, [products, cipBetween, selectedPlanLine]);

    useEffect(() => {
        if (!useStoredTransitionRules) {
            setTransitionRules(TRANSITION_RULES_BASE);
        }
    }, [useStoredTransitionRules]);

    const savePlanningState = useMemo(() => debounce((nextState) => {
        saveToLocalStorage(STORAGE_KEYS.PLANNING_STATE, nextState);
    }, 400), []);

    useEffect(() => {
        savePlanningState({
            activeTab,
            cipDurations,
            baseProducts,
            speedLines,
            products,
            cipBetween,
            selectedPlanLine,
            transitionRules,
            transitionRulesVersion: TRANSITION_RULES_VERSION,
            lineEvents,
            exportLines,
            exportType,
            transitionAlgorithm
        });
    }, [
        activeTab,
        cipDurations,
        baseProducts,
        speedLines,
        products,
        cipBetween,
        selectedPlanLine,
        transitionRules,
        lineEvents,
        exportLines,
        exportType,
        transitionAlgorithm,
        savePlanningState
    ]);

    const handleCipChange = (key, value) => {
        setCipDurations(prev => ({
            ...prev,
            line1: {
                ...prev.line1,
                [key]: value
            }
        }));
    };

    const parseNumeric = (value) => {
        if (value === null || value === undefined) return 0;
        const cleaned = String(value).replace(/[^\d.]/g, '');
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const parseTimeToMinutes = (value) => {
        if (!value || !value.includes(':')) return 0;
        const [h, m] = value.split(':').map(v => parseInt(v, 10));
        if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
        return Math.max(0, Math.min(1439, h * 60 + m));
    };

    const formatMinutesToTime = (value) => {
        const safe = Math.max(0, Math.min(1439, Math.round(value)));
        const h = String(Math.floor(safe / 60)).padStart(2, '0');
        const m = String(safe % 60).padStart(2, '0');
        return `${h}:${m}`;
    };

    const formatDateInputValue = (value) => {
        if (!value || !value.includes('.')) return '';
        const [day, month, year] = value.split('.');
        if (!day || !month || !year) return '';
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    };

    const parseDateInputValue = (value) => {
        if (!value || !value.includes('-')) return '';
        const [year, month, day] = value.split('-');
        if (!day || !month || !year) return '';
        return `${day}.${month}.${year}`;
    };

    const normalizeVolume = (value) => {
        if (!value) return '';
        return String(value)
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/,/g, '.');
    };

    const findSpeedForVolume = (lineName, volume) => {
        if (!lineName || !volume) return '';
        const line = speedLines.find(item => item.name === lineName);
        if (!line) return '';
        const target = normalizeVolume(volume);
        const exact = line.entries.find(entry => normalizeVolume(entry.format) === target);
        if (exact?.speed) return String(exact.speed);
        const partial = line.entries.find(entry => normalizeVolume(entry.format).includes(target));
        return partial?.speed ? String(partial.speed) : '';
    };

    const parseDateToDayIndex = (value) => {
        if (!value || !value.includes('.')) return null;
        const [dayStr, monthStr, yearStr] = value.split('.');
        const day = parseInt(dayStr, 10);
        const month = parseInt(monthStr, 10);
        const year = parseInt(yearStr, 10);
        if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
        const utc = Date.UTC(year, month - 1, day);
        if (!Number.isFinite(utc)) return null;
        return Math.floor(utc / 86400000);
    };

    const formatDayIndexToDate = (dayIndex) => {
        if (!Number.isFinite(dayIndex)) return '01.01.1970';
        const date = new Date(dayIndex * 86400000);
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}.${month}.${year}`;
    };

    const parseProductPaste = (text, includeQty) => {
        const trimmed = String(text || '').trim();
        if (!trimmed) return [];
        const pattern = PRODUCT_PARSE_PATTERN;
        const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const parsed = [];

        lines.forEach((line, idx) => {
            const match = line.match(pattern);
            if (!match?.groups?.type || !match?.groups?.flavor) return;
            const volume = match.groups.volume ? match.groups.volume.replace(',', '.').trim() : '';
            const brand = match.groups.brand ? match.groups.brand.trim() : '';
            const type = match.groups.type.trim();
            const flavor = match.groups.flavor.trim();
            const rawQty = includeQty && match.groups.qty ? match.groups.qty : '';
            const qty = rawQty ? rawQty.replace(/\s+/g, ' ').trim() : '';
            const name = [
                type,
                flavor,
                volume ? volume : '',
                brand ? `ТМ «${brand}»` : ''
            ].filter(Boolean).join(' ');

            parsed.push({
                id: `p_${Date.now()}_${idx}`,
                name,
                type,
                flavor,
                volume,
                brand,
                speed: '',
                qty,
                unit: ''
            });
        });

        return parsed;
    };

    const addSpeedLine = () => {
        setSpeedLines(prev => ([
            ...prev,
            {
                id: `line_${Date.now()}_${prev.length}`,
                name: '',
                entries: [
                    {
                        id: `entry_${Date.now()}_${prev.length}_0`,
                        format: '',
                        speed: ''
                    }
                ]
            }
        ]));
    };

    const updateSpeedLineName = (lineId, value) => {
        setSpeedLines(prev => prev.map(line => (
            line.id === lineId ? { ...line, name: value } : line
        )));
    };

    const addSpeedEntry = (lineId) => {
        setSpeedLines(prev => prev.map(line => {
            if (line.id !== lineId) return line;
            const nextEntries = [
                ...line.entries,
                {
                    id: `entry_${Date.now()}_${line.entries.length}`,
                    format: '',
                    speed: ''
                }
            ];
            return { ...line, entries: nextEntries };
        }));
    };

    const updateSpeedEntry = (lineId, entryId, key, value) => {
        setSpeedLines(prev => prev.map(line => {
            if (line.id !== lineId) return line;
            return {
                ...line,
                entries: line.entries.map(entry => (
                    entry.id === entryId ? { ...entry, [key]: value } : entry
                ))
            };
        }));
    };

    const removeSpeedEntry = (lineId, entryId) => {
        setSpeedLines(prev => prev.map(line => {
            if (line.id !== lineId) return line;
            const nextEntries = line.entries.filter(entry => entry.id !== entryId);
            return { ...line, entries: nextEntries.length > 0 ? nextEntries : line.entries };
        }));
    };

    const addLineEvent = () => {
        setLineEvents(prev => ([
            ...prev,
            {
                category: '',
                event: '',
                durations: LINE_OPTIONS.reduce((acc, line) => {
                    acc[line] = '';
                    return acc;
                }, {})
            }
        ]));
    };

    const removeLineEvent = (index) => {
        setLineEvents(prev => prev.filter((_, idx) => idx !== index));
    };

    const addTransitionRule = () => {
        setTransitionRules(prev => ([
            ...prev,
            {
                id: `tr_${Date.now()}_${prev.length}`,
                productName: '',
                baseCip: 'cip1',
                cip1: '',
                cip2: '',
                cip3: ''
            }
        ]));
    };

    const removeTransitionRule = (id) => {
        setTransitionRules(prev => prev.filter(rule => rule.id !== id));
        setTransitionSearch(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const updateTransitionRule = (id, key, value) => {
        setTransitionRules(prev => prev.map(rule => (
            rule.id === id ? { ...rule, [key]: value } : rule
        )));
    };

    const updateTransitionSearch = (id, key, value) => {
        setTransitionSearch(prev => ({
            ...prev,
            [id]: {
                ...(prev[id] || {}),
                [key]: value
            }
        }));
    };

    const runTransitionOptimization = () => {
        if (transitionStatus === 'running') {
            stopTransitionOptimization();
        }
        if (!transitionWorkerRef.current) return;
        const lineProducts = products
            .filter(product => product.line === selectedPlanLine)
            .map(product => getTransitionKeyForName(product.name))
            .filter(Boolean);
        const timeBudgetMs = 2500;
        const cipDurationsForOptimization = {
            cip1: (() => {
                const event = lineEvents.find(e => e.event === 'CIP1c' || e.event === 'CIP1h');
                return event?.durations?.[selectedPlanLine] || 0;
            })(),
            cip2: (() => {
                const event = lineEvents.find(e => e.event === 'CIP2');
                return event?.durations?.[selectedPlanLine] || 0;
            })(),
            cip3: (() => {
                const event = lineEvents.find(e => e.event === 'CIP3');
                return event?.durations?.[selectedPlanLine] || 0;
            })()
        };
        console.log('[Optimization] Line products:', lineProducts);
        console.log('[Optimization] Transition rules:', transitionRules.map(r => r.productName));
        console.log('[Optimization] CIP durations:', cipDurationsForOptimization);
        if (lineProducts.length === 0) {
            setTransitionError('Нет продуктов для выбранной линии.');
            return;
        }
        setTransitionStatus('running');
        setTransitionError('');
        setTransitionProgress(0);
        setTransitionProgressNodes(null);
        setTransitionCompareResult(null);
        transitionWorkerRef.current.postMessage({
            type: 'optimize',
            payload: {
                products: lineProducts,
                transitions: transitionRules,
                cipDurations: cipDurationsForOptimization,
                timeBudgetMs,
                algorithm: transitionAlgorithm
            }
        });
    };

    const runTransitionCompare = () => {
        if (transitionStatus === 'running') {
            stopTransitionOptimization();
        }
        if (!transitionWorkerRef.current) return;
        const lineProducts = products
            .filter(product => product.line === selectedPlanLine)
            .map(product => getTransitionKeyForName(product.name))
            .filter(Boolean);
        const timeBudgetMs = 2500;
        const cipDurationsForOptimization = {
            cip1: (() => {
                const event = lineEvents.find(e => e.event === 'CIP1c' || e.event === 'CIP1h');
                return event?.durations?.[selectedPlanLine] || 0;
            })(),
            cip2: (() => {
                const event = lineEvents.find(e => e.event === 'CIP2');
                return event?.durations?.[selectedPlanLine] || 0;
            })(),
            cip3: (() => {
                const event = lineEvents.find(e => e.event === 'CIP3');
                return event?.durations?.[selectedPlanLine] || 0;
            })()
        };
        if (lineProducts.length === 0) {
            setTransitionError('Нет продуктов для выбранной линии.');
            return;
        }
        setTransitionStatus('running');
        setTransitionError('');
        setTransitionProgress(0);
        setTransitionProgressNodes(null);
        setTransitionCompareResult(null);
        setTransitionResult(null);
        transitionWorkerRef.current.postMessage({
            type: 'compare',
            payload: {
                products: lineProducts,
                transitions: transitionRules,
                cipDurations: cipDurationsForOptimization,
                timeBudgetMs
            }
        });
    };

    const applyOptimizedOrder = (orderKeys) => {
        if (!Array.isArray(orderKeys) || orderKeys.length === 0) return;
        const lineItems = [];
        const lineIndices = [];
        products.forEach((product, index) => {
            if (product.line !== selectedPlanLine) return;
            lineIndices.push(index);
            lineItems.push({
                index,
                product,
                cip: cipBetween[index]
            });
        });
        if (lineItems.length === 0) return;

        const queues = new Map();
        lineItems.forEach((item) => {
            const key = getTransitionKeyForName(item.product.name);
            if (!queues.has(key)) queues.set(key, []);
            queues.get(key).push(item);
        });

        const reordered = [];
        orderKeys.forEach((key) => {
            const queue = queues.get(key);
            if (queue && queue.length) {
                reordered.push(queue.shift());
            }
        });

        queues.forEach((queue) => {
            while (queue.length) reordered.push(queue.shift());
        });

        if (reordered.length < lineItems.length) {
            const used = new Set(reordered.map(item => item.index));
            lineItems.forEach((item) => {
                if (!used.has(item.index)) reordered.push(item);
            });
        }

        const nextProducts = [...products];
        const nextCipBetween = [...cipBetween];
        lineIndices.forEach((idx, i) => {
            const item = reordered[i];
            if (!item) return;
            nextProducts[idx] = { ...item.product };
            if (idx < nextCipBetween.length) {
                nextCipBetween[idx] = item.cip ? { ...item.cip } : item.cip;
            }
        });

        const lineProducts = nextProducts
            .map((product, index) => ({ product, index }))
            .filter(({ product }) => product.line === selectedPlanLine);
        let missingRules = 0;
        for (let i = 0; i < lineProducts.length - 1; i += 1) {
            const from = lineProducts[i];
            const to = lineProducts[i + 1];
            const fromKey = getTransitionKeyForName(from.product.name);
            const toKey = getTransitionKeyForName(to.product.name);
            const rule = transitionRuleMap.get(fromKey);
            if (!rule || !transitionRuleMap.has(toKey)) {
                missingRules += 1;
                continue;
            }
            if (!nextCipBetween[from.index]) {
                nextCipBetween[from.index] = {
                    id: `cip_${Date.now()}_${from.index}`,
                    date: from.product.date || nextProducts[0]?.date || '27.01.2026',
                    manualDate: false,
                    start: '',
                    end: '',
                    manualStart: false,
                    manualEnd: false,
                    line: selectedPlanLine,
                    eventKey: ''
                };
            }
            const cipKey = getTransitionCipKey(rule, toKey);
            const eventKey = getEventKeyForCipKey(cipKey);
            nextCipBetween[from.index] = {
                ...nextCipBetween[from.index],
                line: selectedPlanLine,
                eventKey
            };
        }

        setProducts(nextProducts);
        setCipBetween(nextCipBetween);
        if (missingRules > 0) {
            setTransitionError(`Нет правил перехода для ${missingRules} переход(ов).`);
        }
    };

    const applyTransitionsForCurrentOrder = () => {
        setTransitionError('');
        const lineProducts = products
            .map((product, index) => ({ product, index }))
            .filter(({ product }) => product.line === selectedPlanLine);
        if (lineProducts.length < 2) {
            setTransitionError('Недостаточно продуктов для расстановки переходов.');
            return;
        }
        let missingRules = 0;
        const nextCipBetween = [...cipBetween];
        for (let i = 0; i < lineProducts.length - 1; i += 1) {
            const from = lineProducts[i];
            const to = lineProducts[i + 1];
            const fromKey = getTransitionKeyForName(from.product.name);
            const toKey = getTransitionKeyForName(to.product.name);
            const rule = transitionRuleMap.get(fromKey);
            if (!rule || !transitionRuleMap.has(toKey)) {
                missingRules += 1;
                continue;
            }
            if (!nextCipBetween[from.index]) continue;
            const cipKey = getTransitionCipKey(rule, toKey);
            const eventKey = getEventKeyForCipKey(cipKey);
            nextCipBetween[from.index] = {
                ...nextCipBetween[from.index],
                line: selectedPlanLine,
                eventKey
            };
        }
        setCipBetween(nextCipBetween);
        if (missingRules > 0) {
            setTransitionError(`Нет правил перехода для ${missingRules} переход(ов).`);
        }
    };

    const handleSaveTransitionBase = () => {
        const payload = `export const TRANSITION_RULES_BASE = ${JSON.stringify(transitionRules, null, 4)};\n`;
        const blob = new Blob([payload], { type: 'text/javascript;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'transitionRulesBase.js';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        setTransitionSaveStatus('Файл выгружен');
        if (transitionSaveTimeoutRef.current) {
            clearTimeout(transitionSaveTimeoutRef.current);
        }
        transitionSaveTimeoutRef.current = setTimeout(() => {
            setTransitionSaveStatus('');
        }, 2000);
    };

    const handlePasteImport = (target) => {
        if (target === 'plan') setPlanImportError('');
        if (target === 'reference') setProductImportError('');
        try {
            const items = parseProductPaste(pasteText, target === 'plan');
            if (items.length === 0) {
                if (target === 'plan') setPlanImportError('Данные не распознаны. Проверьте формат.');
                if (target === 'reference') setProductImportError('Данные не распознаны. Проверьте формат.');
                return;
            }
            if (target === 'plan') {
                const baseDate = products[0]?.date || '27.01.2026';
                const nextProducts = items.map((item, idx) => ({
                    id: `plan_${Date.now()}_${idx}`,
                    date: baseDate,
                    manualDate: false,
                    start: '',
                    end: '',
                    manualStart: false,
                    manualEnd: false,
                    line: selectedPlanLine,
                    name: item.name,
                    qty: item.qty || '',
                    speed: findSpeedForVolume(selectedPlanLine, item.volume) || item.speed || ''
                }));
                const nextCipBetween = nextProducts.slice(0, -1).map((_, idx) => ({
                    id: `cip_${Date.now()}_${idx}`,
                    date: baseDate,
                    manualDate: false,
                    start: '',
                    end: '',
                    manualStart: false,
                    manualEnd: false,
                    line: selectedPlanLine,
                    eventKey: eventOptions[0]?.key || ''
                }));
                setProducts(nextProducts);
                setCipBetween(nextCipBetween);
            } else {
                setBaseProducts(items);
            }
            setIsProductImportOpen(false);
            setIsPlanImportOpen(false);
            setPasteText('');
        } catch (err) {
            const message = err?.message || 'Ошибка импорта данных.';
            if (target === 'plan') setPlanImportError(message);
            if (target === 'reference') setProductImportError(message);
        }
    };

    const eventOptions = useMemo(() => {
        return lineEvents.map((item) => {
            const key = `${item.category}__${item.event || ''}`;
            const label = item.event ? `${item.category} (${item.event})` : item.category;
            return { key, label };
        });
    }, [lineEvents]);

    const eventLabelByKey = useMemo(() => {
        return eventOptions.reduce((acc, option) => {
            acc[option.key] = option.label;
            return acc;
        }, {});
    }, [eventOptions]);

    const getEventKeyForCipKey = (cipKey) => {
        const targetsByCip = {
            cip1: ['CIP1c', 'CIP1h'],
            cip2: ['CIP2'],
            cip3: ['CIP3']
        };
        const targets = targetsByCip[cipKey] || [];
        for (let i = 0; i < targets.length; i += 1) {
            const target = targets[i];
            const match = lineEvents.find((item) => item.event === target);
            if (match) return `${match.category}__${match.event || ''}`;
        }
        return eventOptions[0]?.key || '';
    };

    const eventDurationByKey = useMemo(() => {
        return lineEvents.reduce((acc, item) => {
            const key = `${item.category}__${item.event || ''}`;
            acc[key] = item.durations || {};
            return acc;
        }, {});
    }, [lineEvents]);

    const CIP_FALLBACK_DURATION_MIN = 15;

    const getEventDurationMinutes = (eventKey, lineName) => {
        const durations = eventDurationByKey[eventKey];
        if (!durations) return 0;
        const value = durations[lineName];
        if (value !== undefined && value !== null && value !== '') {
            const n = Number.isFinite(value) ? value : parseNumeric(value);
            if (Number.isFinite(n)) return Math.max(0, n);
        }
        const fallback = Object.values(durations).find((v) => {
            const n = Number.isFinite(v) ? v : parseNumeric(v);
            return Number.isFinite(n) && n > 0;
        });
        return fallback != null ? (Number.isFinite(fallback) ? fallback : parseNumeric(fallback)) : 0;
    };

    const getProductDurationMinutes = (product) => {
        const qty = parseNumeric(product.qty);
        const speed = parseNumeric(product.speed);
        if (qty <= 0 || speed <= 0) return 0;
        return Math.max(0, Math.round((qty / speed) * 60));
    };

    const buildRows = (
        nextProducts,
        nextCipBetween,
        lineFilter = selectedPlanLine,
        missingMap = missingTransitionByIndex
    ) => {
        const rows = [];
        const safeMissing = missingMap || new Map();
        nextProducts.forEach((p, i) => {
            if (p.line !== lineFilter) return;
            rows.push({
                kind: 'product',
                index: i,
                ...p,
                durationMinutes: getProductDurationMinutes(p)
            });
            if (i < nextCipBetween.length) {
                const cip = nextCipBetween[i];
                if (!cip) return;
                const rowLine = cip.line || p.line || lineFilter;
                if (rowLine !== lineFilter) return;
                const eventKey = cip.eventKey || (eventOptions[0]?.key ?? '');
                const rawCipMinutes = getEventDurationMinutes(eventKey, rowLine);
                rows.push({
                    kind: 'cip',
                    index: i,
                    ...cip,
                    line: rowLine,
                    eventKey,
                    missingTransition: safeMissing.get(i) === true,
                    durationMinutes: rawCipMinutes > 0 ? rawCipMinutes : CIP_FALLBACK_DURATION_MIN
                });
            }
        });
        return rows;
    };

    const applySchedule = (rows, anchorIndex) => {
        if (rows.length === 0) return rows;
        const safeAnchor = Math.max(0, Math.min(rows.length - 1, anchorIndex ?? 0));
        const anchorRow = rows[safeAnchor];
        const anchorStartManual = anchorRow.manualStart && anchorRow.start;
        const anchorEndManual = anchorRow.manualEnd && anchorRow.end;
        const anchorDateManual = anchorRow.manualDate && anchorRow.date;

        const baseDate = anchorDateManual || anchorRow.date || rows[0].date || '27.01.2026';
        const anchorDayIndex = parseDateToDayIndex(baseDate) ?? parseDateToDayIndex('27.01.2026') ?? 0;

        const totalDuration = rows.reduce((sum, row) => sum + (row.durationMinutes || 0), 0);
        if (totalDuration === 0) {
            if (anchorStartManual) {
                anchorRow.end = formatMinutesToTime(parseTimeToMinutes(anchorRow.start));
            } else if (anchorEndManual) {
                anchorRow.start = formatMinutesToTime(parseTimeToMinutes(anchorRow.end));
            }
            return rows;
        }

        let anchorStartMinutes = 0;
        let anchorEndMinutes = 0;

        if (anchorStartManual) {
            anchorStartMinutes = parseTimeToMinutes(anchorRow.start);
            anchorEndMinutes = anchorStartMinutes + anchorRow.durationMinutes;
        } else if (anchorEndManual) {
            anchorEndMinutes = parseTimeToMinutes(anchorRow.end);
            anchorStartMinutes = anchorEndMinutes - anchorRow.durationMinutes;
        } else {
            const baseStart = anchorRow.start || rows[0].start || '07:00';
            anchorStartMinutes = parseTimeToMinutes(baseStart);
            anchorEndMinutes = anchorStartMinutes + anchorRow.durationMinutes;
        }

        const absStart = new Array(rows.length).fill(0);
        const absEnd = new Array(rows.length).fill(0);
        absStart[safeAnchor] = anchorDayIndex * 1440 + anchorStartMinutes;
        absEnd[safeAnchor] = absStart[safeAnchor] + anchorRow.durationMinutes;

        for (let i = safeAnchor - 1; i >= 0; i -= 1) {
            absEnd[i] = absStart[i + 1];
            absStart[i] = absEnd[i] - rows[i].durationMinutes;
        }

        for (let i = safeAnchor + 1; i < rows.length; i += 1) {
            absStart[i] = absEnd[i - 1];
            absEnd[i] = absStart[i] + rows[i].durationMinutes;
        }

        rows.forEach((row, index) => {
            const startMinutes = absStart[index];
            const endMinutes = absEnd[index];
            const startDayIndex = Math.floor(startMinutes / 1440);
            const startTime = ((startMinutes % 1440) + 1440) % 1440;
            const endTime = ((endMinutes % 1440) + 1440) % 1440;
            row.date = formatDayIndexToDate(startDayIndex);
            row.start = formatMinutesToTime(startTime);
            row.end = formatMinutesToTime(endTime);
        });

        return rows;
    };

    const syncRowsToState = (rows) => {
        const nextProducts = products.map(p => ({ ...p }));
        const nextCip = cipBetween.map(c => ({ ...c }));
        rows.forEach((row) => {
            if (row.kind === 'product') {
                nextProducts[row.index] = {
                    ...nextProducts[row.index],
                    date: row.date,
                    start: row.start,
                    end: row.end,
                    manualDate: row.manualDate,
                    manualStart: row.manualStart,
                    manualEnd: row.manualEnd
                };
            } else {
                nextCip[row.index] = {
                    ...nextCip[row.index],
                    date: row.date,
                    start: row.start,
                    end: row.end,
                    manualDate: row.manualDate,
                    manualStart: row.manualStart,
                    manualEnd: row.manualEnd
                };
            }
        });
        setProducts(nextProducts);
        setCipBetween(nextCip);
    };

    const allRows = useMemo(() => {
        const rows = buildRows(products, cipBetween, selectedPlanLine, missingTransitionByIndex);
        const anchorIndex = rows.findIndex(r => r.manualStart || r.manualEnd);
        return applySchedule(rows, anchorIndex === -1 ? 0 : anchorIndex);
    }, [products, cipBetween, cipDurations, selectedPlanLine, lineEvents, missingTransitionByIndex]);

    const exportSections = useMemo(() => {
        return exportLines
            .map((line) => {
                const missing = buildMissingTransitionMap(line);
                const rows = buildRows(products, cipBetween, line, missing);
                const anchorIndex = rows.findIndex(r => r.manualStart || r.manualEnd);
                const scheduled = applySchedule(rows, anchorIndex === -1 ? 0 : anchorIndex);
                if (!scheduled.length) return null;
                const summary = {
                    totalDuration: scheduled.reduce((sum, row) => sum + (row.durationMinutes || 0), 0),
                    productDuration: scheduled
                        .filter(row => row.kind === 'product')
                        .reduce((sum, row) => sum + (row.durationMinutes || 0), 0),
                    cipDuration: scheduled
                        .filter(row => row.kind === 'cip')
                        .reduce((sum, row) => sum + (row.durationMinutes || 0), 0),
                    start: scheduled[0]?.start || '—',
                    end: scheduled[scheduled.length - 1]?.end || '—',
                    date: scheduled[0]?.date || '—'
                };
                const formattedRows = scheduled.map((row, index) => ({
                    ...row,
                    label: row.kind === 'cip'
                        ? eventLabelByKey[row.eventKey] || row.eventKey || 'CIP'
                        : row.name,
                    displayIndex: index + 1,
                    quantityLabel: row.qty || '—',
                    displayDuration: row.durationMinutes ? `${row.durationMinutes} мин` : '—'
                }));
                return {
                    line,
                    rows: formattedRows,
                    summary
                };
            })
            .filter(Boolean);
    }, [exportLines, products, cipBetween, buildMissingTransitionMap, eventLabelByKey]);

    useEffect(() => {
        const rows = buildRows(products, cipBetween, selectedPlanLine, missingTransitionByIndex);
        const anchorIndex = rows.findIndex(r => r.manualStart || r.manualEnd);
        const scheduled = applySchedule(rows, anchorIndex === -1 ? 0 : anchorIndex);
        const needsUpdate = scheduled.some((row) => {
            const src = row.kind === 'product' ? products[row.index] : cipBetween[row.index];
            return src.start !== row.start || src.end !== row.end;
        });
        if (needsUpdate) {
            syncRowsToState(scheduled);
        }
    }, [products, cipBetween, cipDurations, selectedPlanLine, lineEvents, missingTransitionByIndex]);

    const handleTimeChange = (row, field, value) => {
        const rows = buildRows(products, cipBetween, selectedPlanLine, missingTransitionByIndex);
        const index = rows.findIndex(r => r.kind === row.kind && r.index === row.index);
        if (index === -1) return;
        rows[index] = {
            ...rows[index],
            [field]: value,
            manualStart: field === 'start' ? true : rows[index].manualStart,
            manualEnd: field === 'end' ? true : rows[index].manualEnd
        };
        const scheduled = applySchedule(rows, index);
        syncRowsToState(scheduled);
    };

    const handleDateChange = (row, value) => {
        const rows = buildRows(products, cipBetween, selectedPlanLine, missingTransitionByIndex);
        const index = rows.findIndex(r => r.kind === row.kind && r.index === row.index);
        if (index === -1) return;
        rows[index] = {
            ...rows[index],
            date: parseDateInputValue(value),
            manualDate: true
        };
        const scheduled = applySchedule(rows, index);
        syncRowsToState(scheduled);
    };

    const handleCipTypeChange = (index, value) => {
        const next = cipBetween.map((item, i) => (i === index ? { ...item, eventKey: value } : item));
        setCipBetween(next);
    };

    const moveProduct = (from, to) => {
        if (from === to || from < 0 || to < 0 || from >= products.length || to >= products.length) return;
        const next = [...products];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        setProducts(next);
    };

    const toggleExportLine = (line) => {
        setExportLines((prev) => {
            if (prev.includes(line)) {
                return prev.filter(item => item !== line);
            }
            return [...prev, line];
        });
    };

    const handleExportReport = () => {
        if (exportSections.length === 0) return;
        const metadata = {
            title: 'Очередность розлива',
            lines: exportSections.map(section => section.line),
            generatedAt: new Date(),
            description: exportType === 'pdf' ? 'PDF-выгрузка' : 'Предпросмотр HTML'
        };
        if (exportType === 'pdf') {
            exportReportAsPdf(exportSections, metadata);
        } else {
            openReportPreview(exportSections, metadata);
        }
        setIsExportModalOpen(false);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
                <div className="bg-indigo-100 text-indigo-700 p-2 rounded-lg">
                    <Calendar size={20} />
                </div>
                <div className="flex-1">
                    <h2 className="text-lg font-bold text-slate-800">Планирование очередности розлива</h2>
                    <div className="text-xs text-slate-500">{`Макет для ${selectedPlanLine}`}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                    <Droplet size={14} className="text-blue-600" />
                    <select
                        value={selectedPlanLine}
                        onChange={(e) => setSelectedPlanLine(e.target.value)}
                        className="bg-transparent text-xs font-semibold focus:outline-none"
                    >
                        {LINE_OPTIONS.map(option => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 max-w-[1600px] mx-auto w-full space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-2 flex flex-wrap items-center gap-2">
                    {[
                        { id: 'schedule', label: 'График' },
                        { id: 'products', label: 'База продуктов' },
                        { id: 'speeds', label: 'Скорости' },
                        { id: 'cips', label: 'CIP' },
                        { id: 'transitions', label: 'Переходы' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'products' && (
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                    <Database size={16} className="text-slate-500" />
                                    <div className="text-sm font-semibold text-slate-700">База продуктов</div>
                                </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setProductImportError('');
                                        setPasteText('');
                                        setIsProductImportOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Импорт в справочник
                                </button>
                                <button className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg opacity-70 cursor-not-allowed">
                                    <Plus size={14} />
                                    Добавить
                                </button>
                            </div>
                            </div>
                            <div className="p-6">
                            {productImportError && (
                                <div className="mb-3 text-sm text-red-600">{productImportError}</div>
                            )}
                            {baseProducts.length === 0 ? (
                                <div className="text-sm text-slate-500">
                                    Пока нет продуктов. Импортируйте данные вставкой или добавьте вручную.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-600 font-semibold">
                                            <tr>
                                                <th className="px-4 py-2 border-b">Тип</th>
                                                <th className="px-4 py-2 border-b">Вкус</th>
                                                <th className="px-4 py-2 border-b text-right">Объем</th>
                                                <th className="px-4 py-2 border-b">Бренд</th>
                                                <th className="px-4 py-2 border-b text-right">Кол-во</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {baseProducts.map((item) => (
                                                <tr key={item.id} className="hover:bg-slate-50/60">
                                                    <td className="px-4 py-2">{item.type || '—'}</td>
                                                    <td className="px-4 py-2">{item.flavor || '—'}</td>
                                                    <td className="px-4 py-2 text-right">{item.volume || '—'}</td>
                                                    <td className="px-4 py-2">{item.brand || '—'}</td>
                                                    <td className="px-4 py-2 text-right">{item.qty || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'speeds' && (
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Database size={16} className="text-slate-500" />
                                    <div className="text-sm font-semibold text-slate-700">Справочник скоростей</div>
                                </div>
                                <button
                                    onClick={addSpeedLine}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    <Plus size={14} />
                                    Добавить линию
                                </button>
                            </div>
                            <div className="p-6">
                                {speedLines.length === 0 ? (
                                    <div className="text-sm text-slate-500">
                                        Пока нет линий. Добавьте линию и укажите объемы и скорости.
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {speedLines.map((line) => (
                                            <div key={line.id} className="border border-slate-200 rounded-lg">
                                                <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                                        <span className="text-xs font-semibold text-slate-500">Линия</span>
                                                        <input
                                                            type="text"
                                                            value={line.name}
                                                            onChange={(e) => updateSpeedLineName(line.id, e.target.value)}
                                                            className="h-8 rounded-md border border-slate-200 px-2 text-sm w-full sm:w-64"
                                                            placeholder="Напр. Линия 1"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => addSpeedEntry(line.id)}
                                                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                                                    >
                                                        <Plus size={14} />
                                                        Добавить объем
                                                    </button>
                                                </div>
                                                <div className="p-4 space-y-3">
                                                    {line.entries.map((entry) => (
                                                        <div key={entry.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                                                            <div className="md:col-span-3">
                                                                <label className="text-[11px] font-semibold text-slate-500">Формат / Объем</label>
                                                                <input
                                                                    type="text"
                                                                    value={entry.format}
                                                                    onChange={(e) => updateSpeedEntry(line.id, entry.id, 'format', e.target.value)}
                                                                    className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                                                                    placeholder="Напр. 0,75 л / 1,0 л"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[11px] font-semibold text-slate-500">Скорость (ед/час)</label>
                                                                <input
                                                                    type="number"
                                                                    value={entry.speed}
                                                                    onChange={(e) => updateSpeedEntry(line.id, entry.id, 'speed', e.target.value)}
                                                                    className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                                                                    placeholder="Напр. 6500"
                                                                    min="0"
                                                                />
                                                            </div>
                                                            <div className="flex items-end">
                                                                <button
                                                                    onClick={() => removeSpeedEntry(line.id, entry.id)}
                                                                    className="h-8 w-full md:w-auto px-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                                                                >
                                                                    Удалить
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'cips' && (
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Database size={16} className="text-slate-500" />
                                    <div className="text-sm font-semibold text-slate-700">События по линиям (мин)</div>
                                </div>
                                <button
                                    onClick={addLineEvent}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    <Plus size={14} />
                                    Добавить событие
                                </button>
                            </div>
                            <div className="p-6 overflow-x-auto">
                                <table className="w-full text-sm text-left border border-slate-200 rounded-lg overflow-hidden min-w-[1400px]">
                                    <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 border-b w-12">#</th>
                                            <th className="px-4 py-2 border-b min-w-[200px]">Категория</th>
                                            <th className="px-4 py-2 border-b min-w-[140px]">Event</th>
                                            {LINE_OPTIONS.map(line => (
                                                <th
                                                    key={line}
                                                    className="px-3 py-2 border-b text-center text-[11px] font-semibold whitespace-normal leading-tight min-w-[90px]"
                                                >
                                                    {line}
                                                </th>
                                            ))}
                                            <th className="px-4 py-2 border-b w-20 text-right">Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {lineEvents.map((row, idx) => (
                                            <tr key={`${row.category}_${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                                                <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="text"
                                                        value={row.category}
                                                        onChange={(e) => {
                                                            setLineEvents((prev) => prev.map((item, index) => (
                                                                index === idx ? { ...item, category: e.target.value } : item
                                                            )));
                                                        }}
                                                        className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                                                    />
                                                </td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="text"
                                                        value={row.event}
                                                        onChange={(e) => {
                                                            setLineEvents((prev) => prev.map((item, index) => (
                                                                index === idx ? { ...item, event: e.target.value } : item
                                                            )));
                                                        }}
                                                        className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                                                    />
                                                </td>
                                                {LINE_OPTIONS.map(line => (
                                                    <td key={`${row.category}_${line}`} className="px-4 py-2 text-right">
                                                        <input
                                                            type="number"
                                                            value={row.durations[line] ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                setLineEvents((prev) => prev.map((item, index) => {
                                                                    if (index !== idx) return item;
                                                                    return {
                                                                        ...item,
                                                                        durations: {
                                                                            ...item.durations,
                                                                            [line]: value === '' ? '' : Number(value)
                                                                        }
                                                                    };
                                                                }));
                                                            }}
                                                            className="h-8 w-20 rounded-md border border-slate-200 px-2 text-sm text-right mx-auto"
                                                            min="0"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="px-4 py-2 text-right">
                                                    <button
                                                        onClick={() => removeLineEvent(idx)}
                                                        className="px-2 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                                                    >
                                                        Удалить
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'transitions' && (
                    <div className="flex flex-col min-h-[calc(100vh-240px)]">
                        <div className="-mx-6 bg-slate-50/95 backdrop-blur border-b border-slate-200">
                            <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500">
                                        <Database size={16} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-slate-800">База переходов</div>
                                        <div className="text-xs text-slate-500">CIP-матрица и исключения</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {transitionSaveStatus && (
                                        <span className="text-xs text-emerald-600">{transitionSaveStatus}</span>
                                    )}
                                    <input
                                        type="text"
                                        value={transitionSearchQuery}
                                        onChange={(e) => setTransitionSearchQuery(e.target.value)}
                                        className="h-8 w-56 rounded-md border border-slate-200 px-2 text-xs"
                                        placeholder="Поиск по правилам..."
                                    />
                                    <button
                                        onClick={handleSaveTransitionBase}
                                        className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100"
                                    >
                                        Сохранить базу
                                    </button>
                                    <button
                                        onClick={addTransitionRule}
                                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                    >
                                        <Plus size={14} />
                                        Добавить правило
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 pt-4 grid grid-cols-1 gap-6">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
                                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                    <div className="text-sm font-semibold text-slate-700">Матрица переходов</div>
                                    <div className="text-xs text-slate-400">Наведите на строку для редактирования</div>
                                </div>
                                <div className="flex-1 min-h-0 overflow-auto">
                                    {filteredTransitionRules.length === 0 ? (
                                        <div className="p-6 text-sm text-slate-500">
                                            {transitionRules.length === 0
                                                ? 'Пока нет переходов. Добавьте первое правило.'
                                                : 'Ничего не найдено по фильтру.'}
                                        </div>
                                    ) : (
                                        <table className="w-full text-xs text-left min-w-[1100px]">
                                            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 font-semibold text-[11px] uppercase tracking-wide">
                                                <tr>
                                                    <th className="px-3 py-2 border-b min-w-[360px]">Тип + вкус</th>
                                                    <th className="px-3 py-2 border-b">CIP 1</th>
                                                    <th className="px-3 py-2 border-b">CIP 2</th>
                                                    <th className="px-3 py-2 border-b">CIP 3</th>
                                                    <th className="px-3 py-2 border-b w-20 text-right">Действия</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filteredTransitionRules.map((rule) => {
                                                    const isRowActive = hoveredTransitionRuleId === rule.id;
                                                    const productSearch = transitionSearch[rule.id]?.product || '';
                                                    const filteredProducts = productSearch
                                                        ? baseProducts.filter((product) =>
                                                            getTransitionKeyForProduct(product)
                                                                .toLowerCase()
                                                                .includes(productSearch.toLowerCase())
                                                        )
                                                        : [];
                                                    return (
                                                        <tr
                                                            key={rule.id}
                                                            className="group hover:bg-slate-50"
                                                            onMouseEnter={() => setHoveredTransitionRuleId(rule.id)}
                                                            onMouseLeave={() => {
                                                                setHoveredTransitionRuleId(null);
                                                                setActiveTransitionCell((prev) => (
                                                                    prev?.id === rule.id ? null : prev
                                                                ));
                                                            }}
                                                        >
                                                            <td className="px-3 py-2 align-top">
                                                                {isRowActive ? (
                                                                    <div className="flex flex-col gap-2">
                                                                        <input
                                                                            type="text"
                                                                            value={productSearch}
                                                                            onChange={(e) => updateTransitionSearch(rule.id, 'product', e.target.value)}
                                                                            className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
                                                                            placeholder="Поиск продукта..."
                                                                        />
                                                                        <select
                                                                            value={rule.productName}
                                                                            onChange={(e) => updateTransitionRule(rule.id, 'productName', e.target.value)}
                                                                            className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
                                                                        >
                                                                            <option value="">Выберите продукт</option>
                                                                            {filteredProducts.slice(0, 50).map((product) => {
                                                                                const label = getTransitionKeyForProduct(product);
                                                                                return (
                                                                                    <option key={product.id} value={label}>
                                                                                        {label || product.name}
                                                                                    </option>
                                                                                );
                                                                            })}
                                                                        </select>
                                                                        {!productSearch && (
                                                                            <span className="text-[10px] text-slate-400">
                                                                                Введите текст для поиска
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className={rule.productName ? 'text-slate-800' : 'text-slate-400'}>
                                                                        {rule.productName || 'Не выбран'}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {(['cip1', 'cip2', 'cip3']).map((cipKey) => {
                                                                const isCellActive = (
                                                                    activeTransitionCell?.id === rule.id
                                                                    && activeTransitionCell?.key === cipKey
                                                                ) || (isRowActive && transitionSearch[rule.id]?.[cipKey]);
                                                                const exceptions = String(rule[cipKey] || '')
                                                                    .split(',')
                                                                    .map(item => item.trim())
                                                                    .filter(Boolean);
                                                                return (
                                                                    <td key={cipKey} className="px-3 py-2 align-top">
                                                                        <div className="flex flex-col gap-2">
                                                                            <div className="flex items-center justify-between">
                                                                                {isRowActive ? (
                                                                                    <label className="flex items-center gap-2 text-[10px] text-slate-500">
                                                                                        <input
                                                                                            type="radio"
                                                                                            name={`base-${rule.id}`}
                                                                                            checked={rule.baseCip === cipKey}
                                                                                            onChange={() => updateTransitionRule(rule.id, 'baseCip', cipKey)}
                                                                                        />
                                                                                        Базовый
                                                                                    </label>
                                                                                ) : (
                                                                                    rule.baseCip === cipKey && (
                                                                                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                                                            Базовый
                                                                                        </span>
                                                                                    )
                                                                                )}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setActiveTransitionCell({ id: rule.id, key: cipKey });
                                                                                        updateTransitionSearch(rule.id, cipKey, transitionSearch[rule.id]?.[cipKey] || '');
                                                                                    }}
                                                                                    className={`h-5 w-5 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 ${
                                                                                        isRowActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                                                                    }`}
                                                                                    title="Добавить исключение"
                                                                                >
                                                                                    <Plus size={12} className="mx-auto" />
                                                                                </button>
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {exceptions.length === 0 ? (
                                                                                    <span className="text-[10px] text-slate-400">Без исключений</span>
                                                                                ) : (
                                                                                    exceptions.map((name) => (
                                                                                        <span
                                                                                            key={`${rule.id}_${cipKey}_${name}`}
                                                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]"
                                                                                        >
                                                                                            {name}
                                                                                            {isRowActive && (
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        const next = exceptions.filter(item => item !== name);
                                                                                                        updateTransitionRule(rule.id, cipKey, next.join(', '));
                                                                                                    }}
                                                                                                    className="text-slate-400 hover:text-red-500"
                                                                                                >
                                                                                                    ×
                                                                                                </button>
                                                                                            )}
                                                                                        </span>
                                                                                    ))
                                                                                )}
                                                                            </div>
                                                                            {isCellActive && (
                                                                                <>
                                                                                    <input
                                                                                        type="text"
                                                                                        value={transitionSearch[rule.id]?.[cipKey] || ''}
                                                                                        onChange={(e) => updateTransitionSearch(rule.id, cipKey, e.target.value)}
                                                                                        className="h-7 w-full rounded-md border border-slate-200 px-2 text-[11px]"
                                                                                        placeholder="Поиск и добавление..."
                                                                                        autoFocus
                                                                                    />
                                                                                    {transitionSearch[rule.id]?.[cipKey] && (
                                                                                        <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-md bg-white">
                                                                                            {baseProducts
                                                                                                .filter((product) =>
                                                                                                    getTransitionKeyForProduct(product)
                                                                                                        .toLowerCase()
                                                                                                        .includes((transitionSearch[rule.id]?.[cipKey] || '').toLowerCase())
                                                                                                )
                                                                                                .slice(0, 50)
                                                                                                .map((product) => (
                                                                                                    <button
                                                                                                        key={`${rule.id}_${cipKey}_${product.id}`}
                                                                                                        type="button"
                                                                                                        onClick={() => {
                                                                                                            const current = exceptions;
                                                                                                            const label = getTransitionKeyForProduct(product);
                                                                                                            if (label && !current.includes(label)) {
                                                                                                                updateTransitionRule(rule.id, cipKey, [...current, label].join(', '));
                                                                                                            }
                                                                                                        }}
                                                                                                        className="w-full text-left px-2 py-1 text-[11px] hover:bg-slate-50"
                                                                                                    >
                                                                                                        {getTransitionKeyForProduct(product) || product.name}
                                                                                                    </button>
                                                                                                ))}
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className="px-3 py-2 text-right align-top">
                                                                <button
                                                                    onClick={() => removeTransitionRule(rule.id)}
                                                                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                                                                    title="Удалить правило"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {activeTab === 'schedule' && (
                    <>
                        <div className="flex items-center justify-end gap-2">
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                                Алгоритм:
                                <select
                                    value={transitionAlgorithm}
                                    onChange={(e) => setTransitionAlgorithm(e.target.value)}
                                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                                >
                                    <option value="auto">Авто</option>
                                    <option value="heldKarp">Held–Karp</option>
                                    <option value="heuristic">Эвристика</option>
                                </select>
                            </label>
                            <button
                                onClick={applyTransitionsForCurrentOrder}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                            >
                                Расставить переходы
                            </button>
                            <button
                                onClick={() => {
                                    runTransitionCompare();
                                    setIsTransitionModalOpen(true);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-700 text-white rounded-lg hover:bg-slate-800"
                            >
                                Сверить HK и эвристику
                            </button>
                            <button
                                onClick={() => {
                                    runTransitionOptimization();
                                    setIsTransitionModalOpen(true);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                                Найти кратчайший путь
                            </button>
                            <button
                                onClick={() => {
                                    setPlanImportError('');
                                    setPasteText('');
                                    setIsPlanImportOpen(true);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Импорт в план
                            </button>
                                <button
                                    onClick={() => setIsExportModalOpen(true)}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                                >
                                    Выгрузить
                                </button>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                                <Clock4 size={16} className="text-slate-500" />
                                <div className="text-sm font-semibold text-slate-700">Очередность розлива</div>
                                <div className="text-xs text-slate-400">({allRows.length} позиций)</div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                                        <tr>
                                            <th className="px-6 py-3 border-b w-12">№</th>
                                            <th className="px-2 py-3 border-b w-10"></th>
                                            <th className="px-6 py-3 border-b">Дата</th>
                                            <th className="px-6 py-3 border-b">Начало</th>
                                            <th className="px-6 py-3 border-b">Конец</th>
                                            <th className="px-6 py-3 border-b">Наименование</th>
                                            <th className="px-6 py-3 border-b text-right">Количество</th>
                                            <th className="px-6 py-3 border-b text-right">Скорость</th>
                                            <th className="px-6 py-3 border-b text-right">Длительность</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {allRows.map((row, displayIndex) => {
                                            const isCip = row.kind === 'cip';
                                            const isMissingTransition = isCip && row.missingTransition;
                                            const durationLabel = row.durationMinutes > 0 ? `${row.durationMinutes} мин` : '—';
                                            return (
                                                <tr
                                                    key={row.id}
                                                    draggable={!isCip}
                                                    onDragStart={() => !isCip && setDragIndex(row.index)}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={() => {
                                                        if (isCip) return;
                                                        moveProduct(dragIndex, row.index);
                                                        setDragIndex(null);
                                                    }}
                                                    className={`hover:bg-slate-50/60 ${
                                                        isMissingTransition ? 'bg-red-50/70' : isCip ? 'bg-blue-50/40' : ''
                                                    }`}
                                                >
                                                    <td className="px-6 py-3 text-slate-500">{displayIndex + 1}</td>
                                                    <td className="px-2 py-3 text-slate-300">
                                                        {!isCip && <GripVertical size={14} />}
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="date"
                                                            value={formatDateInputValue(row.date)}
                                                            onChange={(e) => handleDateChange(row, e.target.value)}
                                                            className={`h-8 w-full rounded-md border px-2 text-sm ${
                                                                row.manualDate ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-slate-200'
                                                            }`}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="time"
                                                            value={row.start || ''}
                                                            onChange={(e) => handleTimeChange(row, 'start', e.target.value)}
                                                            className={`h-8 w-full rounded-md border px-2 text-sm ${
                                                                row.manualStart ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-slate-200'
                                                            }`}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="time"
                                                            value={row.end || ''}
                                                            onChange={(e) => handleTimeChange(row, 'end', e.target.value)}
                                                            className={`h-8 w-full rounded-md border px-2 text-sm ${
                                                                row.manualEnd ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-slate-200'
                                                            }`}
                                                        />
                                                    </td>
                                                    <td className={`px-6 py-3 font-medium ${isCip ? 'text-blue-700' : 'text-slate-800'}`}>
                                                {isCip ? (
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={row.eventKey || eventOptions[0]?.key || ''}
                                                            onChange={(e) => handleCipTypeChange(row.index, e.target.value)}
                                                            className={`h-8 rounded-md border px-2 text-sm ${
                                                                isMissingTransition
                                                                    ? 'border-red-300 bg-red-50 text-red-700'
                                                                    : 'border-blue-200 bg-blue-50 text-blue-700'
                                                            }`}
                                                        >
                                                            {eventOptions.map(option => (
                                                                <option key={option.key} value={option.key}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {isMissingTransition ? (
                                                            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-0.5">
                                                                Нет правил
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5">
                                                                Событие
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    row.name
                                                )}
                                                    </td>
                                                    <td className={`px-6 py-3 text-right ${isCip ? 'text-slate-400' : 'font-semibold text-slate-700'}`}>
                                                        {isCip ? '—' : row.qty}
                                                    </td>
                                                    <td className={`px-6 py-3 text-right ${isCip ? 'text-slate-400' : 'text-slate-600'}`}>
                                                        {isCip ? '—' : `${row.speed}/ч`}
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-slate-600">{durationLabel}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
            {isProductImportOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="text-lg font-semibold text-slate-800">
                                Импорт в справочник продуктов
                            </div>
                            <button
                                onClick={() => setIsProductImportOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-sm"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="text-sm text-slate-600">
                                Вставьте данные из буфера (Ctrl+V). Кол-во будет проигнорировано.
                            </div>
                            <textarea
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                rows={8}
                                className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Вставьте данные сюда..."
                            />
                            {productImportError && (
                                <div className="text-sm text-red-600">{productImportError}</div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setIsProductImportOpen(false)}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={() => handlePasteImport('reference')}
                                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Импортировать
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isExportModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <div className="text-lg font-semibold text-slate-800">Выгрузка отчета</div>
                                <div className="text-xs text-slate-500">Формируйте отчеты по выбранным линиям</div>
                            </div>
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-sm"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="text-sm text-slate-600">Выберите линии для экспорта</div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {LINE_OPTIONS.map(line => (
                                    <label
                                        key={line}
                                        className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={exportLines.includes(line)}
                                            onChange={() => toggleExportLine(line)}
                                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>{line}</span>
                                    </label>
                                ))}
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Тип отчета</div>
                                <div className="mt-2 flex flex-wrap gap-3">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <input
                                            type="radio"
                                            name="exportType"
                                            value="html"
                                            checked={exportType === 'html'}
                                            onChange={() => setExportType('html')}
                                            className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                        />
                                        HTML-просмотр
                                    </label>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <input
                                            type="radio"
                                            name="exportType"
                                            value="pdf"
                                            checked={exportType === 'pdf'}
                                            onChange={() => setExportType('pdf')}
                                            className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                        />
                                        PDF-выгрузка
                                    </label>
                                </div>
                            </div>
                            <div className="text-sm text-slate-500">
                                <div>Выбраны линии: {exportLines.length > 0 ? exportLines.join(', ') : 'не выбрано'}</div>
                                <div className="text-xs text-slate-400">
                                    {exportSections.length > 0
                                        ? `Данные готовы для ${exportSections.length} секций.`
                                        : 'Нет позиций для выбранных линий.'}
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleExportReport}
                                disabled={exportSections.length === 0}
                                className={`px-3 py-2 text-sm font-semibold rounded-lg ${
                                    exportSections.length === 0
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                            >
                                {exportType === 'pdf' ? 'Скачать PDF' : 'Открыть HTML'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isPlanImportOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="text-lg font-semibold text-slate-800">Импорт в план</div>
                            <button
                                onClick={() => setIsPlanImportOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-sm"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="text-sm text-slate-600">
                                Вставьте данные из буфера (Ctrl+V). Кол-во будет учтено.
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500">Линия</label>
                                <select
                                    value={selectedPlanLine}
                                    onChange={(e) => setSelectedPlanLine(e.target.value)}
                                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
                                >
                                    {LINE_OPTIONS.map(option => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <textarea
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                rows={8}
                                className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Вставьте данные сюда..."
                            />
                            {planImportError && (
                                <div className="text-sm text-red-600">{planImportError}</div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setIsPlanImportOpen(false)}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={() => handlePasteImport('plan')}
                                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Импортировать
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isTransitionModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="text-lg font-semibold text-slate-800">Предложенная последовательность</div>
                            <button
                                onClick={() => setIsTransitionModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-sm"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4 text-sm text-slate-700">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                Статус: {transitionStatus === 'running' ? 'выполняется' : transitionStatus === 'done' ? 'готово' : 'ожидание'}
                                {transitionStatus === 'running' && (
                                    <div className="mt-2 space-y-1">
                                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                                            <span>Прогресс</span>
                                            {transitionProgressNodes !== null
                                                ? <span>Узлов: {transitionProgressNodes}</span>
                                                : <span>{Math.round(transitionProgress * 100)}%</span>}
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-slate-200">
                                            <div
                                                className="h-full rounded-full bg-blue-500 transition-all"
                                                style={{ width: `${Math.min(100, Math.max(0, transitionProgress * 100))}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            {transitionError && (
                                <div className="text-xs text-red-600">{transitionError}</div>
                            )}
                            {transitionStatus === 'done' && (
                                transitionCompareResult ? (
                                    <div className="space-y-3">
                                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                            <div className="text-xs text-slate-500">Сравнение алгоритмов</div>
                                            <div className="mt-2 space-y-1 text-sm">
                                                <div>Held–Karp: {transitionCompareResult.heldKarp?.totalCost ?? 0} мин</div>
                                                <div>Эвристика: {transitionCompareResult.heuristic?.totalCost ?? 0} мин</div>
                                                <div className="text-xs text-slate-500">
                                                    Разница: {(transitionCompareResult.heuristic?.totalCost ?? 0) - (transitionCompareResult.heldKarp?.totalCost ?? 0)} мин
                                                </div>
                                                {bestCompareResult && (
                                                    <div className="text-xs text-emerald-600">
                                                        Лучший: {bestCompareResult.label} ({bestCompareResult.totalCost} мин)
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : transitionResult?.order?.length > 0 ? (
                                    <div className="space-y-4">
                                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                            <div className="text-xs text-slate-500">Время</div>
                                            <div className="mt-1 text-sm">
                                                Было: {transitionAnalytics.was.total} мин
                                                {transitionAnalytics.was.missingRules > 0 && (
                                                    <span className="text-xs text-slate-500">
                                                        {' '}({transitionAnalytics.was.missingRules} без правил)
                                                    </span>
                                                )}
                                                {transitionAnalytics.was.missingDurations > 0 && (
                                                    <span className="text-xs text-slate-500">
                                                        {' '}({transitionAnalytics.was.missingDurations} без норм)
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm">
                                                Стало: {transitionAnalytics.now.total} мин
                                                {transitionAnalytics.now.missingRules > 0 && (
                                                    <span className="text-xs text-slate-500">
                                                        {' '}({transitionAnalytics.now.missingRules} без правил)
                                                    </span>
                                                )}
                                                {transitionAnalytics.now.missingDurations > 0 && (
                                                    <span className="text-xs text-slate-500">
                                                        {' '}({transitionAnalytics.now.missingDurations} без норм)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                                Переходы которые стали
                                            </div>
                                            <ol className="mt-2 space-y-1">
                                                {transitionAnalytics.now.rows.map((row, idx) => (
                                                    <li key={`${row.from}_${row.to}_${idx}`} className="text-sm">
                                                        {idx + 1}. {row.from} → {row.to} — {row.cipKey ? row.cipKey.toUpperCase() : 'НЕТ ПРАВИЛ'} (
                                                        {row.duration === null ? '—' : `${row.duration} мин`}
                                                        )
                                                    </li>
                                                ))}
                                            </ol>
                                            {transitionAnalytics.now.missingDurations > 0 && (
                                                <div className="mt-2 text-xs text-slate-500">
                                                    Для точного времени заполните нормы CIP в таблице «CIP».
                                                </div>
                                            )}
                                            {transitionAnalytics.now.missingRules > 0 && (
                                                <div className="mt-1 text-xs text-slate-500">
                                                    В базе переходов нет правил для некоторых продуктов.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div>Нет данных для расчета.</div>
                                )
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
                            {transitionStatus === 'done' && transitionResult?.order?.length > 0 && (
                                <button
                                    onClick={() => applyOptimizedOrder(transitionResult.order)}
                                    className="px-4 py-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                                >
                                    Применить
                                </button>
                            )}
                            {transitionStatus === 'done' && bestCompareResult?.order?.length > 0 && (
                                <button
                                    onClick={() => applyOptimizedOrder(bestCompareResult.order)}
                                    className="px-4 py-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                                >
                                    Применить лучшее
                                </button>
                            )}
                            {transitionStatus === 'running' && (
                                <button
                                    onClick={stopTransitionOptimization}
                                    className="px-4 py-2 text-sm font-semibold text-red-600 hover:text-red-700"
                                >
                                    Остановить
                                </button>
                            )}
                            <button
                                onClick={() => setIsTransitionModalOpen(false)}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(PlanningView);

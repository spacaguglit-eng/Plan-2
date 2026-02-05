import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Droplet, Plus, Clock4, Database, GripVertical, Trash2, BarChart2, Package, Zap, Beaker, GitBranch, ChevronDown, ChevronRight, Replace } from 'lucide-react';
import { STORAGE_KEYS, debounce, isLineMatch, expandCompositeLineKey } from '../../utils';
import { TRANSITION_RULES_BASE } from './transitionRulesBase';
import { openReportPreview, exportReportAsPdf } from '../../export/reportExport';
import { useData } from '../../context/DataContext';

const DEFAULT_LINE_OPTIONS = [
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
        start: '08:00',
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

const PRODUCT_PARSE_PATTERN = /^(?<type>Сироп|Нектар|Сок|Топпинг|Основа|Концентрат|Морс|Лимонад|Пюре|Переборка|соус|Тоник|Энергетический напиток|Напиток(?: с витаминами| тонизирующий)?)\s+(?<flavor>.+?)(?=\s+\d+(?:[,.]\d+)?\s*(?:л|кг|мл|г)|\s+0,33|\s+ТМ\s*[«"]?|\s*[-–—]\s*\d|\s*$)(?:\s+(?<volume>\d+(?:[,.]\d+)?\s*(?:л|кг|мл|г)|0,33))?(?:\s+(?:ПЭТ|ст|бут))?(?:\s+ТМ\s*(?:[«"](?<brand>[^"»]+)[»"]|(?<brand>[^\s\t]+)))?(?:\s*(?:[-–—])?\s*(?<qty>[\d\s]+)(?:\s*(?:шт|шт\.|штук))?)?/iu;

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

const canonicalTransitionKey = (key) => {
    if (key == null || key === '') return '';
    return String(key).trim().toLowerCase().replace(/\s+/g, ' ');
};

const extractProductParts = (value) => {
    if (!value) return { type: '', flavor: '', volume: '', brand: '' };
    const match = String(value).match(PRODUCT_PARSE_PATTERN);
    if (!match?.groups?.type || !match?.groups?.flavor) {
        return { type: '', flavor: '', volume: '', brand: '' };
    }
    const volume = match.groups.volume ? match.groups.volume.replace(',', '.').trim() : '';
    const brand = match.groups.brand ? match.groups.brand.trim() : '';
    return {
        type: match.groups.type.trim(),
        flavor: match.groups.flavor.trim(),
        volume,
        brand
    };
};

const normalizeVolumeForCompare = (vol) => {
    if (!vol || typeof vol !== 'string') return '';
    return vol.replace(/\s+/g, ' ').replace(',', '.').trim().toLowerCase();
};

const splitTransitionList = (value) => (
    String(value || '')
        .split(/[,;\n]+/)
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
    const { createPlanFromSchedule, loadPlan, loadPlanQueue, setCurrentPlanId, setPlanningStateToLoad, savedPlans, currentPlanId, planningStateVersion, planningStateToLoad, lineTemplates, floaters, workerRegistry, planningState: storedPlanning, persistStateKey, updatePlanPlanningState } = useData();
    const getTemplateKeyForLine = useCallback((line) => {
        if (!line || !lineTemplates) return line;
        const key = Object.keys(lineTemplates).find((k) => isLineMatch(line, k));
        return key ?? line;
    }, [lineTemplates]);
    const lineOptions = useMemo(() => {
        const keys = Object.keys(lineTemplates || {});
        if (keys.length === 0) return DEFAULT_LINE_OPTIONS;
        const expanded = keys.flatMap((k) => expandCompositeLineKey(k));
        const unique = Array.from(new Set(expanded));
        const filtered = unique.filter((name) => !/^Резерв\s/i.test(String(name)));
        const extractNum = (s) => {
            const m = String(s).match(/Линия\s*(\d+)/i);
            return m ? parseInt(m[1], 10) : null;
        };
        const sorted = filtered.sort((a, b) => {
            const na = extractNum(a);
            const nb = extractNum(b);
            if (na != null && nb != null) return na - nb;
            if (na != null) return -1;
            if (nb != null) return 1;
            return String(a).localeCompare(b, undefined, { numeric: true });
        });
        return sorted.length ? sorted : DEFAULT_LINE_OPTIONS;
    }, [lineTemplates]);
    const lineMatchesSelected = useCallback((line, selected) => {
        return line === selected || (!!line && !!selected && isLineMatch(line, selected));
    }, []);

    const activePlan = useMemo(
        () => savedPlans?.find(p => p.id === currentPlanId) ?? null,
        [savedPlans, currentPlanId]
    );
    const activePlanName = activePlan?.name ?? null;
    const activePlanHasQueue = !!(activePlan?.data?.planningState);
    const resolveLineOption = (value) => (
        lineOptions.includes(value) ? value : lineOptions[0]
    );

    const defaultPlanningDate = storedPlanning?.products?.[0]?.date || '27.01.2026';

    const buildDefaultShifts = (dateStr) => ([
        {
            shiftId: '1',
            type: 'День',
            date: dateStr,
            start: '08:00',
            end: '20:00'
        },
        {
            shiftId: '2',
            type: 'Ночь',
            date: dateStr,
            start: '20:00',
            end: '08:00'
        }
    ]);

    const buildShiftsFromRows = (rows) => {
        const allDates = Array.from(new Set(rows.map((r) => r.date).filter(Boolean)));
        const productDates = new Set(rows.filter((r) => r.kind === 'product').map((r) => r.date).filter(Boolean));
        const sourceDates = productDates.size > 0 ? Array.from(productDates) : allDates;
        const sortedDates = sourceDates.sort((a, b) => {
            const [da, ma, ya] = a.split('.').map(Number);
            const [db, mb, yb] = b.split('.').map(Number);
            return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
        });
        if (sortedDates.length === 0) return buildDefaultShifts(defaultPlanningDate);
        const result = [];
        sortedDates.forEach((d) => {
            const day = buildDefaultShifts(d);
            result.push(...day);
        });
        return result;
    };

    const initialTab = storedPlanning.activeTab || 'schedule';
    const [activeTab, setActiveTab] = useState(initialTab);
    const [visitedTabs, setVisitedTabs] = useState(() => ({ [initialTab]: true }));
    const [cipDurations, setCipDurations] = useState(
        () => storedPlanning.cipDurations || DEFAULT_CIP_DURATIONS
    );
    const [baseProducts, setBaseProducts] = useState(
        () => storedPlanning.baseProducts || []
    );
    const [productImportError, setProductImportError] = useState('');
    const [planImportError, setPlanImportError] = useState('');
    const [planCreateError, setPlanCreateError] = useState('');
    const [planCreateStatus, setPlanCreateStatus] = useState('idle');
    const [lineWorkError, setLineWorkError] = useState('');
    const [pasteText, setPasteText] = useState('');
    const [isProductImportOpen, setIsProductImportOpen] = useState(false);
    const [isPlanImportOpen, setIsPlanImportOpen] = useState(false);
    const [planImportPreview, setPlanImportPreview] = useState(null);
    const [isLineWorkPlanOpen, setIsLineWorkPlanOpen] = useState(false);
    const [lineWorkDraft, setLineWorkDraft] = useState({});
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
    const [lineWorkDates, setLineWorkDates] = useState(
        () => storedPlanning.lineWorkDates || {}
    );

    const eventCountByLine = useMemo(() => {
        const map = {};
        lineOptions.forEach((line) => {
            const nProducts = products.filter((p) => lineMatchesSelected(p?.line, line)).length;
            const nCips = cipBetween.filter((c) => lineMatchesSelected(c?.line, line)).length;
            map[line] = nProducts + nCips;
        });
        return map;
    }, [lineOptions, products, cipBetween, lineMatchesSelected]);

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
    const [expandedCipIndex, setExpandedCipIndex] = useState(null);
    const [transitionSearch, setTransitionSearch] = useState({});
    const [transitionResult, setTransitionResult] = useState(null);
    const [transitionStatus, setTransitionStatus] = useState('idle');
    const [transitionError, setTransitionError] = useState('');
    const [transitionProgress, setTransitionProgress] = useState(0);
    const [transitionProgressNodes, setTransitionProgressNodes] = useState(null);
    const [transitionSaveStatus, setTransitionSaveStatus] = useState('');
    const [transitionSearchQuery, setTransitionSearchQuery] = useState('');
    const [displacementRules, setDisplacementRules] = useState(
        () => storedPlanning.displacementRules || []
    );
    const [hoveredTransitionRuleId, setHoveredTransitionRuleId] = useState(null);
    const [activeTransitionCell, setActiveTransitionCell] = useState(null);
    const [activeProductSearchCell, setActiveProductSearchCell] = useState(null);
    const [productSearchQuery, setProductSearchQuery] = useState('');
    const [transitionPage, setTransitionPage] = useState(1);
    const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [planSaveName, setPlanSaveName] = useState('');
    const [exportType, setExportType] = useState(() => storedPlanning.exportType || 'html');
    const [exportLines, setExportLines] = useState(() => {
        const stored = (storedPlanning.exportLines || [])
            .map(resolveLineOption)
            .filter(Boolean);
        if (stored.length > 0) return stored;
        return [resolveLineOption(storedPlanning.selectedPlanLine || lineOptions[0])];
    });
    const transitionWorkerRef = useRef(null);
    const transitionSaveTimeoutRef = useRef(null);
    const normalizedLinesRef = useRef(false);
    const skipNextLocalStorageApplyRef = useRef(false);
    const skipNextSaveRef = useRef(false);
    const loadPlanQueueRef = useRef(loadPlanQueue);
    loadPlanQueueRef.current = loadPlanQueue;
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
        if (baseProduct) return canonicalTransitionKey(getTransitionKeyForProduct(baseProduct));
        const { type, flavor } = extractTypeFlavor(name);
        const key = buildTransitionKey(type, flavor);
        return canonicalTransitionKey(key || String(name).trim().toLowerCase());
    };

    const normalizeTransitionList = (value) => {
        const items = splitTransitionList(value)
            .map(item => getTransitionKeyForName(item))
            .filter(Boolean);
        return Array.from(new Set(items)).join(', ');
    };

    const transitionRuleMap = useMemo(() => {
        const map = new Map();
        (transitionRules || []).forEach((rule) => {
            const key = canonicalTransitionKey(getTransitionKeyForName(rule.productName));
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

    const lineTransitionKeys = useMemo(() => (
        products
            .filter(product => lineMatchesSelected(product.line, selectedPlanLine))
            .map(product => getTransitionKeyForName(product.name))
    ), [products, selectedPlanLine, getTransitionKeyForName, lineMatchesSelected]);

    const buildMissingTransitionMap = useCallback((line) => {
        const map = new Map();
        const lineProducts = products
            .map((product, index) => ({ product, index }))
            .filter(({ product }) => lineMatchesSelected(product.line, line));
        for (let i = 0; i < lineProducts.length - 1; i += 1) {
            const from = lineProducts[i];
            const to = lineProducts[i + 1];
            const fromKey = getTransitionKeyForName(from.product.name);
            const toKey = getTransitionKeyForName(to.product.name);
            const rule = transitionRuleMap.get(fromKey);
            if (!rule) {
                map.set(from.index, true);
            }
        }
        return map;
    }, [products, transitionRuleMap, getTransitionKeyForName, lineMatchesSelected]);

    const missingTransitionByIndex = useMemo(
        () => buildMissingTransitionMap(selectedPlanLine),
        [buildMissingTransitionMap, selectedPlanLine]
    );

    const optimizedOrderKeys = useMemo(() => {
        if (!transitionResult) return [];
        const indices = transitionResult.orderIndices;
        if (Array.isArray(indices) && indices.length > 0) {
            const mapped = indices.map((i) => lineTransitionKeys[i] ?? '');
            if (mapped.length > 0) return mapped;
        }
        return transitionResult.order || [];
    }, [transitionResult, lineTransitionKeys]);

    const transitionAnalytics = useMemo(() => {
        const getCipDuration = (cipKey) => {
            const patternByCip = { cip1: /CIP1/i, cip2: /CIP2/i, cip3: /CIP3/i };
            const re = patternByCip[cipKey];
            if (!re) return null;
            const event = lineEvents.find(e => re.test(e.category));
            if (!event) return null;
            const templateKey = getTemplateKeyForLine(selectedPlanLine);
            const raw = event.durations?.[selectedPlanLine] ?? event.durations?.[templateKey];
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
                if (!rule) {
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
        const was = getTransitions(lineTransitionKeys);
        const now = getTransitions(optimizedOrderKeys);
        return { was, now };
    }, [lineEvents, selectedPlanLine, transitionRuleMap, lineTransitionKeys, optimizedOrderKeys, getTemplateKeyForLine]);

    const TRANSITION_PAGE_SIZE = 20;

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

    const transitionTotalPages = Math.max(1, Math.ceil((filteredTransitionRules?.length || 0) / TRANSITION_PAGE_SIZE));
    const paginatedTransitionRules = useMemo(() => {
        const list = filteredTransitionRules || [];
        const start = (transitionPage - 1) * TRANSITION_PAGE_SIZE;
        return list.slice(start, start + TRANSITION_PAGE_SIZE);
    }, [filteredTransitionRules, transitionPage, TRANSITION_PAGE_SIZE]);

    useEffect(() => {
        setTransitionPage(1);
    }, [transitionSearchQuery]);

    useEffect(() => {
        if (transitionPage > transitionTotalPages && transitionTotalPages >= 1) {
            setTransitionPage(transitionTotalPages);
        }
    }, [transitionPage, transitionTotalPages]);

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
                setTransitionStatus('done');
                setTransitionProgress(1);
                setTransitionProgressNodes(payload?.nodesExplored ?? null);
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
        if (planningStateToLoad && typeof planningStateToLoad === 'object') {
            const loaded = planningStateToLoad;
            if (Array.isArray(loaded.products)) setProducts(loaded.products);
            if (Array.isArray(loaded.cipBetween)) setCipBetween(loaded.cipBetween);
            if (loaded.cipDurations) setCipDurations(loaded.cipDurations);
            if (Array.isArray(loaded.baseProducts)) setBaseProducts(loaded.baseProducts);
            if (Array.isArray(loaded.speedLines)) setSpeedLines(loaded.speedLines);
            if (loaded.selectedPlanLine && lineOptions.includes(loaded.selectedPlanLine)) setSelectedPlanLine(loaded.selectedPlanLine);
            if (Array.isArray(loaded.transitionRules)) setTransitionRules(loaded.transitionRules);
            if (Array.isArray(loaded.lineEvents)) setLineEvents(loaded.lineEvents);
            if (Array.isArray(loaded.exportLines)) setExportLines(loaded.exportLines.filter(l => lineOptions.includes(l)));
            if (loaded.exportType) setExportType(loaded.exportType);
            if (Array.isArray(loaded.displacementRules)) setDisplacementRules(loaded.displacementRules);
            if (loaded.lineWorkDates && typeof loaded.lineWorkDates === 'object') setLineWorkDates(loaded.lineWorkDates);
            skipNextLocalStorageApplyRef.current = true;
            skipNextSaveRef.current = true;
            normalizedLinesRef.current = false;
            if (setPlanningStateToLoad) setPlanningStateToLoad(null);
            return;
        }
        if (planningStateVersion > 0) {
            if (skipNextLocalStorageApplyRef.current) {
                skipNextLocalStorageApplyRef.current = false;
                return;
            }
            const loaded = storedPlanning;
            if (!loaded || typeof loaded !== 'object') return;
            if (Array.isArray(loaded.products)) setProducts(loaded.products);
            if (Array.isArray(loaded.cipBetween)) setCipBetween(loaded.cipBetween);
            if (loaded.cipDurations) setCipDurations(loaded.cipDurations);
            if (Array.isArray(loaded.baseProducts)) setBaseProducts(loaded.baseProducts);
            if (Array.isArray(loaded.speedLines)) setSpeedLines(loaded.speedLines);
            if (loaded.selectedPlanLine && lineOptions.includes(loaded.selectedPlanLine)) setSelectedPlanLine(loaded.selectedPlanLine);
            if (Array.isArray(loaded.transitionRules)) setTransitionRules(loaded.transitionRules);
            if (Array.isArray(loaded.lineEvents)) setLineEvents(loaded.lineEvents);
            if (Array.isArray(loaded.exportLines)) setExportLines(loaded.exportLines.filter(l => lineOptions.includes(l)));
            if (loaded.exportType) setExportType(loaded.exportType);
            if (Array.isArray(loaded.displacementRules)) setDisplacementRules(loaded.displacementRules);
            if (loaded.lineWorkDates && typeof loaded.lineWorkDates === 'object') setLineWorkDates(loaded.lineWorkDates);
        }
    }, [planningStateVersion, planningStateToLoad, setPlanningStateToLoad, storedPlanning]);

    useEffect(() => {
        if (activeTab === 'schedule' && currentPlanId && activePlanHasQueue) {
            loadPlanQueueRef.current?.(currentPlanId);
        }
    }, [activeTab, currentPlanId, activePlanHasQueue]);

    useEffect(() => {
        if (!useStoredTransitionRules) {
            setTransitionRules(TRANSITION_RULES_BASE);
        }
    }, [useStoredTransitionRules]);

    const savePlanningState = useMemo(() => debounce((nextState) => {
        persistStateKey(STORAGE_KEYS.PLANNING_STATE, nextState);
        if (updatePlanPlanningState && nextState) {
            updatePlanPlanningState(nextState);
        }
    }, 400), [persistStateKey, updatePlanPlanningState]);

    useEffect(() => {
        if (skipNextSaveRef.current) {
            skipNextSaveRef.current = false;
            return;
        }
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
            displacementRules,
            lineWorkDates
        });
    }, [
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
        displacementRules,
        lineWorkDates,
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

    const parseLineDatesInput = (value) => {
        const input = String(value || '').trim();
        if (!input) return { dates: [], errors: [] };
        const tokens = input.split(',').map((t) => t.trim()).filter(Boolean);
        const dates = new Set();
        const errors = [];
        tokens.forEach((token) => {
            const parts = token.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
            if (parts.length === 1) {
                const idx = parseDateToDayIndex(parts[0]);
                if (idx == null) {
                    errors.push(`Некорректная дата: ${token}`);
                } else {
                    dates.add(formatDayIndexToDate(idx));
                }
                return;
            }
            if (parts.length === 2) {
                const startIdx = parseDateToDayIndex(parts[0]);
                const endIdx = parseDateToDayIndex(parts[1]);
                if (startIdx == null || endIdx == null) {
                    errors.push(`Некорректный диапазон: ${token}`);
                    return;
                }
                const from = Math.min(startIdx, endIdx);
                const to = Math.max(startIdx, endIdx);
                for (let d = from; d <= to; d += 1) {
                    dates.add(formatDayIndexToDate(d));
                }
                return;
            }
            errors.push(`Некорректный диапазон: ${token}`);
        });
        const sorted = Array.from(dates).sort((a, b) => (parseDateToDayIndex(a) ?? 0) - (parseDateToDayIndex(b) ?? 0));
        return { dates: sorted, errors };
    };

    const buildLineWorkRows = (lineDatesMap) => {
        const rows = [];
        Object.entries(lineDatesMap || {}).forEach(([line, dates]) => {
            (dates || []).forEach((date) => {
                rows.push({
                    line,
                    date,
                    start: '08:00',
                    end: '08:00',
                    manualStart: true,
                    manualEnd: true,
                    kind: 'line',
                    name: `Работа ${line}`,
                    durationMinutes: 1440
                });
            });
        });
        return rows;
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

    const parseProductPastePreview = (text, includeQty) => {
        const trimmed = String(text || '').trim();
        const pattern = PRODUCT_PARSE_PATTERN;
        const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const ok = [];
        const okNoQty = [];
        const partial = [];

        lines.forEach((line, idx) => {
            const match = line.match(pattern);
            if (match?.groups?.type && match.groups?.flavor) {
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
                const item = {
                    id: `p_${Date.now()}_${idx}`,
                    name,
                    type,
                    flavor,
                    volume,
                    brand,
                    speed: '',
                    qty,
                    unit: ''
                };
                if (includeQty && !qty) {
                    okNoQty.push(item);
                } else {
                    ok.push(item);
                }
            } else {
                partial.push({ rawLine: line, lineIndex: idx + 1 });
            }
        });

        return { ok, okNoQty, partial };
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
                durations: lineOptions.reduce((acc, line) => {
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

    const productsWithoutRules = useMemo(() => {
        const keys = new Set();
        products
            .filter((p) => lineMatchesSelected(p.line, selectedPlanLine) && p.name)
            .forEach((p) => {
                const key = getTransitionKeyForName(p.name);
                if (key && !transitionRuleMap.has(key)) keys.add(key);
            });
        return Array.from(keys);
    }, [products, selectedPlanLine, transitionRuleMap, getTransitionKeyForName, lineMatchesSelected]);

    const addMissingProductsAsRules = () => {
        if (productsWithoutRules.length === 0) return;
        const now = Date.now();
        setTransitionRules((prev) => [
            ...prev,
            ...productsWithoutRules.map((key, i) => ({
                id: `tr_${now}_${prev.length + i}`,
                productName: key,
                baseCip: 'cip2',
                cip1: '',
                cip2: '',
                cip3: ''
            }))
        ]);
    };

    const removeTransitionRule = (id) => {
        setTransitionRules(prev => prev.filter(rule => rule.id !== id));
        setTransitionSearch(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const addDisplacementRule = () => {
        setDisplacementRules((prev) => [
            ...prev,
            { id: `dr_${Date.now()}_${prev.length}`, from: '', to: '', exception: '' }
        ]);
    };

    const removeDisplacementRule = (id) => {
        setDisplacementRules((prev) => prev.filter((r) => r.id !== id));
    };

    const updateDisplacementRule = (id, key, value) => {
        setDisplacementRules((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
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
            .filter(product => lineMatchesSelected(product.line, selectedPlanLine))
            .map(product => product.name)
            .filter(Boolean);
        const templateKey = getTemplateKeyForLine(selectedPlanLine);
        const dur = (event) => event?.durations?.[selectedPlanLine] ?? event?.durations?.[templateKey] ?? 0;
        const timeBudgetMs = 2500;
        const cipDurationsForOptimization = {
            cip1: dur(lineEvents.find(e => /CIP1/i.test(e.category))) || 0,
            cip2: dur(lineEvents.find(e => /CIP2/i.test(e.category))) || 0,
            cip3: dur(lineEvents.find(e => /CIP3/i.test(e.category))) || 0,
            perenaladka: dur(lineEvents.find(e => e.category && e.category.includes('Переналадка'))) || 0,
            smenaAssortimenta: dur(lineEvents.find(e => e.category && e.category.includes('Смена ассортимента'))) || 0,
            vytesnenie: dur(lineEvents.find(e => e.category && e.category.includes('Вытеснение'))) || 0
        };
        if (lineProducts.length === 0) {
            setTransitionError('Нет продуктов для выбранной линии.');
            return;
        }
        setTransitionStatus('running');
        setTransitionError('');
        setTransitionProgress(0);
        setTransitionProgressNodes(null);
        transitionWorkerRef.current.postMessage({
            type: 'optimize',
            payload: {
                products: lineProducts,
                currentOrderIndices: Array.from({ length: lineProducts.length }, (_, idx) => idx),
                transitions: transitionRules,
                cipDurations: cipDurationsForOptimization,
                displacementRules,
                timeBudgetMs
            }
        });
    };

    const applyOptimizedOrder = (orderKeysOrIndices) => {
        if (!Array.isArray(orderKeysOrIndices) || orderKeysOrIndices.length === 0) return;
        const lineItems = [];
        const lineIndices = [];
        products.forEach((product, index) => {
            if (!lineMatchesSelected(product.line, selectedPlanLine)) return;
            lineIndices.push(index);
            lineItems.push({
                index,
                product,
                cip: cipBetween[index]
            });
        });
        if (lineItems.length === 0) return;

        const useIndices = orderKeysOrIndices.every((x) => typeof x === 'number');
        let reordered;
        if (useIndices && orderKeysOrIndices.length === lineItems.length) {
            reordered = orderKeysOrIndices.map((i) => lineItems[i]).filter(Boolean);
            if (reordered.length < lineItems.length) {
                const used = new Set(reordered.map((item) => item.index));
                lineItems.forEach((item) => {
                    if (!used.has(item.index)) reordered.push(item);
                });
            }
        } else {
            const queues = new Map();
            lineItems.forEach((item) => {
                const key = getTransitionKeyForName(item.product.name);
                if (!queues.has(key)) queues.set(key, []);
                queues.get(key).push(item);
            });
            reordered = [];
            orderKeysOrIndices.forEach((key) => {
                const queue = queues.get(key);
                if (queue && queue.length) reordered.push(queue.shift());
            });
            queues.forEach((queue) => {
                while (queue.length) reordered.push(queue.shift());
            });
            if (reordered.length < lineItems.length) {
                const used = new Set(reordered.map((item) => item.index));
                lineItems.forEach((item) => {
                    if (!used.has(item.index)) reordered.push(item);
                });
            }
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
            .filter(({ product }) => lineMatchesSelected(product.line, selectedPlanLine));
        let missingRules = 0;
        for (let i = 0; i < lineProducts.length - 1; i += 1) {
            const from = lineProducts[i];
            const to = lineProducts[i + 1];
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
            const eventKey = getEventKeyBetweenProducts(from.product, to.product);
            if (eventKey == null) {
                missingRules += 1;
            } else {
                nextCipBetween[from.index] = {
                    ...nextCipBetween[from.index],
                    line: selectedPlanLine,
                    eventKey
                };
            }
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
            .filter(({ product }) => lineMatchesSelected(product.line, selectedPlanLine));
        if (lineProducts.length < 2) {
            setTransitionError('Недостаточно продуктов для расстановки переходов.');
            return;
        }
        let missingRules = 0;
        const nextCipBetween = [...cipBetween];
        for (let i = 0; i < lineProducts.length - 1; i += 1) {
            const from = lineProducts[i];
            const to = lineProducts[i + 1];
            if (!nextCipBetween[from.index]) continue;
            const eventKey = getEventKeyBetweenProducts(from.product, to.product);
            if (eventKey == null) {
                missingRules += 1;
            } else {
                nextCipBetween[from.index] = {
                    ...nextCipBetween[from.index],
                    line: selectedPlanLine,
                    eventKey
                };
            }
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

    const handlePasteImport = (target, options = {}) => {
        if (target === 'plan') setPlanImportError('');
        if (target === 'reference') setProductImportError('');
        try {
            const items = options.previewItems ?? parseProductPaste(pasteText, target === 'plan');
            if (items.length === 0) {
                if (target === 'plan') setPlanImportError('Данные не распознаны. Проверьте формат.');
                if (target === 'reference') setProductImportError('Данные не распознаны. Проверьте формат.');
                return;
            }
            if (target === 'plan') {
                const baseDate = products[0]?.date || '27.01.2026';
                const importedProducts = items.map((item, idx) => ({
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
                const importedCips = importedProducts.slice(0, -1).map((_, idx) => ({
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
                const byLine = {};
                products.forEach((p, i) => {
                    const line = p.line || selectedPlanLine;
                    if (!byLine[line]) byLine[line] = { products: [], indices: [] };
                    byLine[line].products.push({ ...p });
                    byLine[line].indices.push(i);
                });
                Object.keys(byLine).forEach((line) => {
                    const ord = byLine[line].indices.map((idx, j) => ({ idx, j })).sort((a, b) => a.idx - b.idx);
                    byLine[line].products = ord.map((o) => byLine[line].products[o.j]);
                    const indices = ord.map((o) => o.idx);
                    byLine[line].cips = [];
                    for (let j = 0; j < indices.length - 1; j += 1) {
                        const idx = indices[j];
                        if (cipBetween[idx]) byLine[line].cips.push({ ...cipBetween[idx] });
                        else byLine[line].cips.push({
                            id: `cip_${Date.now()}_${line}_${j}`,
                            date: baseDate,
                            manualDate: false,
                            start: '',
                            end: '',
                            manualStart: false,
                            manualEnd: false,
                            line,
                            eventKey: eventOptions[0]?.key || ''
                        });
                    }
                    delete byLine[line].indices;
                });
                byLine[selectedPlanLine] = { products: importedProducts, cips: importedCips };
                const nextProducts = [];
                const nextCipBetween = [];
                lineOptions.forEach((line) => {
                    const data = byLine[line];
                    if (!data || !data.products.length) return;
                    data.products.forEach((p, i) => {
                        nextProducts.push(p);
                        if (i < data.cips.length) nextCipBetween.push(data.cips[i]);
                    });
                });
                setProducts(nextProducts);
                setCipBetween(nextCipBetween);
            } else {
                setBaseProducts(items);
            }
            setIsProductImportOpen(false);
            setIsPlanImportOpen(false);
            setPlanImportPreview(null);
            setPasteText('');
        } catch (err) {
            const message = err?.message || 'Ошибка импорта данных.';
            if (target === 'plan') setPlanImportError(message);
            if (target === 'reference') setProductImportError(message);
        }
    };

    const eventOptions = useMemo(() => {
        return lineEvents.map((item) => ({
            key: item.category,
            label: item.category
        }));
    }, [lineEvents]);

    const eventLabelByKey = useMemo(() => {
        return eventOptions.reduce((acc, option) => {
            acc[option.key] = option.label;
            return acc;
        }, {});
    }, [eventOptions]);

    const getEventKeyForCipKey = (cipKey) => {
        const patternByCip = { cip1: /CIP1/i, cip2: /CIP2/i, cip3: /CIP3/i };
        const re = patternByCip[cipKey];
        if (!re) return eventOptions[0]?.key || '';
        const match = lineEvents.find((item) => re.test(item.category));
        return match ? match.category : (eventOptions[0]?.key || '');
    };

    const getEventKeyForCategoryName = (categoryName) => {
        const match = lineEvents.find(
            (item) => item.category === categoryName || (categoryName && item.category.includes(categoryName))
        );
        return match ? match.category : '';
    };

    const getEventKeyBetweenProducts = useCallback((fromProduct, toProduct) => {
        const fromParts = extractProductParts(fromProduct?.name);
        const toParts = extractProductParts(toProduct?.name);
        const volFrom = normalizeVolumeForCompare(fromParts.volume);
        const volTo = normalizeVolumeForCompare(toParts.volume);

        if (volFrom !== volTo) {
            const key = getEventKeyForCategoryName('Переналадка формата');
            if (key) return key;
        }

        const sameType = (fromParts.type || '').toLowerCase() === (toParts.type || '').toLowerCase();
        const sameFlavor = (fromParts.flavor || '').toLowerCase() === (toParts.flavor || '').toLowerCase();
        const sameVolume = volFrom === volTo;
        const brandFrom = (fromParts.brand || '').toLowerCase().trim();
        const brandTo = (toParts.brand || '').toLowerCase().trim();
        const differentBrand = brandFrom !== brandTo;

        if (sameType && sameFlavor && sameVolume && differentBrand) {
            const key = getEventKeyForCategoryName('Смена ассортимента');
            if (key) return key;
        }

        const fromFlavor = (fromParts.flavor || '').toLowerCase();
        const toFlavor = (toParts.flavor || '').toLowerCase();
        for (let i = 0; i < displacementRules.length; i += 1) {
            const r = displacementRules[i];
            const fromSub = (r.from || '').toLowerCase().trim();
            const toSub = (r.to || '').toLowerCase().trim();
            const excSub = (r.exception || '').toLowerCase().trim();
            if (!fromSub || !toSub) continue;
            if (fromFlavor.includes(fromSub) && toFlavor.includes(toSub) && (!excSub || !toFlavor.includes(excSub))) {
                const key = getEventKeyForCategoryName('Вытеснение');
                if (key) return key;
                break;
            }
        }

        const fromKey = getTransitionKeyForName(fromProduct?.name);
        const toKey = getTransitionKeyForName(toProduct?.name);
        const rule = transitionRuleMap.get(fromKey);
        if (!rule) return null;
        const cipKey = getTransitionCipKey(rule, toKey);
        return getEventKeyForCipKey(cipKey);
    }, [lineEvents, transitionRuleMap, getTransitionKeyForName, getEventKeyForCipKey, displacementRules]);

    const eventDurationByKey = useMemo(() => {
        return lineEvents.reduce((acc, item) => {
            acc[item.category] = item.durations || {};
            return acc;
        }, {});
    }, [lineEvents]);

    const CIP_FALLBACK_DURATION_MIN = 15;

    const getEventDurationMinutes = (eventKey, lineName) => {
        let durations = eventDurationByKey[eventKey];
        if (!durations && eventKey && eventKey.includes('__')) {
            durations = eventDurationByKey[eventKey.split('__')[0]];
        }
        if (!durations) return 0;
        const templateKey = getTemplateKeyForLine(lineName);
        const value = durations[lineName] ?? durations[templateKey];
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
            if (!lineMatchesSelected(p.line, lineFilter)) return;
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
                if (!lineMatchesSelected(rowLine, lineFilter)) return;
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
            const baseStart = anchorRow.start || rows[0].start || '08:00';
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
            const endDayIndex = Math.floor(endMinutes / 1440);
            const startTime = ((startMinutes % 1440) + 1440) % 1440;
            const endTime = ((endMinutes % 1440) + 1440) % 1440;
            row.date = formatDayIndexToDate(startDayIndex);
            row.endDate = formatDayIndexToDate(endDayIndex);
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

    const demandLineHeaders = useMemo(() => [...lineOptions, 'Ручная линия'], []);

    const buildAbsMinutes = (dateStr, timeStr) => {
        const dayIdx = parseDateToDayIndex(dateStr);
        if (dayIdx == null) return null;
        const minutes = parseTimeToMinutes(timeStr);
        return dayIdx * 1440 + minutes;
    };

    const isRowActiveForShift = (row, shift) => {
        if (!row?.line || !shift) return false;
        if (row.durationMinutes <= 0) return false;
        const rowStart = buildAbsMinutes(row.date, row.start);
        const rowEndRaw = buildAbsMinutes(row.date, row.end);
        if (rowStart == null || rowEndRaw == null) return false;
        const rowEnd = rowEndRaw <= rowStart ? rowEndRaw + 1440 : rowEndRaw;

        const shiftStart = buildAbsMinutes(shift.date, shift.start);
        const shiftEndRaw = buildAbsMinutes(shift.date, shift.end);
        if (shiftStart == null || shiftEndRaw == null) return false;
        const shiftEnd = shiftEndRaw <= shiftStart ? shiftEndRaw + 1440 : shiftEndRaw;

        const overlap = Math.min(rowEnd, shiftEnd) - Math.max(rowStart, shiftStart);
        return overlap > 0;
    };

    const buildDemandFromSchedule = (rows, shiftList) => {
        const header = new Array(15 + demandLineHeaders.length).fill('');
        header[11] = 'Дата';
        header[13] = 'Тип смены';
        header[14] = 'Смена';
        demandLineHeaders.forEach((line, idx) => {
            header[15 + idx] = line;
        });

        const table = [header];
        (shiftList || []).forEach((shift) => {
            const row = new Array(header.length).fill('');
            row[11] = shift.date || '';
            row[13] = shift.type || '';
            row[14] = shift.shiftId ? `Смена ${shift.shiftId}` : 'Смена';
            demandLineHeaders.forEach((line, idx) => {
                const active = rows.some((r) => lineMatchesSelected(r.line, line) && isRowActiveForShift(r, shift));
                row[15 + idx] = active ? 1 : '';
            });
            table.push(row);
        });
        return table;
    };

    const joinUnique = (items) => Array.from(new Set(items.filter(Boolean))).join(', ');

    const buildRosterFromDistribution = () => {
        const sourceLineTemplates = lineTemplates || {};
        const sourceFloaters = floaters || { day: [], night: [] };
        const sourceWorkerRegistry = workerRegistry || {};

        const header = new Array(19).fill('');
        header[4] = 'Линия';
        header[5] = 'Должность';
        header[6] = 'Норма';
        header[7] = 'Смена 1';
        header[8] = 'Компетенции 1';
        header[9] = 'Статус 1';
        header[10] = 'Смена 2';
        header[11] = 'Компетенции 2';
        header[12] = 'Статус 2';
        header[13] = 'Смена 3';
        header[14] = 'Компетенции 3';
        header[15] = 'Статус 3';
        header[16] = 'Смена 4';
        header[17] = 'Компетенции 4';
        header[18] = 'Статус 4';

        const table = [header];

        const fillRow = (lineName, role, count, rosterMap = {}) => {
            const row = new Array(header.length).fill('');
            row[4] = lineName;
            row[5] = role;
            row[6] = count;
            ['1', '2', '3', '4'].forEach((shiftId, idx) => {
                const namesStr = rosterMap[shiftId] || '';
                const names = namesStr
                    ? namesStr.split(/[,;\n/]+/).map((n) => n.trim()).filter((n) => n.length > 1)
                    : [];
                const compList = names.map((name) => joinUnique(Array.from(sourceWorkerRegistry?.[name]?.competencies || [])));
                const statusList = names.map((name) => sourceWorkerRegistry?.[name]?.status?.raw).filter(Boolean);
                row[7 + idx * 3] = namesStr;
                row[8 + idx * 3] = joinUnique(compList);
                row[9 + idx * 3] = joinUnique(statusList);
            });
            table.push(row);
        };

        Object.entries(sourceLineTemplates || {}).forEach(([lineName, positions]) => {
            (positions || []).forEach((pos) => {
                fillRow(lineName, pos.role, pos.count, pos.roster || {});
            });
        });

        if (sourceFloaters?.day?.length) {
            fillRow(
                'Резерв День',
                'Подсобник',
                sourceFloaters.day.length,
                { 1: sourceFloaters.day.map((f) => f.name).join(', ') }
            );
        }

        if (sourceFloaters?.night?.length) {
            fillRow(
                'Резерв Ночь',
                'Подсобник',
                sourceFloaters.night.length,
                { 2: sourceFloaters.night.map((f) => f.name).join(', ') }
            );
        }

        return table;
    };

    const handleCreatePlanFromSchedule = () => {
        setPlanCreateError('');
        setPlanCreateStatus('idle');
        try {
            if (!createPlanFromSchedule) {
                throw new Error('Функция сохранения плана недоступна.');
            }
            if (!allRowsAllLines || allRowsAllLines.length === 0) {
                throw new Error('Нет позиций для построения плана.');
            }
            const autoShifts = buildShiftsFromRows(allRowsAllLines);
            const demand = buildDemandFromSchedule(allRowsAllLines, autoShifts);
            const roster = buildRosterFromDistribution();
            const planName = (planSaveName || activePlanName || `План ${new Date().toLocaleDateString('ru-RU')}`).trim();
            createPlanFromSchedule({
                demand,
                roster,
                name: planName,
                planningState: {
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
                displacementRules,
                lineWorkDates
                }
            });
            setPlanCreateStatus('success');
        } catch (err) {
            setPlanCreateError(err?.message || 'Ошибка создания плана');
            setPlanCreateStatus('error');
        }
    };

    const handleCreatePlanFromLineDates = () => {
        setLineWorkError('');
        setPlanCreateError('');
        setPlanCreateStatus('idle');
        try {
            if (!createPlanFromSchedule) {
                throw new Error('Функция сохранения плана недоступна.');
            }
            const parsed = {};
            const errors = [];
            lineOptions.forEach((line) => {
                const { dates, errors: errs } = parseLineDatesInput(lineWorkDraft[line]);
                if (errs.length > 0) {
                    errors.push(`${line}: ${errs.join(', ')}`);
                }
                if (dates.length > 0) {
                    parsed[line] = dates;
                }
            });
            if (errors.length > 0) {
                setLineWorkError(errors.join(' | '));
                return;
            }
            if (Object.keys(parsed).length === 0) {
                setLineWorkError('Укажите даты работы хотя бы для одной линии.');
                return;
            }
            const rows = buildLineWorkRows(parsed);
            const autoShifts = buildShiftsFromRows(rows);
            const demand = buildDemandFromSchedule(rows, autoShifts);
            const roster = buildRosterFromDistribution();
            const planName = (planSaveName || activePlanName || `План ${new Date().toLocaleDateString('ru-RU')}`).trim();
            createPlanFromSchedule({
                demand,
                roster,
                name: planName,
                planningState: {
                    activeTab: 'schedule',
                    cipDurations,
                    baseProducts,
                    speedLines,
                    products: [],
                    cipBetween: [],
                    selectedPlanLine,
                    transitionRules,
                    transitionRulesVersion: TRANSITION_RULES_VERSION,
                    lineEvents,
                    exportLines,
                    exportType,
                    displacementRules,
                    lineWorkDates: parsed
                }
            });
            setLineWorkDates(parsed);
            setPlanCreateStatus('success');
            setIsLineWorkPlanOpen(false);
        } catch (err) {
            setPlanCreateError(err?.message || 'Ошибка создания плана');
            setPlanCreateStatus('error');
        }
    };

    const allRows = useMemo(() => {
        const rows = buildRows(products, cipBetween, selectedPlanLine, missingTransitionByIndex);
        const anchorIndex = rows.findIndex(r => r.manualStart || r.manualEnd);
        return applySchedule(rows, anchorIndex === -1 ? 0 : anchorIndex);
    }, [products, cipBetween, cipDurations, selectedPlanLine, lineEvents, missingTransitionByIndex]);

    const allRowsAllLines = useMemo(() => {
        const combined = [];
        lineOptions.forEach((line) => {
            const missing = buildMissingTransitionMap(line);
            const rows = buildRows(products, cipBetween, line, missing);
            const anchorIndex = rows.findIndex(r => r.manualStart || r.manualEnd);
            const scheduled = applySchedule(rows, anchorIndex === -1 ? 0 : anchorIndex);
            scheduled.forEach((r) => combined.push(r));
        });
        return combined;
    }, [products, cipBetween, cipDurations, lineEvents, buildMissingTransitionMap]);

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

    const linesFromGraph = useMemo(() => {
        const set = new Set();
        products.forEach((p) => { if (p?.line) set.add(p.line); });
        cipBetween.forEach((c) => { if (c?.line) set.add(c.line); });
        const list = Array.from(set);
        const extractNum = (s) => {
            const m = String(s).match(/Линия\s*(\d+)/i);
            return m ? parseInt(m[1], 10) : null;
        };
        const sorted = list.sort((a, b) => {
            const na = extractNum(a);
            const nb = extractNum(b);
            if (na != null && nb != null) return na - nb;
            if (na != null) return -1;
            if (nb != null) return 1;
            return String(a).localeCompare(b, undefined, { numeric: true });
        });
        return sorted.length > 0 ? sorted : lineOptions;
    }, [products, cipBetween, lineOptions]);

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

    const removeProductAt = (index) => {
        if (index < 0 || index >= products.length) return;
        setProducts(prev => [...prev.slice(0, index), ...prev.slice(index + 1)]);
        setCipBetween(prev => {
            if (index >= prev.length) return prev;
            return [...prev.slice(0, index), ...prev.slice(index + 1)];
        });
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

    const tabItems = [
        { id: 'schedule', label: 'График', icon: BarChart2 },
        { id: 'products', label: 'База продуктов', icon: Package },
        { id: 'speeds', label: 'Скорости', icon: Zap },
        { id: 'cips', label: 'CIP', icon: Beaker },
        { id: 'transitions', label: 'Переходы', icon: GitBranch },
        { id: 'displacement', label: 'Вытеснения', icon: Replace }
    ];

    return (
        <div className="h-full flex flex-col bg-slate-100/80 overflow-y-auto">
            <div className="max-w-[1600px] mx-auto w-full space-y-6 p-6">
                <header className="bg-white/95 backdrop-blur-sm border border-slate-200/80 rounded-xl shadow-sm px-6 py-5">
                    <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 shrink-0">
                            <Calendar size={22} strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-semibold text-slate-800 tracking-tight">Планирование очередности розлива</h1>
                            <p className="text-sm text-slate-500 mt-0.5">Настройка графика и справочников для линии</p>
                            {activePlanHasQueue && (
                                <button
                                    type="button"
                                    onClick={() => loadPlanQueue?.(currentPlanId)}
                                    className="text-xs text-indigo-600 font-medium mt-1 hover:text-indigo-800 hover:underline text-left"
                                    title="Загрузить очередь плана для редактирования"
                                >
                                    Загрузить очередь плана →
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-2.5">
                                <span className="text-slate-500 text-sm">План:</span>
                                <select
                                    value={currentPlanId || ''}
                                    onChange={(e) => {
                                        const id = e.target.value || null;
                                        if (id) {
                                            loadPlan?.(id, { switchToDashboard: false });
                                        } else {
                                            setCurrentPlanId?.(null);
                                        }
                                    }}
                                    className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer pr-1 min-w-[140px]"
                                >
                                    <option value="">— не выбран —</option>
                                    {savedPlans?.map((plan) => {
                                        const ps = plan?.data?.planningState;
                                        const prods = ps?.products ?? [];
                                        const cips = ps?.cipBetween ?? [];
                                        const lineForCount = ps?.selectedPlanLine && lineOptions.includes(ps.selectedPlanLine) ? ps.selectedPlanLine : selectedPlanLine;
                                        const countRowsForLine = (p, cb, line) => {
                                            let n = 0;
                                            (p || []).forEach((item, i) => {
                                                if ((item?.line || '') !== line) return;
                                                n++;
                                                const cip = (cb || [])[i];
                                                if (cip && ((cip?.line || item?.line) === line)) n++;
                                            });
                                            return n;
                                        };
                                        let count = countRowsForLine(prods, cips, lineForCount);
                                        if (count <= 0 && prods.length > 0) {
                                            const firstLine = prods.find(p => p?.line)?.line;
                                            if (firstLine) count = countRowsForLine(prods, cips, firstLine);
                                        }
                                        if (count <= 0) {
                                            const demand = plan?.data?.rawTables?.demand;
                                            if (Array.isArray(demand) && demand.length > 1) {
                                                count = demand.slice(1).reduce((s, row) => s + ((row.slice(15) || []).filter(c => c === 1 || c === '1').length), 0);
                                            }
                                        }
                                        const countStr = count > 0 ? ` (${count})` : '';
                                        return (
                                            <option key={plan.id} value={plan.id}>
                                                {plan.name || plan.id}{countStr}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-2.5">
                                <span className="text-slate-500 text-sm">Линия:</span>
                                <select
                                    value={selectedPlanLine}
                                    onChange={(e) => setSelectedPlanLine(e.target.value)}
                                    className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer pr-1"
                                >
                                    {lineOptions.map(option => (
                                        <option key={option} value={option}>
                                            {option} ({eventCountByLine[option] ?? 0})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </header>
                <nav className="flex flex-wrap gap-1.5" aria-label="Вкладки планирования">
                    {tabItems.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => {
                                setActiveTab(id);
                                setVisitedTabs(prev => ({ ...prev, [id]: true }));
                            }}
                            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
                                activeTab === id
                                    ? 'bg-white text-indigo-600 shadow-md shadow-slate-200/50 ring-1 ring-slate-200/50'
                                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-800'
                            }`}
                        >
                            <Icon size={18} strokeWidth={2} className={activeTab === id ? 'text-indigo-500' : 'text-slate-400'} />
                            {label}
                        </button>
                    ))}
                </nav>

                {visitedTabs.products && (
                    <div style={{ display: activeTab === 'products' ? 'block' : 'none' }}>
                    <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
                        <div className="flex items-center justify-between border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                                    <Package size={18} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-medium text-slate-700">База продуктов</h2>
                                    <p className="text-xs text-slate-400">Справочник наименований и объёмов</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setProductImportError(''); setPasteText(''); setIsProductImportOpen(true); }}
                                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                                >
                                    <Plus size={16} />
                                    Импорт в справочник
                                </button>
                                <button disabled className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
                                    Добавить
                                </button>
                            </div>
                        </div>
                        <div className="p-5">
                            {productImportError && (
                                <div className="mb-4 rounded-xl bg-red-50/80 px-4 py-3 text-sm text-red-700">{productImportError}</div>
                            )}
                            {baseProducts.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200/60 bg-slate-50/40 py-12 text-center text-sm text-slate-500">
                                    Нет продуктов. Импортируйте данные вставкой или добавьте вручную.
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-200/40">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/70 border-b border-slate-200/50">
                                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 first:border-l-0">Тип</th>
                                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Вкус</th>
                                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Объём</th>
                                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Бренд</th>
                                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Кол-во</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {baseProducts.map((item) => (
                                                <tr key={item.id} className="border-b border-slate-100/80 bg-white hover:bg-slate-50/40 transition-colors">
                                                    <td className="px-3 py-2.5 text-center text-slate-600 border-l border-slate-200/40 first:border-l-0">{item.type || '—'}</td>
                                                    <td className="px-3 py-2.5 text-center border-l border-slate-200/40 text-slate-600">{item.flavor || '—'}</td>
                                                    <td className="px-3 py-2.5 text-center border-l border-slate-200/40 tabular-nums text-slate-500">{item.volume || '—'}</td>
                                                    <td className="px-3 py-2.5 text-center border-l border-slate-200/40 text-slate-500">{item.brand || '—'}</td>
                                                    <td className="px-3 py-2.5 text-center border-l border-slate-200/40 tabular-nums font-medium text-slate-600">{item.qty || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </section>
                    </div>
                )}

                {visitedTabs.speeds && (
                    <div style={{ display: activeTab === 'speeds' ? 'block' : 'none' }}>
                    <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
                        <div className="flex items-center justify-between border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                                    <Zap size={18} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-medium text-slate-700">Справочник скоростей</h2>
                                    <p className="text-xs text-slate-400">Объёмы и скорости по линиям</p>
                                </div>
                            </div>
                            <button
                                onClick={addSpeedLine}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                            >
                                <Plus size={16} />
                                Добавить линию
                            </button>
                        </div>
                        <div className="p-5">
                            {speedLines.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200/60 bg-slate-50/40 py-12 text-center text-sm text-slate-500">
                                    Нет линий. Добавьте линию и укажите объёмы и скорости.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {speedLines.map((line) => (
                                        <div key={line.id} className="rounded-xl border border-slate-200/40 bg-slate-50/30 overflow-hidden">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between border-b border-slate-200/50 px-4 py-3 bg-white/60">
                                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                                    <span className="text-xs font-medium text-slate-500">Линия</span>
                                                    <input
                                                        type="text"
                                                        value={line.name}
                                                        onChange={(e) => updateSpeedLineName(line.id, e.target.value)}
                                                        className="h-9 flex-1 min-w-0 max-w-xs rounded-md border border-slate-200/80 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                        placeholder="Напр. Линия 1"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => addSpeedEntry(line.id)}
                                                    className="inline-flex items-center gap-2 rounded-md border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50/80 transition-colors"
                                                >
                                                    <Plus size={14} />
                                                    Добавить объём
                                                </button>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                {line.entries.map((entry) => (
                                                    <div key={entry.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                                        <div className="md:col-span-3">
                                                            <label className="mb-1 block text-xs font-medium text-slate-500">Формат / Объём</label>
                                                            <input
                                                                type="text"
                                                                value={entry.format}
                                                                onChange={(e) => updateSpeedEntry(line.id, entry.id, 'format', e.target.value)}
                                                                className="h-9 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                                placeholder="Напр. 0,75 л / 1,0 л"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-xs font-medium text-slate-500">Скорость (ед/час)</label>
                                                            <input
                                                                type="number"
                                                                value={entry.speed}
                                                                onChange={(e) => updateSpeedEntry(line.id, entry.id, 'speed', e.target.value)}
                                                                className="h-9 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                                placeholder="6500"
                                                                min="0"
                                                            />
                                                        </div>
                                                        <div className="flex items-end">
                                                            <button
                                                                onClick={() => removeSpeedEntry(line.id, entry.id)}
                                                                className="h-9 px-3 rounded-md text-sm font-medium text-red-600 bg-red-50/80 hover:bg-red-100/80 transition-colors"
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
                    </section>
                    </div>
                )}

                {visitedTabs.cips && (
                    <div style={{ display: activeTab === 'cips' ? 'block' : 'none' }}>
                    <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
                        <div className="flex items-center justify-between border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                                    <Beaker size={18} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-medium text-slate-700">События по линиям (мин)</h2>
                                    <p className="text-xs text-slate-400">Длительности CIP и прочих событий. Разверните событие для редактирования по линиям.</p>
                                </div>
                            </div>
                            <button
                                onClick={addLineEvent}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                            >
                                <Plus size={16} />
                                Добавить событие
                            </button>
                        </div>
                        <div className="p-5 space-y-2">
                            {lineEvents.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200/60 bg-slate-50/40 py-12 text-center text-sm text-slate-500">
                                    Нет событий. Добавьте событие и укажите длительности по линиям.
                                </div>
                            ) : (
                                lineEvents.map((row, idx) => {
                                    const isExpanded = expandedCipIndex === idx;
                                    return (
                                        <div
                                            key={`${row.category}_${idx}`}
                                            className="rounded-xl border border-slate-200/40 bg-white overflow-hidden"
                                        >
                                            <div
                                                className="flex items-center gap-2 px-4 py-3 bg-slate-50/40 border-b border-slate-200/40 cursor-pointer hover:bg-slate-50/60 transition-colors"
                                                onClick={() => setExpandedCipIndex(isExpanded ? null : idx)}
                                            >
                                                <button
                                                    type="button"
                                                    className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
                                                    aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
                                                >
                                                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                </button>
                                                <span className="w-7 text-sm text-slate-400 tabular-nums">{idx + 1}</span>
                                                <input
                                                    type="text"
                                                    value={row.category}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        setLineEvents((prev) => prev.map((item, i) => i === idx ? { ...item, category: e.target.value } : item));
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    placeholder="Категория"
                                                    className="flex-1 min-w-0 h-8 rounded-md border border-slate-200/80 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); removeLineEvent(idx); setExpandedCipIndex(prev => prev === idx ? null : prev > idx ? prev - 1 : prev); }}
                                                    className="ml-auto rounded-md px-2.5 py-1.5 text-sm font-medium text-red-600 bg-red-50/80 hover:bg-red-100/80 transition-colors shrink-0"
                                                >
                                                    Удалить
                                                </button>
                                            </div>
                                            {isExpanded && (
                                                <div className="p-4 bg-white border-t border-slate-100/80">
                                                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Длительности по линиям (мин)</div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
                                                        {lineOptions.map((line) => (
                                                            <div key={line} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100/80 last:border-0">
                                                                <label className="text-sm text-slate-600 shrink-0 min-w-0 truncate" title={line}>{line}</label>
                                                                <input
                                                                    type="number"
                                                                    value={row.durations[line] ?? ''}
                                                                    onChange={(e) => {
                                                                        const value = e.target.value;
                                                                        setLineEvents((prev) => prev.map((item, i) => i !== idx ? item : {
                                                                            ...item,
                                                                            durations: { ...item.durations, [line]: value === '' ? '' : Number(value) }
                                                                        }));
                                                                    }}
                                                                    className="w-20 h-8 rounded-md border border-slate-200/80 bg-white px-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 shrink-0"
                                                                    min="0"
                                                                    placeholder="0"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>
                    </div>
                )}

                {visitedTabs.displacement && (
                    <div style={{ display: activeTab === 'displacement' ? 'block' : 'none' }}>
                    <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
                        <div className="flex items-center justify-between border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                                    <Replace size={18} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-medium text-slate-700">Вытеснения</h2>
                                    <p className="text-xs text-slate-400">Из → В, исключение. Поиск по вхождению во вкус (например: морковь, морковь, дыня).</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={addDisplacementRule}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                            >
                                <Plus size={16} />
                                Добавить правило
                            </button>
                        </div>
                        <div className="p-5">
                            {displacementRules.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200/60 bg-slate-50/40 py-12 text-center text-sm text-slate-500">
                                    Нет правил. Добавьте правило: Из (вкус «откуда»), В (вкус «куда»), Исключение (если во вкусе «куда» есть это — правило не сработает).
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-200/40">
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="bg-slate-50/70 border-b border-slate-200/50">
                                            <tr>
                                                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Из</th>
                                                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">В</th>
                                                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Исключение</th>
                                                <th className="px-3 py-2.5 w-12 border-l border-slate-200/40" />
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white">
                                            {displacementRules.map((r) => (
                                                <tr key={r.id} className="border-b border-slate-100/80 hover:bg-slate-50/40">
                                                    <td className="px-3 py-2.5 border-slate-200/40">
                                                        <input
                                                            type="text"
                                                            value={r.from}
                                                            onChange={(e) => updateDisplacementRule(r.id, 'from', e.target.value)}
                                                            placeholder="вкус «откуда»"
                                                            className="w-full min-w-0 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2.5 border-l border-slate-200/40">
                                                        <input
                                                            type="text"
                                                            value={r.to}
                                                            onChange={(e) => updateDisplacementRule(r.id, 'to', e.target.value)}
                                                            placeholder="вкус «куда»"
                                                            className="w-full min-w-0 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2.5 border-l border-slate-200/40">
                                                        <input
                                                            type="text"
                                                            value={r.exception}
                                                            onChange={(e) => updateDisplacementRule(r.id, 'exception', e.target.value)}
                                                            placeholder="исключение (подстрока во вкусе «куда»)"
                                                            className="w-full min-w-0 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2.5 text-center border-l border-slate-200/40">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeDisplacementRule(r.id)}
                                                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                            title="Удалить"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </section>
                    </div>
                )}

                {visitedTabs.transitions && (
                    <div style={{ display: activeTab === 'transitions' ? 'block' : 'none' }}>
                    <div className="flex flex-col min-h-[calc(100vh-240px)]">
                        <div className="-mx-6 rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40 overflow-hidden">
                            <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/50 bg-slate-50/40">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                                        <GitBranch size={18} strokeWidth={2} />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-medium text-slate-700">База переходов</h2>
                                        <p className="text-xs text-slate-400">CIP-матрица и исключения</p>
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
                                        className="h-8 w-56 rounded-md border border-slate-200/80 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                        placeholder="Поиск по правилам..."
                                    />
                                    <button
                                        onClick={handleSaveTransitionBase}
                                        className="px-3 py-2 text-xs font-medium bg-white border border-slate-200/80 text-slate-600 rounded-md hover:bg-slate-50/80 transition-colors"
                                    >
                                        Сохранить базу
                                    </button>
                                    <button
                                        onClick={addTransitionRule}
                                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                                    >
                                        <Plus size={14} />
                                        Добавить правило
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 pt-4 grid grid-cols-1 gap-6">
                            <div className="rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40 overflow-hidden flex flex-col min-h-0">
                                <div className="px-4 py-3 border-b border-slate-200/50 bg-slate-50/40 flex items-center justify-between gap-3 flex-wrap">
                                    <div className="text-sm font-medium text-slate-700">Матрица переходов</div>
                                    {filteredTransitionRules.length > 0 && (
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span className="tabular-nums">
                                                {(transitionPage - 1) * TRANSITION_PAGE_SIZE + 1}–{Math.min(transitionPage * TRANSITION_PAGE_SIZE, filteredTransitionRules.length)} из {filteredTransitionRules.length}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={transitionPage <= 1}
                                                onClick={() => setTransitionPage(p => Math.max(1, p - 1))}
                                                className="h-7 px-2 rounded border border-slate-200/80 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Назад
                                            </button>
                                            <span className="tabular-nums">Стр. {transitionPage} из {transitionTotalPages}</span>
                                            <button
                                                type="button"
                                                disabled={transitionPage >= transitionTotalPages}
                                                onClick={() => setTransitionPage(p => Math.min(transitionTotalPages, p + 1))}
                                                className="h-7 px-2 rounded border border-slate-200/80 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Вперёд
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-h-0 overflow-auto">
                                    {filteredTransitionRules.length === 0 ? (
                                        <div className="p-6 text-sm text-slate-500">
                                            {transitionRules.length === 0
                                                ? 'Пока нет переходов. Добавьте первое правило.'
                                                : 'Ничего не найдено по фильтру.'}
                                        </div>
                                    ) : (
                                        <table className="w-full text-xs border-collapse table-fixed">
                                            <colgroup>
                                                <col className="w-[25%]" />
                                                <col className="w-[23%]" />
                                                <col className="w-[23%]" />
                                                <col className="w-[23%]" />
                                                <col className="w-[6%]" />
                                            </colgroup>
                                            <thead className="sticky top-0 z-10 bg-slate-50/70 border-b border-slate-200/50">
                                                <tr>
                                                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 first:border-l-0">Тип + вкус</th>
                                                    <th className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">CIP 1</th>
                                                    <th className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">CIP 2</th>
                                                    <th className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">CIP 3</th>
                                                    <th className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 w-[6%]"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedTransitionRules.map((rule) => (
                                                    <tr key={rule.id} className="border-b border-slate-100/80 bg-white group">
                                                        <td className="px-3 py-2.5 align-middle border-l border-slate-200/40 first:border-l-0">
                                                            <div className="relative">
                                                                {activeProductSearchCell === rule.id ? (
                                                                    <div className="relative">
                                                                        <input
                                                                            type="text"
                                                                            value={productSearchQuery}
                                                                            onChange={(e) => setProductSearchQuery(e.target.value)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Escape') setActiveProductSearchCell(null);
                                                                            }}
                                                                            className="h-8 w-full rounded-lg border border-indigo-400 bg-white px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                                                            placeholder="Поиск продукта..."
                                                                            autoFocus
                                                                        />
                                                                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
                                                                            <div className="p-1">
                                                                                {baseProducts
                                                                                    .filter(p => {
                                                                                        const label = getTransitionKeyForProduct(p) || p.name;
                                                                                        return label.toLowerCase().includes(productSearchQuery.toLowerCase());
                                                                                    })
                                                                                    .slice(0, 50)
                                                                                    .map(p => {
                                                                                        const label = getTransitionKeyForProduct(p) || p.name;
                                                                                        return (
                                                                                            <button
                                                                                                key={p.id}
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    updateTransitionRule(rule.id, 'productName', label);
                                                                                                    setActiveProductSearchCell(null);
                                                                                                }}
                                                                                                className="w-full rounded-lg px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                                                                            >
                                                                                                {label}
                                                                                            </button>
                                                                                        );
                                                                                    })}
                                                                                {baseProducts.filter(p => (getTransitionKeyForProduct(p) || p.name).toLowerCase().includes(productSearchQuery.toLowerCase())).length === 0 && (
                                                                                    <div className="px-3 py-2 text-[11px] text-slate-400 italic text-center">Ничего не найдено</div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setActiveProductSearchCell(rule.id);
                                                                            setProductSearchQuery('');
                                                                        }}
                                                                        className="group flex h-8 w-full items-center justify-between rounded-lg border border-slate-200/80 bg-white px-2 text-left text-[11px] transition-all hover:border-slate-300 hover:bg-slate-50/50"
                                                                    >
                                                                        <span className={`truncate ${rule.productName ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                                                                            {rule.productName || 'Выберите продукт...'}
                                                                        </span>
                                                                        <ChevronDown size={14} className="ml-1 shrink-0 text-slate-300 transition-colors group-hover:text-slate-400" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        {(['cip1', 'cip2', 'cip3']).map((cipKey) => {
                                                            const isCellActive = (
                                                                activeTransitionCell?.id === rule.id
                                                                && activeTransitionCell?.key === cipKey
                                                            );
                                                            const exceptions = String(rule[cipKey] || '')
                                                                .split(',')
                                                                .map(item => item.trim())
                                                                .filter(Boolean);
                                                            return (
                                                                <td key={cipKey} className="px-3 py-2.5 align-top border-l border-slate-200/40 h-[100px]">
                                                                    <div className="h-full flex flex-col gap-2 overflow-hidden">
                                                                        <div className="flex items-center justify-between shrink-0">
                                                                            <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 cursor-pointer">
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`base-${rule.id}`}
                                                                                    checked={rule.baseCip === cipKey}
                                                                                    onChange={() => updateTransitionRule(rule.id, 'baseCip', cipKey)}
                                                                                    className="h-3 w-3 text-indigo-600 focus:ring-indigo-500/30"
                                                                                />
                                                                                Базовый
                                                                            </label>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setActiveTransitionCell(prev => prev?.id === rule.id && prev?.key === cipKey ? null : { id: rule.id, key: cipKey });
                                                                                    updateTransitionSearch(rule.id, cipKey, transitionSearch[rule.id]?.[cipKey] || '');
                                                                                }}
                                                                                className={`h-5 w-5 rounded-full border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 flex items-center justify-center transition-colors ${isCellActive ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : ''}`}
                                                                                title="Добавить исключение"
                                                                            >
                                                                                <Plus size={12} strokeWidth={2.5} />
                                                                            </button>
                                                                        </div>
                                                                        
                                                                        <div className="flex-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
                                                                            {exceptions.length === 0 && !isCellActive ? (
                                                                                <span className="text-[10px] text-slate-300 italic">Нет исключений</span>
                                                                            ) : (
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {exceptions.map((name) => (
                                                                                        <span
                                                                                            key={`${rule.id}_${cipKey}_${name}`}
                                                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] border border-slate-200/50 max-w-full"
                                                                                            title={name}
                                                                                        >
                                                                                            <span className="truncate">{name}</span>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    const next = exceptions.filter(item => item !== name);
                                                                                                    updateTransitionRule(rule.id, cipKey, next.join(', '));
                                                                                                }}
                                                                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                                                                            >
                                                                                                <Plus size={10} className="rotate-45" />
                                                                                            </button>
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {isCellActive && (
                                                                            <div className="shrink-0 mt-auto pt-2 bg-white">
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="text"
                                                                                        value={transitionSearch[rule.id]?.[cipKey] || ''}
                                                                                        onChange={(e) => updateTransitionSearch(rule.id, cipKey, e.target.value)}
                                                                                        className="h-7 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                                                                        placeholder="Поиск..."
                                                                                        autoFocus
                                                                                    />
                                                                                    {transitionSearch[rule.id]?.[cipKey] && (
                                                                                        <div className="absolute bottom-full left-0 right-0 mb-1 z-20 max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
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
                                                                                                        className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-slate-50 text-slate-700"
                                                                                                    >
                                                                                                        {getTransitionKeyForProduct(product) || product.name}
                                                                                                    </button>
                                                                                                ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="px-2 py-2.5 text-center align-middle border-l border-slate-200/40">
                                                            <button
                                                                type="button"
                                                                onClick={() => removeTransitionRule(rule.id)}
                                                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                                                                title="Удалить правило"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                    </div>
                )}

                {visitedTabs.schedule && (
                    <div style={{ display: activeTab === 'schedule' ? 'block' : 'none' }}>
                    <>
                        <section className="rounded-2xl bg-white/90 p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
                            <div className="flex flex-wrap items-center justify-end gap-4">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={addMissingProductsAsRules}
                                        disabled={productsWithoutRules.length === 0}
                                        title={productsWithoutRules.length === 0 ? 'Все продукты из графика уже в матрице переходов' : `Добавить ${productsWithoutRules.length} продукт(ов) из графика без правил в матрицу с базовым CIP2`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Plus size={16} />
                                        Добавить без правил ({productsWithoutRules.length})
                                    </button>
                                    <button
                                        onClick={applyTransitionsForCurrentOrder}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-500/20 transition-colors"
                                    >
                                        Расставить переходы
                                    </button>
                                    <button
                                        onClick={() => { runTransitionOptimization(); setIsTransitionModalOpen(true); }}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-500/20 transition-colors"
                                    >
                                        Найти кратчайший путь
                                    </button>
                                </div>
                                <div className="h-6 w-px bg-slate-200" aria-hidden="true" />
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={planSaveName}
                                        onChange={(e) => setPlanSaveName(e.target.value)}
                                        placeholder={activePlanName || `План ${new Date().toLocaleDateString('ru-RU')}`}
                                        className="h-9 w-48 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                        title="Имя сохраняемого плана"
                                    />
                                    <button
                                        onClick={handleCreatePlanFromSchedule}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                                    >
                                        Сформировать план
                                    </button>
                                    <button
                                        onClick={() => {
                                            setLineWorkError('');
                                            const draft = {};
                                            lineOptions.forEach((line) => {
                                                const dates = lineWorkDates?.[line];
                                                draft[line] = Array.isArray(dates) ? dates.join(', ') : (dates || '');
                                            });
                                            setLineWorkDraft(draft);
                                            setIsLineWorkPlanOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                        План по датам линий
                                    </button>
                                    <button
                                        onClick={() => { setPlanImportError(''); setPasteText(''); setPlanImportPreview(null); setIsPlanImportOpen(true); }}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                        Импорт в план
                                    </button>
                                    <button
                                        onClick={() => setIsExportModalOpen(true)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        Выгрузить
                                    </button>
                                </div>
                            </div>
                        </section>
                        {(planCreateError || planCreateStatus === 'success') && (
                            <div className={`rounded-xl px-4 py-3 text-sm ${planCreateError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {planCreateError || 'План сформирован и сохранён.'}
                            </div>
                        )}

                        <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
                            <div className="flex items-center gap-3 border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                                    <Clock4 size={18} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-medium text-slate-700">Очередность розлива</h2>
                                    <p className="text-xs text-slate-400 tabular-nums">{allRows.length} позиций</p>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse table-auto">
                                    <thead>
                                        <tr className="bg-slate-50/70 border-b border-slate-200/50">
                                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-0">№</th>
                                            <th className="px-1 py-3 w-0 border-l border-slate-200/40"></th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Дата нач.</th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Дата кон.</th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Начало</th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Конец</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 min-w-[180px]">Наименование</th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Кол-во</th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Скорость</th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 whitespace-nowrap w-0">Длит.</th>
                                            <th className="px-2 py-3 w-0 border-l border-slate-200/40" title="Удалить"> </th>
                                        </tr>
                                    </thead>
                                    <tbody>
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
                                                    className={`border-b border-slate-100/80 transition-colors ${
                                                        isMissingTransition ? 'bg-red-50/50' : isCip ? 'bg-slate-50/30' : 'bg-white hover:bg-slate-50/40'
                                                    } ${!isCip ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                                >
                                                    <td className="px-3 py-2.5 text-center text-slate-400 tabular-nums">{displayIndex + 1}</td>
                                                    <td className="px-1 py-2.5 text-center text-slate-300/80 border-l border-slate-200/40">
                                                        {!isCip && <GripVertical size={16} className="opacity-50 inline-block" />}
                                                    </td>
                                                    <td className="px-3 py-2.5 border-l border-slate-200/40 w-0">
                                                        <input
                                                            type="date"
                                                            value={formatDateInputValue(row.date)}
                                                            onChange={(e) => handleDateChange(row, e.target.value)}
                                                            className={`h-8 w-full min-w-0 rounded-md border px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 [&::-webkit-date-and-time-value]:text-center ${
                                                                row.manualDate ? 'bg-amber-50/80 border-amber-200/80 text-amber-800' : 'border-slate-200/80 bg-white'
                                                            }`}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2.5 border-l border-slate-200/40 text-center text-slate-500 text-sm tabular-nums whitespace-nowrap w-0">
                                                        {row.endDate || '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 border-l border-slate-200/40 w-0">
                                                        <input
                                                            type="time"
                                                            value={row.start || ''}
                                                            onChange={(e) => handleTimeChange(row, 'start', e.target.value)}
                                                            className={`h-8 w-full min-w-0 rounded-md border px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 [&::-webkit-datetime-edit]:text-center ${
                                                                row.manualStart ? 'bg-amber-50/80 border-amber-200/80 text-amber-800' : 'border-slate-200/80 bg-white'
                                                            }`}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2.5 border-l border-slate-200/40 w-0">
                                                        <input
                                                            type="time"
                                                            value={row.end || ''}
                                                            onChange={(e) => handleTimeChange(row, 'end', e.target.value)}
                                                            className={`h-8 w-full min-w-0 rounded-md border px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 [&::-webkit-datetime-edit]:text-center ${
                                                                row.manualEnd ? 'bg-amber-50/80 border-amber-200/80 text-amber-800' : 'border-slate-200/80 bg-white'
                                                            }`}
                                                        />
                                                    </td>
                                                    <td className={`px-4 py-2.5 border-l border-slate-200/40 font-medium text-center ${isCip ? 'text-slate-500' : 'text-slate-700'}`}>
                                                {isCip ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <select
                                                            value={row.eventKey || eventOptions[0]?.key || ''}
                                                            onChange={(e) => handleCipTypeChange(row.index, e.target.value)}
                                                            className={`h-8 rounded-md border px-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-300/50 ${
                                                                isMissingTransition
                                                                    ? 'border-red-200/80 bg-red-50/50 text-red-700 focus:ring-red-300/50'
                                                                    : 'border-slate-200/80 bg-slate-50/50 text-slate-600 focus:ring-slate-300/50'
                                                            }`}
                                                        >
                                                            {eventOptions.map(option => (
                                                                <option key={option.key} value={option.key}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                        {isMissingTransition ? (
                                                            <span className="rounded bg-red-100/80 px-2 py-0.5 text-xs font-medium text-red-600">Нет правил</span>
                                                        ) : (
                                                            <span className="rounded bg-slate-100/80 px-2 py-0.5 text-xs font-medium text-slate-500">Событие</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    row.name
                                                )}
                                                    </td>
                                                    <td className={`px-3 py-2.5 text-center border-l border-slate-200/40 tabular-nums whitespace-nowrap w-0 ${isCip ? 'text-slate-400' : 'font-medium text-slate-600'}`}>
                                                        {isCip ? '—' : row.qty}
                                                    </td>
                                                    <td className={`px-3 py-2.5 text-center border-l border-slate-200/40 tabular-nums whitespace-nowrap w-0 ${isCip ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {isCip ? '—' : `${row.speed}/ч`}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center border-l border-slate-200/40 text-slate-500 tabular-nums whitespace-nowrap w-0">{durationLabel}</td>
                                                    <td className="px-2 py-2.5 text-center border-l border-slate-200/40 w-0">
                                                        {!isCip && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeProductAt(row.index)}
                                                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                                                                title="Удалить из очереди"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                    </div>
                )}
            </div>
            {(activeProductSearchCell || activeTransitionCell) && (
                <div 
                    className="fixed inset-0 z-40 bg-transparent" 
                    onClick={() => {
                        setActiveProductSearchCell(null);
                        setActiveTransitionCell(null);
                    }}
                />
            )}
            {isProductImportOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4">
                            <h3 className="text-base font-semibold text-slate-800">Импорт в справочник продуктов</h3>
                            <button
                                onClick={() => setIsProductImportOpen(false)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-600">Вставьте данные из буфера (Ctrl+V). Кол-во будет проигнорировано.</p>
                            <textarea
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                rows={8}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                placeholder="Вставьте данные сюда..."
                            />
                            {productImportError && (
                                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{productImportError}</div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 bg-slate-50/30">
                            <button
                                onClick={() => setIsProductImportOpen(false)}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={() => handlePasteImport('reference')}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                            >
                                Импортировать
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isExportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4">
                            <div>
                                <h3 className="text-base font-semibold text-slate-800">Выгрузка отчёта</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Формируйте отчёты по выбранным линиям</p>
                            </div>
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="text-sm text-slate-600">Выберите линии для экспорта</div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {lineOptions.map(line => (
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
                        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 bg-slate-50/30">
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleExportReport}
                                disabled={exportSections.length === 0}
                                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                                    exportSections.length === 0
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700'
                                }`}
                            >
                                {exportType === 'pdf' ? 'Скачать PDF' : 'Открыть HTML'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isPlanImportOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 shrink-0">
                            <h3 className="text-base font-semibold text-slate-800">Импорт в план</h3>
                            <button
                                onClick={() => { setIsPlanImportOpen(false); setPlanImportPreview(null); }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto min-h-0">
                            <p className="text-sm text-slate-600">Вставьте данные из буфера (Ctrl+V). Нажмите «Разобрать», проверьте результат, затем «Импортировать».</p>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-slate-500">Линия</label>
                                <select
                                    value={selectedPlanLine}
                                    onChange={(e) => setSelectedPlanLine(e.target.value)}
                                    className="h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                >
                                    {lineOptions.map(option => (
                                        <option key={option} value={option}>
                                            {option} ({eventCountByLine[option] ?? 0})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <textarea
                                value={pasteText}
                                onChange={(e) => { setPasteText(e.target.value); setPlanImportPreview(null); }}
                                rows={6}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                placeholder="Вставьте данные сюда..."
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setPlanImportError('');
                                    if (!pasteText.trim()) {
                                        setPlanImportError('Вставьте данные для разбора.');
                                        return;
                                    }
                                    const { ok, okNoQty, partial } = parseProductPastePreview(pasteText, true);
                                    setPlanImportPreview({ ok, okNoQty, partial });
                                    if (ok.length === 0 && okNoQty.length === 0 && partial.length === 0) {
                                        setPlanImportError('Нет строк для разбора.');
                                    } else if (ok.length === 0 && okNoQty.length === 0) {
                                        setPlanImportError('Ни одна строка не распознана полностью. Проверьте формат.');
                                    }
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                Разобрать
                            </button>
                            {planImportError && (
                                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{planImportError}</div>
                            )}
                            {planImportPreview && (
                                <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/30 p-4">
                                    {planImportPreview.ok.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
                                                Распознано полностью — будет импортировано ({planImportPreview.ok.length})
                                            </h4>
                                            <ul className="max-h-40 overflow-y-auto space-y-1 text-sm text-slate-700 rounded-lg bg-white/80 p-2 border border-slate-200/60">
                                                {planImportPreview.ok.map((item, i) => (
                                                    <li key={item.id} className="flex items-baseline gap-2">
                                                        <span className="text-slate-400 shrink-0">{i + 1}.</span>
                                                        <span>{item.name}</span>
                                                        {item.qty && <span className="text-slate-500 text-xs">({item.qty} шт)</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {planImportPreview.okNoQty?.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                                                Распознано, но не указано количество ({planImportPreview.okNoQty.length}) — будет импортировано без кол-ва
                                            </h4>
                                            <ul className="max-h-32 overflow-y-auto space-y-1 text-sm text-slate-600 rounded-lg bg-amber-50/50 p-2 border border-amber-200/60">
                                                {planImportPreview.okNoQty.map((item, i) => (
                                                    <li key={item.id} className="flex items-baseline gap-2">
                                                        <span className="text-amber-600 shrink-0">{i + 1}.</span>
                                                        <span>{item.name}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {planImportPreview.partial.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                                                Найдено, но не распознано полностью ({planImportPreview.partial.length})
                                            </h4>
                                            <ul className="max-h-32 overflow-y-auto space-y-1 text-sm text-slate-600 rounded-lg bg-amber-50/50 p-2 border border-amber-200/60">
                                                {planImportPreview.partial.map(({ rawLine, lineIndex }, i) => (
                                                    <li key={i} className="flex items-baseline gap-2">
                                                        <span className="text-amber-600 shrink-0">{lineIndex}.</span>
                                                        <span className="break-all">{rawLine || '(пустая строка)'}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 bg-slate-50/30 shrink-0">
                            <button
                                onClick={() => { setIsPlanImportOpen(false); setPlanImportPreview(null); }}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={() => {
                                    const all = [...(planImportPreview?.ok ?? []), ...(planImportPreview?.okNoQty ?? [])];
                                    if (all.length > 0) handlePasteImport('plan', { previewItems: all });
                                }}
                                disabled={!planImportPreview || (planImportPreview.ok.length + (planImportPreview.okNoQty?.length ?? 0)) === 0}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                            >
                                Импортировать
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isLineWorkPlanOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 shrink-0">
                            <h3 className="text-base font-semibold text-slate-800">План по датам линий</h3>
                            <button
                                onClick={() => setIsLineWorkPlanOpen(false)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto min-h-0">
                            <div className="space-y-1">
                                <p className="text-sm text-slate-600">
                                    Укажите даты работы линий. Формат: <span className="font-medium">дд.мм.гггг</span>.
                                    Диапазоны — через дефис, несколько дат — через запятую.
                                </p>
                                <p className="text-xs text-slate-500">
                                    Пример: 01.02.2026-03.02.2026, 05.02.2026
                                </p>
                            </div>
                            {lineWorkError && (
                                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{lineWorkError}</div>
                            )}
                            <div className="space-y-3">
                                {lineOptions.map((line) => (
                                    <div key={line} className="grid grid-cols-[180px_1fr] gap-3 items-start">
                                        <div className="text-xs font-medium text-slate-600 pt-2">{line}</div>
                                        <input
                                            type="text"
                                            value={lineWorkDraft[line] || ''}
                                            onChange={(e) => setLineWorkDraft((prev) => ({ ...prev, [line]: e.target.value }))}
                                            className="h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                            placeholder="01.02.2026-03.02.2026, 05.02.2026"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 bg-slate-50/30 shrink-0">
                            <button
                                onClick={() => setIsLineWorkPlanOpen(false)}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleCreatePlanFromLineDates}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                            >
                                Сформировать план
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isTransitionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
                    <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80 my-auto">
                        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 shrink-0">
                            <h3 className="text-base font-semibold text-slate-800">Предложенная последовательность</h3>
                            <button
                                onClick={() => setIsTransitionModalOpen(false)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="p-6 space-y-4 text-sm text-slate-700 overflow-y-auto min-h-0">
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
                                transitionResult?.feasible === false ? (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                        Не найден допустимый порядок: не для всех переходов заданы правила в матрице. Заполните правила в таблице «Переходы» и повторите оптимизацию.
                                    </div>
                                ) : transitionResult?.order?.length > 0 ? (
                                    <div className="space-y-4">
                                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                            <div className="text-xs text-slate-500">Время</div>
                                            <div className="mt-1 text-sm">
                                                Было: {(transitionResult?.baselineCost != null ? transitionResult.baselineCost : transitionAnalytics.was.total)} мин
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
                                                Стало: {(transitionResult?.totalCost != null ? transitionResult.totalCost : transitionAnalytics.now.total)} мин
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
                                                {((transitionResult?.transitionRows?.length) ? transitionResult.transitionRows : transitionAnalytics.now.rows).map((row, idx) => {
                                                    const cipLabel = row.cipKey === 'perenaladka' ? 'Переналадка' : row.cipKey === 'smenaAssortimenta' ? 'Смена ассортимента' : row.cipKey === 'vytesnenie' ? 'Вытеснение' : row.cipKey ? row.cipKey.toUpperCase() : 'НЕТ ПРАВИЛ';
                                                    return (
                                                        <li key={`${row.from}_${row.to}_${idx}`} className="text-sm">
                                                            {idx + 1}. {row.from} → {row.to} — {cipLabel} (
                                                            {row.duration === null || row.duration === undefined ? '—' : `${row.duration} мин`}
                                                            )
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                            {!transitionResult?.transitionRows && transitionAnalytics.now.missingDurations > 0 && (
                                                <div className="mt-2 text-xs text-slate-500">
                                                    Для точного времени заполните нормы CIP в таблице «CIP».
                                                </div>
                                            )}
                                            {!transitionResult?.transitionRows && transitionAnalytics.now.missingRules > 0 && (
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
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                            {transitionStatus === 'done' && (transitionResult?.order?.length > 0 || transitionResult?.orderIndices?.length > 0) && transitionResult?.feasible !== false && (
                                <button
                                    onClick={() => applyOptimizedOrder(transitionResult.orderIndices ?? transitionResult.order)}
                                    className="px-4 py-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                                >
                                    Применить
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

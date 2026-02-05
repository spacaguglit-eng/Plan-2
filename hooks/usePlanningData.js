import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS, debounce, isLineMatch, expandCompositeLineKey, formatDateLocal } from '../utils';
import { TRANSITION_RULES_BASE } from '../components/views/transitionRulesBase';
import { openReportPreview, exportReportAsPdf } from '../export/reportExport';
import { useData } from '../context/DataContext';
import { TRANSITION_RULES_VERSION, TRANSITION_PAGE_SIZE, CIP_FALLBACK_DURATION_MIN } from '../components/views/planning/planningViewConstants';
import {
    extractTypeFlavor,
    buildTransitionKey,
    canonicalTransitionKey,
    extractProductParts,
    normalizeVolumeForCompare,
    splitTransitionList,
    parseNumeric,
    parseTimeToMinutes,
    formatMinutesToTime,
    formatDateInputValue,
    parseDateInputValue,
    normalizeVolume,
    parseDateToDayIndex,
    formatDayIndexToDate,
    parseLineDatesInput,
    buildShiftsFromRows,
    buildLineWorkRows,
    parseProductPaste,
    parseProductPastePreview,
    buildAbsMinutes,
    isRowActiveForShift
} from '../components/views/planning/planningViewUtils';

export function usePlanningData() {
    const {
        createPlanFromSchedule,
        loadPlan,
        loadPlanQueue,
        setCurrentPlanId,
        setPlanningStateToLoad,
        savedPlans,
        currentPlanId,
        planningStateVersion,
        planningStateToLoad,
        lineTemplates,
        floaters,
        workerRegistry,
        persistStateKey,
        updatePlanPlanningState,
        planningState: contextPlanningState,
        planningShared,
        persistPlanningShared
    } = useData();

    const storedPlanning = useMemo(
        () => (contextPlanningState && typeof contextPlanningState === 'object' ? contextPlanningState : {}),
        [contextPlanningState]
    );
    const getTemplateKeyForLine = useCallback((line) => {
        if (!line || !lineTemplates) return line;
        const key = Object.keys(lineTemplates).find((k) => isLineMatch(line, k));
        return key ?? line;
    }, [lineTemplates]);
    const lineOptions = useMemo(() => {
        const keys = Object.keys(lineTemplates || {});
        if (keys.length === 0) return [];
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
        return sorted.length ? sorted : [];
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
        lineOptions.includes(value) ? value : (lineOptions[0] ?? value ?? null)
    );

    const defaultPlanningDate = storedPlanning?.products?.[0]?.date || formatDateLocal(new Date());

    const initialTab = storedPlanning.activeTab || 'schedule';
    const [activeTab, setActiveTabState] = useState(initialTab);
    const userSelectedTabRef = useRef(false);
    const [visitedTabs, setVisitedTabs] = useState(() => ({ [initialTab]: true }));
    const [cipDurations, setCipDurations] = useState(() => storedPlanning.cipDurations || {});
    const [baseProducts, setBaseProducts] = useState(() => storedPlanning.baseProducts || []);
    const planningSharedAppliedRef = useRef(false);
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
    const [selectedPlanLine, setSelectedPlanLine] = useState(() => resolveLineOption(storedPlanning.selectedPlanLine));
    const [speedLines, setSpeedLines] = useState(() => storedPlanning.speedLines || []);
    const [products, setProducts] = useState(() => storedPlanning.products || []);
    const [cipBetween, setCipBetween] = useState(() => storedPlanning.cipBetween || []);
    const [lineWorkDates, setLineWorkDates] = useState(() => storedPlanning.lineWorkDates || {});

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
    const [transitionRules, setTransitionRules] = useState(() =>
        useStoredTransitionRules ? storedPlanning.transitionRules || TRANSITION_RULES_BASE : TRANSITION_RULES_BASE
    );
    const [lineEvents, setLineEvents] = useState(() => storedPlanning.lineEvents || []);
    const [expandedCipIndex, setExpandedCipIndex] = useState(null);
    const [transitionSearch, setTransitionSearch] = useState({});
    const [transitionResult, setTransitionResult] = useState(null);
    const [transitionStatus, setTransitionStatus] = useState('idle');
    const [transitionError, setTransitionError] = useState('');
    const [transitionProgress, setTransitionProgress] = useState(0);
    const [transitionProgressNodes, setTransitionProgressNodes] = useState(null);
    const [transitionSaveStatus, setTransitionSaveStatus] = useState('');
    const [transitionSearchQuery, setTransitionSearchQuery] = useState('');
    const [displacementRules, setDisplacementRules] = useState(() => storedPlanning.displacementRules || []);
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
        const stored = (storedPlanning.exportLines || []).map(resolveLineOption).filter(Boolean);
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
            if (!rule) map.set(from.index, true);
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
                if (duration === null) missingDurations += 1;
                else total += duration;
            }
            return { rows, total, missingDurations, missingRules };
        };
        const was = getTransitions(lineTransitionKeys);
        const now = getTransitions(optimizedOrderKeys);
        return { was, now };
    }, [lineEvents, selectedPlanLine, transitionRuleMap, lineTransitionKeys, optimizedOrderKeys, getTemplateKeyForLine]);

    const filteredTransitionRules = useMemo(() => {
        const query = transitionSearchQuery.trim().toLowerCase();
        if (!query) return transitionRules;
        return (transitionRules || []).filter((rule) => {
            const haystack = [rule.productName, rule.cip1, rule.cip2, rule.cip3].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }, [transitionRules, transitionSearchQuery]);

    const transitionTotalPages = Math.max(1, Math.ceil((filteredTransitionRules?.length || 0) / TRANSITION_PAGE_SIZE));
    const paginatedTransitionRules = useMemo(() => {
        const list = filteredTransitionRules || [];
        const start = (transitionPage - 1) * TRANSITION_PAGE_SIZE;
        return list.slice(start, start + TRANSITION_PAGE_SIZE);
    }, [filteredTransitionRules, transitionPage]);

    useEffect(() => setTransitionPage(1), [transitionSearchQuery]);
    useEffect(() => {
        if (transitionPage > transitionTotalPages && transitionTotalPages >= 1) setTransitionPage(transitionTotalPages);
    }, [transitionPage, transitionTotalPages]);

    const createTransitionWorker = () => {
        const worker = new Worker(
            new URL('../workers/transitionOptimizer.worker.js', import.meta.url),
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
                setTransitionProgressNodes(payload?.nodesExplored !== undefined ? payload.nodesExplored : null);
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
                if (nextProduct !== String(rule.productName || '').trim() || nextCip1 !== String(rule.cip1 || '') || nextCip2 !== String(rule.cip2 || '') || nextCip3 !== String(rule.cip3 || '')) changed = true;
                return { ...rule, productName: nextProduct, cip1: nextCip1, cip2: nextCip2, cip3: nextCip3 };
            });
            return changed ? next : prev;
        });
    }, [baseProducts]);

    useEffect(() => () => {
        if (transitionSaveTimeoutRef.current) clearTimeout(transitionSaveTimeoutRef.current);
    }, []);

    useEffect(() => {
        if (normalizedLinesRef.current) return;
        let changed = false;
        const nextProducts = products.map((p) => (p.line ? p : (changed = true, { ...p, line: selectedPlanLine })));
        const nextCipBetween = cipBetween.map((c) => (c.line ? c : (changed = true, { ...c, line: selectedPlanLine })));
        if (changed) {
            setProducts(nextProducts);
            setCipBetween(nextCipBetween);
        }
        normalizedLinesRef.current = true;
    }, [products, cipBetween, selectedPlanLine]);

    const resolveCipEventKeyToLineEvents = useCallback((typeOrKey, events) => {
        if (!typeOrKey || !Array.isArray(events) || !events.length) return typeOrKey || '';
        const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
        const match = events.find((e) => e.category && norm(e.category) === norm(typeOrKey));
        if (match) return match.category;
        const cipMatch = events.find((e) => e.category && /CIP/i.test(e.category));
        return cipMatch ? cipMatch.category : (typeOrKey || '');
    }, []);

    useEffect(() => {
        if (planningStateToLoad && typeof planningStateToLoad === 'object') {
            userSelectedTabRef.current = false;
            const loaded = planningStateToLoad;
            if (Array.isArray(loaded.products)) setProducts(loaded.products);
            if (Array.isArray(loaded.cipBetween)) {
                setCipBetween(loaded.cipBetween.map((cip) => ({
                    ...cip,
                    eventKey: resolveCipEventKeyToLineEvents(cip.type || cip.eventKey, lineEvents) || cip.eventKey || ''
                })));
            }
            if (loaded.selectedPlanLine && lineOptions.includes(loaded.selectedPlanLine)) setSelectedPlanLine(loaded.selectedPlanLine);
            if (Array.isArray(loaded.transitionRules)) setTransitionRules(loaded.transitionRules);
            if (Array.isArray(loaded.exportLines)) setExportLines(loaded.exportLines.filter(l => lineOptions.includes(l)));
            if (loaded.exportType) setExportType(loaded.exportType);
            if (loaded.lineWorkDates && typeof loaded.lineWorkDates === 'object') setLineWorkDates(loaded.lineWorkDates);
            if (loaded.activeTab) setActiveTabState(loaded.activeTab);
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
            const loaded = contextPlanningState && typeof contextPlanningState === 'object' ? contextPlanningState : {};
            if (!loaded || typeof loaded !== 'object') return;
            if (Array.isArray(loaded.products)) setProducts(loaded.products);
            if (Array.isArray(loaded.cipBetween)) {
                setCipBetween(loaded.cipBetween.map((cip) => ({
                    ...cip,
                    eventKey: resolveCipEventKeyToLineEvents(cip.type || cip.eventKey, lineEvents) || cip.eventKey || ''
                })));
            }
            if (loaded.selectedPlanLine && lineOptions.includes(loaded.selectedPlanLine)) setSelectedPlanLine(loaded.selectedPlanLine);
            if (Array.isArray(loaded.transitionRules)) setTransitionRules(loaded.transitionRules);
            if (Array.isArray(loaded.exportLines)) setExportLines(loaded.exportLines.filter(l => lineOptions.includes(l)));
            if (loaded.exportType) setExportType(loaded.exportType);
            if (loaded.lineWorkDates && typeof loaded.lineWorkDates === 'object') setLineWorkDates(loaded.lineWorkDates);
            if (loaded.activeTab) setActiveTabState(loaded.activeTab);
        }
    }, [planningStateVersion, planningStateToLoad, setPlanningStateToLoad, contextPlanningState, resolveCipEventKeyToLineEvents]);

    useEffect(() => {
        if (planningSharedAppliedRef.current || !planningShared || typeof planningShared !== 'object') return;
        if (Array.isArray(planningShared.baseProducts)) setBaseProducts(planningShared.baseProducts);
        if (Array.isArray(planningShared.speedLines)) setSpeedLines(planningShared.speedLines);
        if (planningShared.cipDurations && typeof planningShared.cipDurations === 'object') setCipDurations(planningShared.cipDurations);
        if (Array.isArray(planningShared.lineEvents)) setLineEvents(planningShared.lineEvents);
        if (Array.isArray(planningShared.displacementRules)) setDisplacementRules(planningShared.displacementRules);
        planningSharedAppliedRef.current = true;
    }, [planningShared]);

    const loadPlanQueueRafRef = useRef(null);
    useEffect(() => {
        if (activeTab !== 'schedule' || !currentPlanId || !activePlanHasQueue) return;
        loadPlanQueueRafRef.current = requestAnimationFrame(() => {
            loadPlanQueueRafRef.current = null;
            loadPlanQueueRef.current?.(currentPlanId);
        });
        return () => {
            if (loadPlanQueueRafRef.current != null) {
                cancelAnimationFrame(loadPlanQueueRafRef.current);
                loadPlanQueueRafRef.current = null;
            }
        };
    }, [activeTab, currentPlanId, activePlanHasQueue]);

    useEffect(() => {
        if (!useStoredTransitionRules) setTransitionRules(TRANSITION_RULES_BASE);
    }, [useStoredTransitionRules]);

    const planOnlyState = useMemo(() => ({
        activeTab, products, cipBetween, selectedPlanLine, transitionRules,
        transitionRulesVersion: TRANSITION_RULES_VERSION, exportLines, exportType, lineWorkDates
    }), [activeTab, products, cipBetween, selectedPlanLine, transitionRules, exportLines, exportType, lineWorkDates]);

    const savePlanningState = useMemo(() => debounce((planState) => {
        if (!planState) return;
        persistStateKey(STORAGE_KEYS.PLANNING_STATE, planState);
        if (updatePlanPlanningState) updatePlanPlanningState(planState);
    }, 400), [persistStateKey, updatePlanPlanningState]);

    const savePlanningSharedDebounced = useMemo(() => debounce((shared) => {
        if (shared && persistPlanningShared) persistPlanningShared(shared);
    }, 500), [persistPlanningShared]);

    useEffect(() => {
        if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
        savePlanningState(planOnlyState);
    }, [planOnlyState, savePlanningState]);

    useEffect(() => {
        savePlanningSharedDebounced({ baseProducts, speedLines, cipDurations, lineEvents, displacementRules });
    }, [baseProducts, speedLines, cipDurations, lineEvents, displacementRules, savePlanningSharedDebounced]);

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

    const addSpeedLine = () => {
        setSpeedLines(prev => [...prev, {
            id: `line_${Date.now()}_${prev.length}`,
            name: '',
            entries: [{ id: `entry_${Date.now()}_${prev.length}_0`, format: '', speed: '' }]
        }]);
    };
    const updateSpeedLineName = (lineId, value) => {
        setSpeedLines(prev => prev.map(line => (line.id === lineId ? { ...line, name: value } : line)));
    };
    const addSpeedEntry = (lineId) => {
        setSpeedLines(prev => prev.map(line => {
            if (line.id !== lineId) return line;
            return { ...line, entries: [...line.entries, { id: `entry_${Date.now()}_${line.entries.length}`, format: '', speed: '' }] };
        }));
    };
    const updateSpeedEntry = (lineId, entryId, key, value) => {
        setSpeedLines(prev => prev.map(line => {
            if (line.id !== lineId) return line;
            return { ...line, entries: line.entries.map(entry => (entry.id === entryId ? { ...entry, [key]: value } : entry)) };
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
        setLineEvents(prev => [...prev, {
            id: `line_event_${Date.now()}_${prev.length}`,
            category: '',
            durations: lineOptions.reduce((acc, line) => { acc[line] = ''; return acc; }, {})
        }]);
    };
    const removeLineEvent = (index) => {
        setLineEvents(prev => prev.filter((_, idx) => idx !== index));
    };

    const addDefaultCipEvents = useCallback(() => {
        const defaults = ['CIP1', 'CIP2', 'CIP3', 'Переналадка', 'Смена ассортимента', 'Вытеснение'];
        const dur = lineOptions.reduce((acc, line) => { acc[line] = ''; return acc; }, {});
        setLineEvents((prev) => {
            const exists = (c) => prev.some((e) => e.category === c || (/CIP/i.test(c) ? new RegExp(c, 'i').test(e.category) : (e.category || '').includes(c)));
            const add = defaults.filter((c) => !exists(c)).map((category, i) => ({ id: `line_event_${Date.now()}_def_${i}`, category, durations: { ...dur } }));
            return add.length ? [...prev, ...add] : prev;
        });
    }, [lineOptions]);

    const addTransitionRule = () => {
        setTransitionRules(prev => [...prev, { id: `tr_${Date.now()}_${prev.length}`, productName: '', baseCip: 'cip1', cip1: '', cip2: '', cip3: '' }]);
    };
    const productsWithoutRules = useMemo(() => {
        const keys = new Set();
        products.filter((p) => lineMatchesSelected(p.line, selectedPlanLine) && p.name).forEach((p) => {
            const key = getTransitionKeyForName(p.name);
            if (key && !transitionRuleMap.has(key)) keys.add(key);
        });
        return Array.from(keys);
    }, [products, selectedPlanLine, transitionRuleMap, getTransitionKeyForName, lineMatchesSelected]);

    const clearPourQueue = useCallback(() => { setProducts([]); setCipBetween([]); }, []);

    const addMissingProductsAsRules = () => {
        if (productsWithoutRules.length === 0) return;
        const now = Date.now();
        setTransitionRules((prev) => [...prev, ...productsWithoutRules.map((key, i) => ({
            id: `tr_${now}_${prev.length + i}`, productName: key, baseCip: 'cip2', cip1: '', cip2: '', cip3: ''
        }))]);
    };
    const removeTransitionRule = (id) => {
        setTransitionRules(prev => prev.filter(rule => rule.id !== id));
        setTransitionSearch(prev => { const next = { ...prev }; delete next[id]; return next; });
    };
    const addDisplacementRule = () => {
        setDisplacementRules(prev => [...prev, { id: `dr_${Date.now()}_${prev.length}`, from: '', to: '', exception: '' }]);
    };
    const removeDisplacementRule = (id) => setDisplacementRules(prev => prev.filter((r) => r.id !== id));
    const updateDisplacementRule = (id, key, value) => setDisplacementRules(prev => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    const updateTransitionRule = (id, key, value) => setTransitionRules(prev => prev.map(rule => (rule.id === id ? { ...rule, [key]: value } : rule)));
    const updateTransitionSearch = (id, key, value) => {
        setTransitionSearch(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
    };

    const runTransitionOptimization = () => {
        if (transitionStatus === 'running') stopTransitionOptimization();
        if (!transitionWorkerRef.current) return;
        const lineProducts = products.filter(p => lineMatchesSelected(p.line, selectedPlanLine)).map(p => p.name).filter(Boolean);
        const templateKey = getTemplateKeyForLine(selectedPlanLine);
        const dur = (event) => event?.durations?.[selectedPlanLine] ?? event?.durations?.[templateKey] ?? 0;
        if (lineProducts.length === 0) { setTransitionError('Нет продуктов для выбранной линии.'); return; }
        setTransitionStatus('running');
        setTransitionError('');
        setTransitionProgress(0);
        setTransitionProgressNodes(null);
        transitionWorkerRef.current.postMessage({
            type: 'optimize',
            payload: {
                products: lineProducts,
                currentOrderIndices: Array.from({ length: lineProducts.length }, (_, i) => i),
                transitions: transitionRules,
                cipDurations: {
                    cip1: dur(lineEvents.find(e => /CIP1/i.test(e.category))) || 0,
                    cip2: dur(lineEvents.find(e => /CIP2/i.test(e.category))) || 0,
                    cip3: dur(lineEvents.find(e => /CIP3/i.test(e.category))) || 0,
                    perenaladka: dur(lineEvents.find(e => e.category?.includes('Переналадка'))) || 0,
                    smenaAssortimenta: dur(lineEvents.find(e => e.category?.includes('Смена ассортимента'))) || 0,
                    vytesnenie: dur(lineEvents.find(e => e.category?.includes('Вытеснение'))) || 0
                },
                displacementRules,
                timeBudgetMs: 2500
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
            lineItems.push({ index, product, cip: cipBetween[index] });
        });
        if (lineItems.length === 0) return;
        const useIndices = orderKeysOrIndices.every((x) => typeof x === 'number');
        let reordered;
        if (useIndices && orderKeysOrIndices.length === lineItems.length) {
            reordered = orderKeysOrIndices.map((i) => lineItems[i]).filter(Boolean);
            if (reordered.length < lineItems.length) {
                const used = new Set(reordered.map((item) => item.index));
                lineItems.forEach((item) => { if (!used.has(item.index)) reordered.push(item); });
            }
        } else {
            const queues = new Map();
            lineItems.forEach((item) => {
                const key = getTransitionKeyForName(item.product.name);
                if (!queues.has(key)) queues.set(key, []);
                queues.get(key).push(item);
            });
            reordered = [];
            orderKeysOrIndices.forEach((key) => { const q = queues.get(key); if (q?.length) reordered.push(q.shift()); });
            queues.forEach((q) => { while (q.length) reordered.push(q.shift()); });
            if (reordered.length < lineItems.length) {
                const used = new Set(reordered.map((item) => item.index));
                lineItems.forEach((item) => { if (!used.has(item.index)) reordered.push(item); });
            }
        }
        const nextProducts = [...products];
        const nextCipBetween = [...cipBetween];
        lineIndices.forEach((idx, i) => {
            const item = reordered[i];
            if (!item) return;
            nextProducts[idx] = { ...item.product };
            if (idx < nextCipBetween.length) nextCipBetween[idx] = item.cip ? { ...item.cip } : item.cip;
        });
        const lineProducts = nextProducts.map((p, i) => ({ product: p, index: i })).filter(({ product }) => lineMatchesSelected(product.line, selectedPlanLine));
        let missingRules = 0;
        for (let i = 0; i < lineProducts.length - 1; i += 1) {
            const from = lineProducts[i];
            const to = lineProducts[i + 1];
            if (!nextCipBetween[from.index]) {
                nextCipBetween[from.index] = { id: `cip_${Date.now()}_${from.index}`, date: from.product.date || nextProducts[0]?.date || formatDateLocal(new Date()), manualDate: false, start: '', end: '', manualStart: false, manualEnd: false, line: selectedPlanLine, eventKey: '' };
            }
            const eventKey = getEventKeyBetweenProducts(from.product, lineProducts[i + 1].product);
            if (eventKey == null) missingRules += 1;
            else nextCipBetween[from.index] = { ...nextCipBetween[from.index], line: selectedPlanLine, eventKey };
        }
        setProducts(nextProducts);
        setCipBetween(nextCipBetween);
        if (missingRules > 0) setTransitionError(`Нет правил перехода для ${missingRules} переход(ов).`);
    };

    const applyTransitionsForCurrentOrder = () => {
        setTransitionError('');
        const lineProducts = products.map((p, i) => ({ product: p, index: i })).filter(({ product }) => lineMatchesSelected(product.line, selectedPlanLine));
        if (lineProducts.length < 2) { setTransitionError('Недостаточно продуктов для расстановки переходов.'); return; }
        let missingRules = 0;
        const nextCipBetween = [...cipBetween];
        for (let i = 0; i < lineProducts.length - 1; i += 1) {
            const from = lineProducts[i];
            const to = lineProducts[i + 1];
            if (!nextCipBetween[from.index]) continue;
            const eventKey = getEventKeyBetweenProducts(from.product, to.product);
            if (eventKey == null) missingRules += 1;
            else nextCipBetween[from.index] = { ...nextCipBetween[from.index], line: selectedPlanLine, eventKey };
        }
        setCipBetween(nextCipBetween);
        if (missingRules > 0) setTransitionError(`Нет правил перехода для ${missingRules} переход(ов).`);
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
        if (transitionSaveTimeoutRef.current) clearTimeout(transitionSaveTimeoutRef.current);
        transitionSaveTimeoutRef.current = setTimeout(() => setTransitionSaveStatus(''), 2000);
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
                const baseDate = products[0]?.date || formatDateLocal(new Date());
                const importedProducts = items.map((item, idx) => ({
                    id: `plan_${Date.now()}_${idx}`, date: baseDate, manualDate: false, start: '', end: '', manualStart: false, manualEnd: false, line: selectedPlanLine,
                    name: item.name, qty: item.qty || '', speed: findSpeedForVolume(selectedPlanLine, item.volume) || item.speed || ''
                }));
                const importedCips = importedProducts.slice(0, -1).map((_, idx) => ({
                    id: `cip_${Date.now()}_${idx}`, date: baseDate, manualDate: false, start: '', end: '', manualStart: false, manualEnd: false, line: selectedPlanLine, eventKey: eventOptions[0]?.key || ''
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
                        byLine[line].cips.push(cipBetween[idx] ? { ...cipBetween[idx] } : { id: `cip_${Date.now()}_${line}_${j}`, date: baseDate, manualDate: false, start: '', end: '', manualStart: false, manualEnd: false, line, eventKey: eventOptions[0]?.key || '' });
                    }
                    delete byLine[line].indices;
                });
                byLine[selectedPlanLine] = { products: importedProducts, cips: importedCips };
                const nextProducts = [];
                const nextCipBetween = [];
                lineOptions.forEach((line) => {
                    const data = byLine[line];
                    if (!data?.products?.length) return;
                    data.products.forEach((p, i) => { nextProducts.push(p); if (i < data.cips.length) nextCipBetween.push(data.cips[i]); });
                });
                setProducts(nextProducts);
                setCipBetween(nextCipBetween);
            } else setBaseProducts(items);
            setIsProductImportOpen(false);
            setIsPlanImportOpen(false);
            setPlanImportPreview(null);
            setPasteText('');
        } catch (err) {
            const msg = err?.message || 'Ошибка импорта данных.';
            if (target === 'plan') setPlanImportError(msg);
            if (target === 'reference') setProductImportError(msg);
        }
    };

    const eventOptions = useMemo(() => lineEvents.map((item) => ({ key: item.category, label: item.category })), [lineEvents]);
    const eventLabelByKey = useMemo(() => eventOptions.reduce((acc, o) => { acc[o.key] = o.label; return acc; }, {}), [eventOptions]);

    const getEventKeyForCipKey = (cipKey) => {
        const patternByCip = { cip1: /CIP1/i, cip2: /CIP2/i, cip3: /CIP3/i };
        const re = patternByCip[cipKey];
        if (!re) return eventOptions[0]?.key || '';
        const match = lineEvents.find((item) => re.test(item.category));
        return match ? match.category : (eventOptions[0]?.key || '');
    };
    const getEventKeyForCategoryName = (categoryName) => {
        const match = lineEvents.find((item) => item.category === categoryName || (categoryName && item.category?.includes(categoryName)));
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

    const eventDurationByKey = useMemo(() => lineEvents.reduce((acc, item) => { acc[item.category] = item.durations || {}; return acc; }, {}), [lineEvents]);

    const getEventDurationMinutes = useCallback((eventKey, lineName) => {
        let durations = eventDurationByKey[eventKey];
        if (!durations && eventKey?.includes('__')) durations = eventDurationByKey[eventKey.split('__')[0]];
        if (!durations) return 0;
        const templateKey = getTemplateKeyForLine(lineName);
        const value = durations[lineName] ?? durations[templateKey];
        if (value !== undefined && value !== null && value !== '') {
            const n = Number.isFinite(value) ? value : parseNumeric(value);
            if (Number.isFinite(n)) return Math.max(0, n);
        }
        const fallback = Object.values(durations).find((v) => { const n = Number.isFinite(v) ? v : parseNumeric(v); return Number.isFinite(n) && n > 0; });
        return fallback != null ? (Number.isFinite(fallback) ? fallback : parseNumeric(fallback)) : 0;
    }, [eventDurationByKey, getTemplateKeyForLine]);

    const getProductDurationMinutes = (product) => {
        const qty = parseNumeric(product.qty);
        const speed = parseNumeric(product.speed);
        if (qty <= 0 || speed <= 0) return 0;
        return Math.max(0, Math.round((qty / speed) * 60));
    };

    const buildRows = useCallback((nextProducts, nextCipBetween, lineFilter = selectedPlanLine, missingMap = missingTransitionByIndex) => {
        const rows = [];
        const safeMissing = missingMap || new Map();
        nextProducts.forEach((p, i) => {
            if (!lineMatchesSelected(p.line, lineFilter)) return;
            rows.push({ kind: 'product', index: i, ...p, durationMinutes: getProductDurationMinutes(p) });
            if (i < nextCipBetween.length) {
                const cip = nextCipBetween[i];
                if (!cip) return;
                const rowLine = cip.line || p.line || lineFilter;
                if (!lineMatchesSelected(rowLine, lineFilter)) return;
                const eventKey = cip.eventKey || (eventOptions[0]?.key ?? '');
                const rawCipMinutes = getEventDurationMinutes(eventKey, rowLine);
                rows.push({ kind: 'cip', index: i, ...cip, line: rowLine, eventKey, missingTransition: safeMissing.get(i) === true, durationMinutes: rawCipMinutes > 0 ? rawCipMinutes : CIP_FALLBACK_DURATION_MIN });
            }
        });
        return rows;
    }, [eventOptions, getEventDurationMinutes, selectedPlanLine, missingTransitionByIndex]);

    const applySchedule = useCallback((rows, anchorIndex) => {
        if (rows.length === 0) return rows;
        const safeAnchor = Math.max(0, Math.min(rows.length - 1, anchorIndex ?? 0));
        const anchorRow = rows[safeAnchor];
        const anchorStartManual = anchorRow.manualStart && anchorRow.start;
        const anchorEndManual = anchorRow.manualEnd && anchorRow.end;
        const baseDate = anchorRow.manualDate && anchorRow.date || anchorRow.date || rows[0].date || formatDateLocal(new Date());
        const anchorDayIndex = parseDateToDayIndex(baseDate) ?? parseDateToDayIndex(formatDateLocal(new Date())) ?? 0;
        const totalDuration = rows.reduce((sum, row) => sum + (row.durationMinutes || 0), 0);
        if (totalDuration === 0) {
            if (anchorStartManual) anchorRow.end = formatMinutesToTime(parseTimeToMinutes(anchorRow.start));
            else if (anchorEndManual) anchorRow.start = formatMinutesToTime(parseTimeToMinutes(anchorRow.end));
            return rows;
        }
        let anchorStartMinutes = 0, anchorEndMinutes = 0;
        if (anchorStartManual) { anchorStartMinutes = parseTimeToMinutes(anchorRow.start); anchorEndMinutes = anchorStartMinutes + anchorRow.durationMinutes; }
        else if (anchorEndManual) { anchorEndMinutes = parseTimeToMinutes(anchorRow.end); anchorStartMinutes = anchorEndMinutes - anchorRow.durationMinutes; }
        else { const baseStart = anchorRow.start || rows[0].start || '08:00'; anchorStartMinutes = parseTimeToMinutes(baseStart); anchorEndMinutes = anchorStartMinutes + anchorRow.durationMinutes; }
        const absStart = new Array(rows.length).fill(0);
        const absEnd = new Array(rows.length).fill(0);
        absStart[safeAnchor] = anchorDayIndex * 1440 + anchorStartMinutes;
        absEnd[safeAnchor] = absStart[safeAnchor] + anchorRow.durationMinutes;
        for (let i = safeAnchor - 1; i >= 0; i -= 1) { absEnd[i] = absStart[i + 1]; absStart[i] = absEnd[i] - rows[i].durationMinutes; }
        for (let i = safeAnchor + 1; i < rows.length; i += 1) { absStart[i] = absEnd[i - 1]; absEnd[i] = absStart[i] + rows[i].durationMinutes; }
        rows.forEach((row, index) => {
            const startMinutes = absStart[index], endMinutes = absEnd[index];
            const startDayIndex = Math.floor(startMinutes / 1440), endDayIndex = Math.floor(endMinutes / 1440);
            const startTime = ((startMinutes % 1440) + 1440) % 1440, endTime = ((endMinutes % 1440) + 1440) % 1440;
            row.date = formatDayIndexToDate(startDayIndex);
            row.endDate = formatDayIndexToDate(endDayIndex);
            row.start = formatMinutesToTime(startTime);
            row.end = formatMinutesToTime(endTime);
        });
        return rows;
    }, []);

    const syncRowsToState = useCallback((rows) => {
        setProducts((prevProducts) => {
            const nextProducts = prevProducts.map((p) => ({ ...p }));
            rows.forEach((row) => {
                if (row.kind === 'product' && row.index < nextProducts.length) nextProducts[row.index] = { ...nextProducts[row.index], date: row.date, start: row.start, end: row.end, manualDate: row.manualDate, manualStart: row.manualStart, manualEnd: row.manualEnd };
            });
            return nextProducts;
        });
        setCipBetween((prevCip) => {
            const nextCip = prevCip.map((c) => ({ ...c }));
            rows.forEach((row) => {
                if (row.kind === 'cip' && row.index < nextCip.length) nextCip[row.index] = { ...nextCip[row.index], date: row.date, start: row.start, end: row.end, manualDate: row.manualDate, manualStart: row.manualStart, manualEnd: row.manualEnd };
            });
            return nextCip;
        });
    }, []);

    const demandLineHeaders = useMemo(() => [...lineOptions, 'Ручная линия'], [lineOptions]);

    const buildDemandFromSchedule = (rows, shiftList) => {
        const header = new Array(15 + demandLineHeaders.length).fill('');
        header[11] = 'Дата';
        header[13] = 'Тип смены';
        header[14] = 'Смена';
        demandLineHeaders.forEach((line, idx) => { header[15 + idx] = line; });
        const table = [header];
        (shiftList || []).forEach((shift) => {
            const row = new Array(header.length).fill('');
            row[11] = shift.date || '';
            row[13] = shift.type || '';
            row[14] = shift.shiftId ? `Смена ${shift.shiftId}` : 'Смена';
            demandLineHeaders.forEach((line, idx) => {
                row[15 + idx] = rows.some((r) => lineMatchesSelected(r.line, line) && isRowActiveForShift(r, shift)) ? 1 : '';
            });
            table.push(row);
        });
        return table;
    };

    const joinUnique = (items) => Array.from(new Set(items.filter(Boolean))).join(', ');

    const buildRosterFromDistribution = () => {
        const sourceLineTemplates = lineTemplates ?? {};
        const sourceFloaters = floaters ?? { day: [], night: [] };
        const sourceWorkerRegistry = workerRegistry ?? {};
        const header = new Array(19).fill('');
        header[4] = 'Линия'; header[5] = 'Должность'; header[6] = 'Норма';
        ['1', '2', '3', '4'].forEach((shiftId, idx) => { header[7 + idx * 3] = `Смена ${shiftId}`; header[8 + idx * 3] = `Компетенции ${shiftId}`; header[9 + idx * 3] = `Статус ${shiftId}`; });
        const table = [header];
        const fillRow = (lineName, role, count, rosterMap = {}) => {
            const row = new Array(header.length).fill('');
            row[4] = lineName; row[5] = role; row[6] = count;
            ['1', '2', '3', '4'].forEach((shiftId, idx) => {
                const namesStr = rosterMap[shiftId] || '';
                const names = namesStr ? namesStr.split(/[,;\n/]+/).map((n) => n.trim()).filter((n) => n.length > 1) : [];
                const compList = names.map((name) => joinUnique(Array.from(sourceWorkerRegistry?.[name]?.competencies || [])));
                const statusList = names.map((name) => sourceWorkerRegistry?.[name]?.status?.raw).filter(Boolean);
                row[7 + idx * 3] = namesStr; row[8 + idx * 3] = joinUnique(compList); row[9 + idx * 3] = joinUnique(statusList);
            });
            table.push(row);
        };
        Object.entries(sourceLineTemplates || {}).forEach(([lineName, positions]) => {
            (positions || []).forEach((pos) => fillRow(lineName, pos.role, pos.count, pos.roster || {}));
        });
        if (sourceFloaters?.day?.length) fillRow('Резерв День', 'Подсобник', sourceFloaters.day.length, { 1: sourceFloaters.day.map((f) => f.name).join(', ') });
        if (sourceFloaters?.night?.length) fillRow('Резерв Ночь', 'Подсобник', sourceFloaters.night.length, { 2: sourceFloaters.night.map((f) => f.name).join(', ') });
        return table;
    };

    const handleCreatePlanFromSchedule = () => {
        setPlanCreateError('');
        setPlanCreateStatus('idle');
        try {
            if (!createPlanFromSchedule) throw new Error('Функция сохранения плана недоступна.');
            if (!allRowsAllLines?.length) throw new Error('Нет позиций для построения плана.');
            const autoShifts = buildShiftsFromRows(allRowsAllLines, defaultPlanningDate);
            const demand = buildDemandFromSchedule(allRowsAllLines, autoShifts);
            const roster = buildRosterFromDistribution();
            const planName = (planSaveName || activePlanName || `План ${new Date().toLocaleDateString('ru-RU')}`).trim();
            createPlanFromSchedule({ demand, roster, name: planName, planningState: planOnlyState });
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
            if (!createPlanFromSchedule) throw new Error('Функция сохранения плана недоступна.');
            const parsed = {};
            const errors = [];
            lineOptions.forEach((line) => {
                const { dates, errors: errs } = parseLineDatesInput(lineWorkDraft[line]);
                if (errs.length > 0) errors.push(`${line}: ${errs.join(', ')}`);
                if (dates.length > 0) parsed[line] = dates;
            });
            if (errors.length > 0) { setLineWorkError(errors.join(' | ')); return; }
            if (Object.keys(parsed).length === 0) { setLineWorkError('Укажите даты работы хотя бы для одной линии.'); return; }
            const rows = buildLineWorkRows(parsed);
            const autoShifts = buildShiftsFromRows(rows, defaultPlanningDate);
            const demand = buildDemandFromSchedule(rows, autoShifts);
            const roster = buildRosterFromDistribution();
            const planName = (planSaveName || activePlanName || `План ${new Date().toLocaleDateString('ru-RU')}`).trim();
            createPlanFromSchedule({
                demand, roster, name: planName,
                planningState: { activeTab: 'schedule', products: [], cipBetween: [], selectedPlanLine, transitionRules, transitionRulesVersion: TRANSITION_RULES_VERSION, exportLines, exportType, lineWorkDates: parsed }
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
    }, [products, cipBetween, selectedPlanLine, missingTransitionByIndex, buildRows, applySchedule]);

    const allRowsAllLines = useMemo(() => {
        const combined = [];
        lineOptions.forEach((line) => {
            const missing = buildMissingTransitionMap(line);
            const rows = buildRows(products, cipBetween, line, missing);
            const anchorIndex = rows.findIndex(r => r.manualStart || r.manualEnd);
            applySchedule(rows, anchorIndex === -1 ? 0 : anchorIndex).forEach((r) => combined.push(r));
        });
        return combined;
    }, [products, cipBetween, buildMissingTransitionMap, lineOptions, buildRows, applySchedule]);

    const exportSections = useMemo(() => {
        return exportLines.map((line) => {
            const missing = buildMissingTransitionMap(line);
            const rows = buildRows(products, cipBetween, line, missing);
            const anchorIndex = rows.findIndex((r) => r.manualStart || r.manualEnd);
            const scheduled = applySchedule(rows, anchorIndex === -1 ? 0 : anchorIndex);
            if (!scheduled.length) return null;
            const summary = {
                totalDuration: scheduled.reduce((sum, row) => sum + (row.durationMinutes || 0), 0),
                productDuration: scheduled.filter(row => row.kind === 'product').reduce((sum, row) => sum + (row.durationMinutes || 0), 0),
                cipDuration: scheduled.filter(row => row.kind === 'cip').reduce((sum, row) => sum + (row.durationMinutes || 0), 0),
                start: scheduled[0]?.start || '—', end: scheduled[scheduled.length - 1]?.end || '—', date: scheduled[0]?.date || '—'
            };
            const formattedRows = scheduled.map((row, index) => ({
                ...row,
                label: row.kind === 'cip' ? (eventLabelByKey[row.eventKey] || row.eventKey || 'CIP') : row.name,
                displayIndex: index + 1, quantityLabel: row.qty || '—', displayDuration: row.durationMinutes ? `${row.durationMinutes} мин` : '—'
            }));
            return { line, rows: formattedRows, summary };
        }).filter(Boolean);
    }, [exportLines, products, cipBetween, buildMissingTransitionMap, eventLabelByKey, buildRows, applySchedule]);

    const linesFromGraph = useMemo(() => {
        const set = new Set();
        products.forEach((p) => { if (p?.line) set.add(p.line); });
        cipBetween.forEach((c) => { if (c?.line) set.add(c.line); });
        const list = Array.from(set);
        const extractNum = (s) => { const m = String(s).match(/Линия\s*(\d+)/i); return m ? parseInt(m[1], 10) : null; };
        list.sort((a, b) => { const na = extractNum(a), nb = extractNum(b); if (na != null && nb != null) return na - nb; if (na != null) return -1; if (nb != null) return 1; return String(a).localeCompare(b, undefined, { numeric: true }); });
        return list.length > 0 ? list : lineOptions;
    }, [products, cipBetween, lineOptions]);

    useEffect(() => {
        const rows = buildRows(products, cipBetween, selectedPlanLine, missingTransitionByIndex);
        const anchorIndex = rows.findIndex((r) => r.manualStart || r.manualEnd);
        const scheduled = applySchedule(rows, anchorIndex === -1 ? 0 : anchorIndex);
        const needsUpdate = scheduled.some((row) => { const src = row.kind === 'product' ? products[row.index] : cipBetween[row.index]; return src.start !== row.start || src.end !== row.end; });
        if (needsUpdate) syncRowsToState(scheduled);
    }, [products, cipBetween, selectedPlanLine, missingTransitionByIndex, buildRows, applySchedule, syncRowsToState]);

    const handleTimeChange = (row, field, value) => {
        const rows = buildRows(products, cipBetween, selectedPlanLine, missingTransitionByIndex);
        const index = rows.findIndex(r => r.kind === row.kind && r.index === row.index);
        if (index === -1) return;
        rows[index] = { ...rows[index], [field]: value, manualStart: field === 'start' ? true : rows[index].manualStart, manualEnd: field === 'end' ? true : rows[index].manualEnd };
        syncRowsToState(applySchedule(rows, index));
    };

    const handleDateChange = (row, value) => {
        const rows = buildRows(products, cipBetween, selectedPlanLine, missingTransitionByIndex);
        const index = rows.findIndex(r => r.kind === row.kind && r.index === row.index);
        if (index === -1) return;
        rows[index] = { ...rows[index], date: parseDateInputValue(value), manualDate: true };
        syncRowsToState(applySchedule(rows, index));
    };

    const handleCipTypeChange = (index, value) => {
        setCipBetween(prev => prev.map((item, i) => (i === index ? { ...item, eventKey: value } : item)));
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
        setCipBetween(prev => (index >= prev.length ? prev : [...prev.slice(0, index), ...prev.slice(index + 1)]));
    };

    const toggleExportLine = (line) => {
        setExportLines((prev) => (prev.includes(line) ? prev.filter(item => item !== line) : [...prev, line]));
    };

    const handleExportReport = () => {
        if (exportSections.length === 0) return;
        const metadata = { title: 'Очередность розлива', lines: exportSections.map(s => s.line), generatedAt: new Date(), description: exportType === 'pdf' ? 'PDF-выгрузка' : 'Предпросмотр HTML' };
        if (exportType === 'pdf') exportReportAsPdf(exportSections, metadata);
        else openReportPreview(exportSections, metadata);
        setIsExportModalOpen(false);
    };

    const getPlanOptionLabel = useCallback((plan) => {
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
            const firstLine = prods.find((p) => p?.line)?.line;
            if (firstLine) count = countRowsForLine(prods, cips, firstLine);
        }
        if (count <= 0) {
            const demand = plan?.data?.rawTables?.demand;
            if (Array.isArray(demand) && demand.length > 1) {
                count = demand.slice(1).reduce((s, row) => s + ((row.slice(15) || []).filter((c) => c === 1 || c === '1').length), 0);
            }
        }
        const countStr = count > 0 ? ` (${count})` : '';
        return `${plan.name || plan.id}${countStr}`;
    }, [lineOptions, selectedPlanLine]);

    const setActiveTab = useCallback((tab) => {
        userSelectedTabRef.current = true;
        setActiveTabState(tab);
    }, []);

    return {
        activeTab, setActiveTab, visitedTabs, setVisitedTabs, loadPlanQueue, currentPlanId, activePlanHasQueue,
        savedPlans, loadPlan, setCurrentPlanId, lineOptions, selectedPlanLine, setSelectedPlanLine, eventCountByLine,
        baseProducts, products, setProducts, cipBetween, setCipBetween, productImportError, planImportError, setPlanImportError, pasteText, setPasteText,
        isProductImportOpen, setIsProductImportOpen, isPlanImportOpen, setIsPlanImportOpen, planImportPreview, setPlanImportPreview,
        isLineWorkPlanOpen, setIsLineWorkPlanOpen, lineWorkDraft, setLineWorkDraft, lineWorkDates, setLineWorkDates, lineWorkError, setLineWorkError,
        speedLines, addSpeedLine, updateSpeedLineName, addSpeedEntry, updateSpeedEntry, removeSpeedEntry,
        lineEvents, setLineEvents, addLineEvent, addDefaultCipEvents, removeLineEvent, expandedCipIndex, setExpandedCipIndex,
        getTemplateKeyForLine, transitionRules, setTransitionRules, transitionSearchQuery, setTransitionSearchQuery,
        transitionPage, setTransitionPage, transitionTotalPages, filteredTransitionRules, paginatedTransitionRules,
        addTransitionRule, updateTransitionRule, removeTransitionRule, updateTransitionSearch, transitionSearch, setTransitionSearch,
        productsWithoutRules, addMissingProductsAsRules, handleSaveTransitionBase, transitionSaveStatus,
        activeProductSearchCell, setActiveProductSearchCell, activeTransitionCell, setActiveTransitionCell,
        productSearchQuery, setProductSearchQuery, baseProductByName, getTransitionKeyForProduct, getTransitionKeyForName,
        displacementRules, addDisplacementRule, removeDisplacementRule, updateDisplacementRule,
        allRows, allRowsAllLines, exportSections, exportLines, setExportLines, exportType, setExportType,
        toggleExportLine, handleExportReport, isExportModalOpen, setIsExportModalOpen, isTransitionModalOpen, setIsTransitionModalOpen,
        transitionStatus, transitionProgress, transitionProgressNodes, transitionError, transitionResult, transitionAnalytics,
        applyOptimizedOrder, stopTransitionOptimization, handlePasteImport, parseProductPastePreview,
        handleCreatePlanFromSchedule, handleCreatePlanFromLineDates, planSaveName, setPlanSaveName, activePlanName,
        planCreateError, planCreateStatus,
        planOnlyState, defaultPlanningDate, buildShiftsFromRows, buildDemandFromSchedule, buildRosterFromDistribution,
        demandLineHeaders, lineMatchesSelected, buildMissingTransitionMap, buildRows, applySchedule, syncRowsToState,
        handleTimeChange, handleDateChange, handleCipTypeChange, eventOptions, eventLabelByKey, missingTransitionByIndex,
        removeProductAt, moveProduct, dragIndex, setDragIndex, runTransitionOptimization, createPlanFromSchedule,
        clearPourQueue, applyTransitionsForCurrentOrder,
        formatDateLocal, parseDateInputValue, parseNumeric, CIP_FALLBACK_DURATION_MIN, buildLineWorkRows, parseLineDatesInput,
        lineTemplates, floaters, workerRegistry, TRANSITION_PAGE_SIZE, getPlanOptionLabel
    };
}

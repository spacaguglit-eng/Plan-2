import React, { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'plan2-debug-overlay';
const MAX_TEXT_LEN = 40;
const TOOLTIP_OFFSET = 12;
const HIDE_DELAY_MS = 80;

/** Menu label → display name for "Ведёт: …". Update when menu items change in App.jsx. */
const LABEL_TO_VIEW = {
    'Смены': 'Смены',
    'Табель': 'Табель',
    'Список': 'Список',
    'Распределение': 'Распределение',
    'Сверка': 'Сверка',
    'Все сотрудники': 'Все сотрудники',
    'Планы': 'Планы',
    'Список планов': 'Список планов',
    'Отчёты': 'Отчёты',
    'Отчёты по производству': 'Отчёты по производству',
    'Отчёты по сменам': 'Отчёты по сменам',
    'Производство': 'Производство',
    'Планирование': 'Планирование',
};

/** Component/hook name → source file (relative to project). Add new modules here when added. */
const COMPONENT_TO_SOURCE = {
    App: 'App.jsx',
    ElementDebugOverlay: 'components/debug/ElementDebugOverlay.jsx',
    DataProviderInner: 'context/DataContext.jsx',
    DashboardView: 'components/views/DashboardView.jsx',
    DashboardShiftBlock: 'components/views/dashboard/DashboardShiftBlock.jsx',
    FilledSlotCard: 'components/views/dashboard/FilledSlotCard.jsx',
    AssignContextMenu: 'components/views/dashboard/AssignContextMenu.jsx',
    TimesheetView: 'components/views/TimesheetView.jsx',
    VerificationView: 'components/views/VerificationView.jsx',
    VerificationTable: 'components/views/verification/VerificationTable.jsx',
    VerificationUploadPrompt: 'components/views/verification/VerificationUploadPrompt.jsx',
    VerificationFilters: 'components/views/verification/VerificationFilters.jsx',
    VerificationHeader: 'components/views/verification/VerificationHeader.jsx',
    ShiftReportsView: 'components/views/ShiftReportsView.jsx',
    ShiftReportsHeader: 'components/views/shiftReports/ShiftReportsHeader.jsx',
    ShiftReportsReportsTab: 'components/views/shiftReports/ShiftReportsReportsTab.jsx',
    ShiftReportsDowntimeTab: 'components/views/shiftReports/ShiftReportsDowntimeTab.jsx',
    ReportsView: 'components/views/ReportsView.jsx',
    ReportsHeader: 'components/views/reports/ReportsHeader.jsx',
    ReportsToolbar: 'components/views/reports/ReportsToolbar.jsx',
    ReportsEmployeeAnalysisContent: 'components/views/reports/ReportsEmployeeAnalysisContent.jsx',
    ReportsLineDetailContent: 'components/views/reports/ReportsLineDetailContent.jsx',
    MasterPlanModal: 'components/views/reports/MasterPlanModal.jsx',
    SkudModal: 'components/views/reports/SkudModal.jsx',
    ProductionView: 'components/views/ProductionView.jsx',
    ProductionHeader: 'components/views/production/ProductionHeader.jsx',
    ProductionLinesTab: 'components/views/production/ProductionLinesTab.jsx',
    ProductionTableTab: 'components/views/production/ProductionTableTab.jsx',
    ProductionReportsTab: 'components/views/production/ProductionReportsTab.jsx',
    ProductionChartsTab: 'components/views/production/ProductionChartsTab.jsx',
    DowntimeTableTab: 'components/views/production/DowntimeTableTab.jsx',
    PlanningView: 'components/views/PlanningView.jsx',
    PlansView: 'components/views/PlansView.jsx',
    AllEmployeesView: 'components/views/AllEmployeesView.jsx',
    DistributionView: 'components/views/DistributionView.jsx',
    EmployeesListView: 'components/views/EmployeesListView.jsx',
    ManageDepartmentsModal: 'components/common/ManageDepartmentsModal.jsx',
    useDashboardData: 'hooks/useDashboardData.js',
    usePlanState: 'context/hooks/usePlanState.js',
    usePlanActions: 'context/hooks/usePlanActions.js',
    useShiftCalculations: 'context/hooks/useShiftCalculations.js',
    useChessTableLogic: 'context/hooks/useChessTableLogic.js',
    useVerificationData: 'hooks/useVerificationData.js',
    useShiftReportsData: 'hooks/useShiftReportsData.js',
    useReportsData: 'hooks/useReportsData.js',
    useProductionData: 'hooks/useProductionData.js',
    useAllEmployeesData: 'hooks/useAllEmployeesData.jsx',
};

function normalizeLabel(s) {
    if (typeof s !== 'string') return '';
    return s.trim().toLowerCase();
}

/** Prefer the clickable/label parent so icon-only hovers show the button label. */
function getLabelElement(el) {
    if (!el) return null;
    const tag = el.tagName && el.tagName.toLowerCase();
    const role = el.getAttribute && el.getAttribute('role');
    if (tag === 'button' || tag === 'a' || role === 'button' || role === 'menuitem' || role === 'tab') return el;
    const parent = el.parentElement;
    if (!parent) return el;
    const pTag = parent.tagName && parent.tagName.toLowerCase();
    const pRole = parent.getAttribute && parent.getAttribute('role');
    if (pTag === 'button' || pTag === 'a' || pRole === 'button' || pRole === 'menuitem' || pRole === 'tab') return parent;
    return el;
}

/** Get the best "name" for the element from DOM only. */
function getElementName(el) {
    if (!el || !el.getAttribute) return '';

    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim().slice(0, MAX_TEXT_LEN);

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim().slice(0, MAX_TEXT_LEN);

    const tag = el.tagName && el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
        const placeholder = el.getAttribute('placeholder');
        if (placeholder && placeholder.trim()) return placeholder.trim().slice(0, MAX_TEXT_LEN);
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        return type === 'text' ? 'поле' : `${type} поле`;
    }

    const role = el.getAttribute('role');
    const isButtonLike = tag === 'button' || tag === 'a' || role === 'button' || role === 'menuitem' || role === 'tab';
    const isHeading = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag) || role === 'heading';
    if (isButtonLike || isHeading) {
        const text = (el.innerText || el.textContent || '').trim().split(/\s*[\r\n]\s*/)[0].slice(0, MAX_TEXT_LEN);
        if (text) return text;
    }

    const directText = (el.innerText || el.textContent || '').trim().split(/\s*[\r\n]\s*/)[0].slice(0, MAX_TEXT_LEN);
    if (directText) return directText;

    const roleOrTag = role || tag || 'element';
    return roleOrTag === 'button' ? 'кнопка' : roleOrTag === 'a' ? 'ссылка' : `${tag || 'element'}${role ? ` (${role})` : ''}`;
}

/** Get "where it leads" from DOM: href for links, or label match for buttons. */
function getElementDestination(el, labelToView) {
    if (!el || !el.getAttribute) return '';

    const tag = el.tagName && el.tagName.toLowerCase();
    if (tag === 'a') {
        const href = el.getAttribute('href');
        if (href) {
            if (href.startsWith('#')) return `Якорь ${href}`;
            if (href.startsWith('http') || href.startsWith('//')) return `Ссылка: ${href.slice(0, 50)}${href.length > 50 ? '…' : ''}`;
            return href;
        }
    }

    const text = (el.innerText || el.textContent || '').trim();
    const normalized = normalizeLabel(text);
    for (const [label, display] of Object.entries(labelToView)) {
        if (normalizeLabel(label) === normalized) return display;
    }
    const truncated = text.slice(0, 60).trim();
    if (truncated) {
        for (const [label, display] of Object.entries(labelToView)) {
            if (normalized && normalizeLabel(label).includes(normalized)) return display;
            if (normalizeLabel(label) && normalized.includes(normalizeLabel(label))) return display;
        }
    }

    if (tag === 'button' || el.getAttribute('role') === 'button') return 'Кнопка';
    if (tag === 'a') return 'Ссылка';
    return 'Действие';
}

/** Get React fiber from DOM node (React 17/18 internal). Returns null if not found or in production. */
function getFiberFromNode(el) {
    if (!el || typeof el !== 'object') return null;
    try {
        for (const key of Object.keys(el)) {
            if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$') || key === '_reactInternals') {
                const fiber = el[key];
                if (fiber && typeof fiber === 'object') return fiber;
            }
        }
    } catch (_) {}
    return null;
}

/** Get component name from fiber type. */
function getComponentName(type) {
    if (!type) return null;
    if (typeof type === 'string') return type;
    return type.displayName || type.name || null;
}

/** Walk up fiber tree and collect component/hook names with source files (for debug "Код"). */
function getComponentSourceStack(fiber, componentToSource, maxDepth = 8) {
    const items = [];
    let f = fiber;
    let depth = 0;
    while (f && depth < maxDepth) {
        const type = f.type;
        const name = getComponentName(type);
        if (name && typeof type === 'function') {
            const file = componentToSource[name];
            if (file) items.push({ name, file });
            else items.push({ name, file: null });
        }
        f = f.return;
        depth++;
    }
    return items;
}

function ElementDebugOverlay({ enabled }) {
    const [target, setTarget] = useState(null);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const hideTimeoutRef = useRef(null);

    const updateTarget = useCallback((clientX, clientY) => {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) {
            setTarget(null);
            return;
        }
        const root = document.getElementById('root');
        if (!root || !root.contains(el)) {
            setTarget(null);
            return;
        }
        if (el.closest('[data-debug-overlay]')) return;
        const labelEl = getLabelElement(el);
        const destination = getElementDestination(labelEl, LABEL_TO_VIEW);
        let codeStack = [];
        const fiber = getFiberFromNode(el);
        if (fiber) codeStack = getComponentSourceStack(fiber, COMPONENT_TO_SOURCE);
        const name = (codeStack[0]?.name) || getElementName(labelEl);
        setTarget({ name, destination, codeStack });
        setCoords({ x: clientX + TOOLTIP_OFFSET, y: clientY + TOOLTIP_OFFSET });
    }, []);

    useEffect(() => {
        if (!enabled) {
            setTarget(null);
            return;
        }

        const onPointerMove = (e) => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
            updateTarget(e.clientX, e.clientY);
        };

        const onPointerLeave = () => {
            hideTimeoutRef.current = setTimeout(() => setTarget(null), HIDE_DELAY_MS);
        };

        document.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('pointerleave', onPointerLeave);

        return () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerleave', onPointerLeave);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, [enabled, updateTarget]);

    if (!enabled || !target) return null;

    return (
        <div
            className="fixed z-[9999] text-xs font-sans"
            style={{ left: coords.x, top: coords.y, pointerEvents: 'none' }}
        >
            <div data-debug-overlay className="bg-slate-800/90 text-slate-100 rounded px-2 py-1.5 shadow-lg border border-slate-600 min-w-[200px] max-w-[400px] max-h-[70vh] overflow-y-auto" style={{ pointerEvents: 'auto' }}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-300">Имя:</div>
                        <div className="text-white break-words">{target.name || '—'}</div>
                    </div>
                    <button
                        type="button"
                        className="shrink-0 text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-slate-600/50 transition-colors"
                        style={{ pointerEvents: 'auto' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            const lines = [`Имя: ${target.name || '—'}`];
                            if (target.codeStack?.length) {
                                lines.push('Код:');
                                target.codeStack.forEach(({ name, file }) => {
                                    lines.push(file ? `${name} → ${file}` : name);
                                });
                            }
                            try {
                                navigator.clipboard.writeText(lines.join('\n'));
                            } catch (_) {}
                        }}
                        title="Скопировать всё"
                    >
                        копировать всё
                    </button>
                </div>
                {target.codeStack && target.codeStack.length > 0 && (
                    <>
                        <div className="font-medium text-slate-300 mt-1">Код:</div>
                        <div className="text-amber-200/95 text-[11px] font-mono space-y-0.5 mt-0.5">
                            {target.codeStack.map(({ name, file }, i) => (
                                <div key={i} className="flex items-start gap-1 group">
                                    {file ? (
                                        <>
                                            <span className="break-all flex-1 min-w-0" title={file}>{name} → {file}</span>
                                            <button
                                                type="button"
                                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white shrink-0 text-[10px] px-1"
                                                style={{ pointerEvents: 'auto' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        navigator.clipboard.writeText(file);
                                                    } catch (_) {}
                                                }}
                                                title="Скопировать путь"
                                            >
                                                копировать
                                            </button>
                                        </>
                                    ) : (
                                        <span title="Добавь в COMPONENT_TO_SOURCE в ElementDebugOverlay.jsx">{name}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default ElementDebugOverlay;
export { STORAGE_KEY };

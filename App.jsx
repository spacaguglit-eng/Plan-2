import React, { useEffect, useState } from 'react';
const BRAND_IMAGES = ['/brand.jpg', '/brand.png', '/brand.svg'];

const UI_SCALE_STORAGE_KEY = 'plan_ui_scale';
const BASE_FONT_SIZE_PX = 16;
const SCALE_OPTIONS = Array.from({ length: 21 }, (_, i) => (50 + i * 5) / 100); // 50%–150% шаг 5%

function getStoredScale() {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(UI_SCALE_STORAGE_KEY) : null;
    const n = raw != null ? parseFloat(raw) : NaN;
    if (!isNaN(n) && n >= 0.5 && n <= 1.5) {
        const rounded = Math.round(n * 20) / 20;
        return SCALE_OPTIONS.includes(rounded) ? rounded : 1;
    }
    return 1;
}

function applyUIScale(scale) {
    if (typeof document === 'undefined') return;
    document.documentElement.style.fontSize = `${BASE_FONT_SIZE_PX * scale}px`;
}

import { LayoutGrid, Grid3X3, Users, FileCheck, Briefcase, Activity, FolderOpen, ChevronDown, Factory, Calendar, BarChart, Trash2, Plug, FileText, X } from 'lucide-react';
import { useData } from './context/DataContext';
import { UpdateReportModal, EditWorkerModal } from './UIComponents';
import DashboardView from './components/views/DashboardView';
import DistributionView from './components/views/DistributionView';
import TimesheetView from './components/views/TimesheetView';
import VerificationView from './components/views/VerificationView';
import AllEmployeesView from './components/views/AllEmployeesView';
import EmployeesListView from './components/views/EmployeesListView';
import PlansView from './components/views/PlansView';
import BothPlansTableView from './components/views/BothPlansTableView';
import ProductionView from './components/views/ProductionView';
import PlanningView from './components/views/PlanningView';
import ReportsView from './components/views/ReportsView';
import ShiftReportsView from './components/views/ShiftReportsView';
import OneCTestView from './components/views/OneCTestView';
import SyncIndicator from './components/SyncIndicator';
export default function App() {
    const [openNavMenu, setOpenNavMenu] = useState(null); // 'staff' | 'plans' | 'reports' | 'extra' | null — только одно меню открыто
    const [brandLogoIndex, setBrandLogoIndex] = useState(0);
    const [uiScale, setUiScale] = useState(getStoredScale);
    const showBrandFallback = brandLogoIndex >= BRAND_IMAGES.length;

    useEffect(() => {
        applyUIScale(uiScale);
        try {
            localStorage.setItem(UI_SCALE_STORAGE_KEY, String(uiScale));
        } catch (_) {}
    }, [uiScale]);

    const {
        step,
        setStep,
        viewMode,
        setViewMode,
        selectedDate,
        setSelectedDate,
        scheduleDates,
        calculateDailyStats,
        updateReport,
        setUpdateReport,
        editingWorker,
        setEditingWorker,
        handleWorkerEditSave,
        handleWorkerDelete,
        workerRegistry,
        lineTemplates,
        syncStatus,
        syncLog,
        showSyncLog,
        setShowSyncLog,
        cloudStatus,
        remoteSnapshot,
        pendingUpdates,
        rawTables,
        setRawTables,
        savedPlans,
        currentPlanId,
        wipeAllData
    } = useData();

    // Scroll to target brigade when targetScrollBrigadeId changes
    useEffect(() => {
        if (viewMode === 'dashboard' && selectedDate) {
            // This effect will be handled by DashboardView if needed
        }
    }, [viewMode, selectedDate]);

    useEffect(() => {
        if (openNavMenu == null) return;
        const handleClickOutside = () => setOpenNavMenu(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [openNavMenu]);

    const isStaffView = ['dashboard', 'chess', 'employees_list', 'employees_roster', 'verification', 'all_employees']
        .includes(viewMode);
    const isReportsActive = ['reports', 'shift_reports'].includes(viewMode);

    const getTabStyle = (mode, isActive) => {
        const styles = {
            staff: isActive ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50',
            plans: isActive ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50',
            reports: isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50',
            production: isActive ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50',
            planning: isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50',
            custom: isActive ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-violet-600 hover:bg-violet-50',
            extra: isActive ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
        };
        return styles[mode] || (isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50');
    };


    const handleNewFile = () => {
        setStep('upload');
        setRawTables({});
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans text-slate-800 overflow-y-auto">
            <UpdateReportModal data={updateReport} onClose={() => setUpdateReport(null)} />
            {editingWorker && (
                <EditWorkerModal
                    worker={editingWorker === 'new' ? null : editingWorker}
                    onClose={() => setEditingWorker(null)}
                    onSave={handleWorkerEditSave}
                    onDelete={handleWorkerDelete}
                    workerRegistry={workerRegistry}
                    lineTemplates={lineTemplates}
                />
            )}
            {showSyncLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSyncLog(false)}>
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                                <FileText size={20} className="text-slate-600" />
                                <h2 className="text-lg font-bold text-slate-800">Логи синхронизации</h2>
                            </div>
                            <button
                                onClick={() => setShowSyncLog(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-slate-500">Статус:</span>
                                    <span className={`ml-2 font-semibold ${
                                        syncStatus === 'saved' ? 'text-emerald-600' :
                                        syncStatus === 'syncing' ? 'text-blue-600' :
                                        syncStatus === 'error' ? 'text-red-600' :
                                        'text-slate-600'
                                    }`}>
                                        {syncStatus === 'saved' ? 'Сохранено' :
                                         syncStatus === 'syncing' ? 'Синхронизация...' :
                                         syncStatus === 'error' ? 'Ошибка' :
                                         'Ожидание'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Облако:</span>
                                    <span className={`ml-2 font-semibold ${
                                        cloudStatus?.status === 'has_data' ? 'text-emerald-600' :
                                        cloudStatus?.status === 'loading' ? 'text-blue-600' :
                                        cloudStatus?.status === 'empty' ? 'text-slate-500' :
                                        'text-slate-400'
                                    }`}>
                                        {cloudStatus?.status === 'has_data' ? 'Есть данные' :
                                         cloudStatus?.status === 'loading' ? 'Загрузка...' :
                                         cloudStatus?.status === 'empty' ? 'Пусто' :
                                         'Отключено'}
                                    </span>
                                    {typeof cloudStatus?.planCount === 'number' && (
                                        <div className="mt-1 text-xs text-slate-500">
                                            Планов в облаке: <span className="font-semibold text-slate-700">{cloudStatus.planCount}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Содержимое облака (планы) */}
                            <div className="border border-slate-200 rounded-lg bg-white/60 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Планы в облаке (по списку планов)</span>
                                    <span className="text-xs text-slate-500">
                                        {Array.isArray(savedPlans) ? `${savedPlans.length} шт.` : '—'}
                                    </span>
                                </div>
                                {Array.isArray(savedPlans) && savedPlans.length > 0 ? (
                                    <div className="max-h-32 overflow-auto space-y-1">
                                        {savedPlans.map((p) => (
                                            <div
                                                key={p.id}
                                                className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                                                    p.id === currentPlanId ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'
                                                }`}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-medium truncate max-w-[220px]" title={p.name}>{p.name || p.id}</span>
                                                    <span className="text-[10px] text-slate-500">
                                                        {p.type || 'план'} • {p.createdAt ? new Date(p.createdAt).toLocaleString('ru') : 'дата не указана'}
                                                    </span>
                                                </div>
                                                {p.id === currentPlanId && (
                                                    <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-600">Текущий</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500">
                                        Нет сохранённых планов (или список ещё не загружен).
                                    </div>
                                )}
                            </div>
                            {/* Полный снимок облака (ключи) */}
                            <div className="mt-3 border border-slate-200 rounded-lg bg-white/60 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Ключи состояния в облаке</span>
                                    <span className="text-xs text-slate-500">
                                        {remoteSnapshot && typeof remoteSnapshot === 'object'
                                            ? `${Object.keys(remoteSnapshot).length} ключей`
                                            : '—'}
                                    </span>
                                </div>
                                {remoteSnapshot && typeof remoteSnapshot === 'object' && Object.keys(remoteSnapshot).length > 0 ? (
                                    <div className="max-h-32 overflow-auto space-y-1">
                                        {Object.keys(remoteSnapshot).map((key) => {
                                            const val = remoteSnapshot[key];
                                            let kind = typeof val;
                                            let extra = '';
                                            try {
                                                const parsed = val && typeof val === 'string' ? JSON.parse(val) : val;
                                                const v = parsed && typeof parsed === 'object' && 'value' in parsed ? parsed.value : parsed;
                                                if (Array.isArray(v)) {
                                                    kind = 'array';
                                                    extra = `(${v.length} эл.)`;
                                                } else if (v && typeof v === 'object') {
                                                    kind = 'object';
                                                    extra = '';
                                                }
                                            } catch {
                                                // ignore parse errors, keep typeof
                                            }
                                            return (
                                                <div key={key} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-slate-50 text-slate-700 font-mono">
                                                    <span className="truncate max-w-[220px]" title={key}>{key}</span>
                                                    <span className="ml-2 text-slate-500 whitespace-nowrap">
                                                        {kind}{extra ? ` ${extra}` : ''}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500">
                                        Нет данных (или снимок ещё не загружен).
                                    </div>
                                )}
                            </div>
                            {/* Отладочная информация */}
                            <div className="mt-4 pt-4 border-t border-slate-200">
                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Отладка</div>
                                <div className="space-y-2 text-xs">
                                    <div className="flex items-start gap-2">
                                        <span className="text-slate-500 min-w-[140px]">currentPlanId:</span>
                                        <span className="font-mono text-slate-700 break-all">
                                            {currentPlanId ? `"${currentPlanId}"` : '<null>'}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="text-slate-500 min-w-[140px]">pendingUpdates:</span>
                                        <div className="flex-1">
                                            <span className="font-mono text-slate-700">
                                                {pendingUpdates && typeof pendingUpdates === 'object' ? Object.keys(pendingUpdates).length : 0} ключей
                                            </span>
                                            {pendingUpdates && typeof pendingUpdates === 'object' && Object.keys(pendingUpdates).length > 0 && (
                                                <div className="mt-1 space-y-1">
                                                    {Object.keys(pendingUpdates).map((key) => (
                                                        <div key={key} className="text-slate-600 font-mono text-xs pl-2">
                                                            • {key}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="text-slate-500 min-w-[140px]">isSynced (вычислено):</span>
                                        <div className="flex-1">
                                            {(() => {
                                                const isSynced = syncStatus === 'saved' || (currentPlanId && cloudStatus?.status === 'has_data');
                                                const reason = syncStatus === 'saved' 
                                                    ? 'syncStatus === "saved"'
                                                    : currentPlanId && cloudStatus?.status === 'has_data'
                                                    ? 'currentPlanId && cloudStatus?.status === "has_data"'
                                                    : !currentPlanId
                                                    ? 'Нет currentPlanId'
                                                    : cloudStatus?.status !== 'has_data'
                                                    ? `cloudStatus?.status !== "has_data" (сейчас: "${cloudStatus?.status || 'undefined'}")`
                                                    : 'Неизвестная причина';
                                                return (
                                                    <>
                                                        <span className={`font-semibold ${isSynced ? 'text-emerald-600' : 'text-blue-600'}`}>
                                                            {isSynced ? 'true (зелёное)' : 'false (синее)'}
                                                        </span>
                                                        <div className="mt-1 text-slate-600 text-xs">
                                                            Причина: {reason}
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Опасные действия с облаком */}
                            <div className="mt-4 pt-4 border-t border-red-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Опасные действия</span>
                                </div>
                                <p className="text-xs text-slate-500 mb-2">
                                    «Сброс (Wipe All)» полностью очищает облако и локальное хранилище. Откатить действие нельзя.
                                </p>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        wipeAllData();
                                    }}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors"
                                >
                                    <Trash2 size={14} className="text-red-500" />
                                    <span>Сброс (Wipe All)</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {syncLog && syncLog.length > 0 ? (
                                <div className="space-y-2">
                                    {syncLog.map((log, idx) => (
                                        <div
                                            key={log.id || idx}
                                            className={`p-3 rounded-lg border ${
                                                log.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                                                log.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                                                log.type === 'syncing' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                                                'bg-slate-50 border-slate-200 text-slate-700'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1">
                                                    <div className="text-xs font-semibold mb-1">{log.type || 'info'}</div>
                                                    <div className="text-sm">{log.message || '—'}</div>
                                                </div>
                                                <div className="text-xs text-slate-500 whitespace-nowrap">
                                                    {log.timestamp || '—'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-500">
                                    <FileText size={48} className="mx-auto mb-2 text-slate-300" />
                                    <p>Логи синхронизации пусты</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <>
                    <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-3">
                        <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row md:items-center gap-4">
                            <div className="flex flex-1 items-center md:justify-start">
                                <div className="flex items-center gap-3">
                                    <div className="flex justify-center h-14 sm:h-16 min-w-[3rem] max-w-[16rem] overflow-hidden bg-white rounded px-2 py-1.5 shrink-0">
                                        {showBrandFallback ? (
                                            <Briefcase size={32} className="shrink-0 text-slate-500" />
                                        ) : (
                                            <img
                                                src={BRAND_IMAGES[brandLogoIndex]}
                                                alt="Бренд"
                                                className="max-h-full max-w-full w-auto h-auto object-contain object-center"
                                                style={{ background: 'white' }}
                                                onError={() => setBrandLogoIndex((i) => i + 1)}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-shrink-0 justify-center">
                                <div className="bg-slate-100 p-1 rounded-lg flex border border-slate-200">
                                    {/* Staff Menu */}
                                    <div className="relative flex items-center">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenNavMenu((prev) => (prev === 'staff' ? null : 'staff'));
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('staff', isStaffView)}`}
                                        >
                                            <Users size={16} /> Штат
                                            <ChevronDown size={14} className={`transition-transform ${openNavMenu === 'staff' ? 'rotate-180' : ''}`} />
                                        </button>
                                        {openNavMenu === 'staff' && (
                                            <div
                                                className="absolute left-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {[
                                                    { id: 'dashboard', label: 'Смены', icon: LayoutGrid },
                                                    { id: 'chess', label: 'Табель', icon: Grid3X3 },
                                                    { id: 'employees_list', label: 'Список', icon: Users },
                                                    { id: 'employees_roster', label: 'Распределение', icon: LayoutGrid },
                                                    { id: 'verification', label: 'Сверка', icon: FileCheck },
                                                    { id: 'all_employees', label: 'Все сотрудники', icon: Users },
                                                ].map(item => {
                                                    const Icon = item.icon;
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => {
                                                                setViewMode(item.id);
                                                                setOpenNavMenu(null);
                                                            }}
                                                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                                                viewMode === item.id ? 'bg-emerald-50 text-emerald-600' : 'text-slate-600 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            <Icon size={16} /> {item.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Plans Menu */}
                                    <div className="relative flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenNavMenu((prev) => (prev === 'plans' ? null : 'plans'));
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('plans', viewMode === 'plans' || viewMode === 'both_plans')}`}
                                        >
                                            <FolderOpen size={16} /> Планы
                                            <ChevronDown size={14} className={`transition-transform ${openNavMenu === 'plans' ? 'rotate-180' : ''}`} />
                                        </button>
                                        {openNavMenu === 'plans' && (
                                            <div
                                                className="absolute left-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setViewMode('plans');
                                                        setOpenNavMenu(null);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                                        viewMode === 'plans' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <FolderOpen size={16} /> Список планов
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setViewMode('both_plans');
                                                        setOpenNavMenu(null);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                                        viewMode === 'both_plans' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <FolderOpen size={16} /> Оба плана таблицей
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Reports Menu Item */}
                                    <div className="relative flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenNavMenu((prev) => (prev === 'reports' ? null : 'reports'));
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('reports', isReportsActive)}`}
                                        >
                                            <BarChart size={16} /> Отчёты
                                            <ChevronDown size={14} className={`transition-transform ${openNavMenu === 'reports' ? 'rotate-180' : ''}`} />
                                        </button>
                                        {openNavMenu === 'reports' && (
                                            <div
                                                className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setViewMode('reports');
                                                        setOpenNavMenu(null);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                                        viewMode === 'reports' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <BarChart size={16} /> Отчёты по производству
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setViewMode('shift_reports');
                                                        setOpenNavMenu(null);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                                        viewMode === 'shift_reports' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <Calendar size={16} /> Отчёты по сменам
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Production Menu Item */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('production')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('production', viewMode === 'production')}`}
                                        >
                                            <Factory size={16} /> Производство
                                        </button>
                                    </div>

                                    {/* Planning Menu Item */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('planning')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('planning', viewMode === 'planning')}`}
                                        >
                                            <Calendar size={16} /> Планирование
                                        </button>
                                    </div>

                                    {/* Custom project shifts tab */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('custom_empty')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('custom', viewMode === 'custom_empty')}`}
                                        >
                                            <Briefcase size={16} /> Смены (проект)
                                        </button>
                                    </div>

                                    {/* Extra Menu (Cloud + Wipe) */}
                                    <div className="relative flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenNavMenu((prev) => (prev === 'extra' ? null : 'extra'));
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('extra', viewMode === 'onec_test')}`}
                                        >
                                            <Activity size={16} /> Дополнительно
                                            <ChevronDown size={14} className={`transition-transform ${openNavMenu === 'extra' ? 'rotate-180' : ''}`} />
                                        </button>
                                        {openNavMenu === 'extra' && (
                                            <div
                                                className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {/* Тест связи с 1С */}
                                                <button
                                                    onClick={() => {
                                                        setViewMode('onec_test');
                                                        setOpenNavMenu(null);
                                                    }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
                                                >
                                                    <Plug size={18} className="text-slate-500" />
                                                    <span>Тест связи с 1С (COM)</span>
                                                </button>
                                                
                                                {/* Логи синхронизации */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowSyncLog(true);
                                                        setOpenNavMenu(null);
                                                    }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
                                                >
                                                    <FileText size={18} className="text-slate-500" />
                                                    <span>Логи синхронизации</span>
                                                    {syncLog && syncLog.length > 0 && (
                                                        <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                            {syncLog.length}
                                                        </span>
                                                    )}
                                                </button>
                                                
                                                {/* Масштаб интерфейса */}
                                                <div className="px-4 py-3 border-b border-slate-100">
                                                    <div className="mb-3">
                                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Масштаб интерфейса</span>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {SCALE_OPTIONS.map((s) => (
                                                            <button
                                                                key={s}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setUiScale(s);
                                                                }}
                                                                className={`px-3 py-2 rounded-md text-xs font-semibold transition-all ${
                                                                    uiScale === s 
                                                                        ? 'bg-slate-700 text-white shadow-sm scale-105' 
                                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-105'
                                                                }`}
                                                            >
                                                                {Math.round(s * 100)}%
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                
                                                {/* Сброс */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        wipeAllData();
                                                    }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                                >
                                                    <Trash2 size={18} className="text-red-500" />
                                                    <span>Сброс (Wipe All)</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Global sync indicator */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <SyncIndicator className="py-1.5 px-3" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 hidden md:block" aria-hidden />
                        </div>
                    </div>
                    <div className="p-4 sm:p-6 w-full max-w-[1800px] mx-auto min-h-0">
                        {viewMode === 'dashboard' && <div className="min-h-[70vh] overflow-y-auto pr-2"><DashboardView /></div>}
                        {viewMode === 'chess' && <TimesheetView />}
                        {viewMode === 'employees_list' && <EmployeesListView />}
                        {viewMode === 'employees_roster' && <DistributionView />}
                        {viewMode === 'all_employees' && <AllEmployeesView />}
                        {viewMode === 'verification' && <VerificationView />}
                        {viewMode === 'plans' && <PlansView />}
                        {viewMode === 'both_plans' && <BothPlansTableView />}
                        {viewMode === 'reports' && <ReportsView />}
                        {viewMode === 'shift_reports' && <ShiftReportsView />}
                        {viewMode === 'production' && <ProductionView />}
                        {viewMode === 'planning' && <PlanningView />}
                        {viewMode === 'custom_empty' && (
                            <div className="min-h-[70vh] bg-white rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-sm">
                                Пустая вкладка
                            </div>
                        )}
                        {viewMode === 'onec_test' && <OneCTestView />}
                    </div>
                </>
        </div>
    );
}

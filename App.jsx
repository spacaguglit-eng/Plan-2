import React, { useEffect, useState } from 'react';
const BRAND_IMAGES = ['/brand.jpg', '/brand.png', '/brand.svg'];
import { LayoutGrid, Grid3X3, Users, FileCheck, Briefcase, AlertCircle, Activity, FolderOpen, ChevronDown, Factory, Calendar, BarChart, Trash2 } from 'lucide-react';
import { useData } from './context/DataContext';
import { UpdateReportModal, CustomDateSelector, EditWorkerModal } from './UIComponents';

// Import view components
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
export default function App() {
    const [isExtraMenuOpen, setIsExtraMenuOpen] = useState(false);
    const [isStaffMenuOpen, setIsStaffMenuOpen] = useState(false);
    const [isPlansMenuOpen, setIsPlansMenuOpen] = useState(false);
    const [isReportsMenuOpen, setIsReportsMenuOpen] = useState(false);
    const [brandLogoIndex, setBrandLogoIndex] = useState(0);
    const showBrandFallback = brandLogoIndex >= BRAND_IMAGES.length;

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
        if (!isExtraMenuOpen && !isStaffMenuOpen && !isPlansMenuOpen && !isReportsMenuOpen) return;
        const handleClickOutside = () => {
            setIsExtraMenuOpen(false);
            setIsStaffMenuOpen(false);
            setIsPlansMenuOpen(false);
            setIsReportsMenuOpen(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isExtraMenuOpen, isStaffMenuOpen, isPlansMenuOpen, isReportsMenuOpen]);

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
            extra: isActive ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
        };
        return styles[mode] || (isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50');
    };


    const handleNewFile = () => {
        setStep('upload');
        setRawTables({});
    };

    return (
        <div className="h-screen bg-slate-100 font-sans text-slate-800 flex flex-col overflow-hidden">
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
            <>
                    <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-3 flex-shrink-0">
                        <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3 mr-6 shrink-0">
                                <div className="flex items-center justify-center h-14 sm:h-16 min-w-[3rem] max-w-[16rem] overflow-hidden bg-white rounded px-2 py-1.5 shrink-0">
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
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 mr-4">
                                    {syncStatus === 'error' && (
                                        <div className="text-xs text-red-500 flex items-center gap-1" title="Ошибка сохранения в облако">
                                            <AlertCircle size={14} />
                                        </div>
                                    )}
                                </div>
                                <div className="bg-slate-100 p-1 rounded-lg flex border border-slate-200">
                                    {/* Staff Menu */}
                                    <div className="relative flex items-center">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsStaffMenuOpen((prev) => !prev);
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('staff', isStaffView)}`}
                                        >
                                            <Users size={16} /> Штат
                                            <ChevronDown size={14} className={`transition-transform ${isStaffMenuOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {isStaffMenuOpen && (
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
                                                                setIsStaffMenuOpen(false);
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
                                                setIsPlansMenuOpen((prev) => !prev);
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('plans', viewMode === 'plans' || viewMode === 'both_plans')}`}
                                        >
                                            <FolderOpen size={16} /> Планы
                                            <ChevronDown size={14} className={`transition-transform ${isPlansMenuOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {isPlansMenuOpen && (
                                            <div
                                                className="absolute left-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setViewMode('plans');
                                                        setIsPlansMenuOpen(false);
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
                                                        setIsPlansMenuOpen(false);
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
                                                setIsReportsMenuOpen((prev) => !prev);
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('reports', isReportsActive)}`}
                                        >
                                            <BarChart size={16} /> Отчёты
                                            <ChevronDown size={14} className={`transition-transform ${isReportsMenuOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {isReportsMenuOpen && (
                                            <div
                                                className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setViewMode('reports');
                                                        setIsReportsMenuOpen(false);
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
                                                        setIsReportsMenuOpen(false);
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

                                    {/* Extra Menu (Cloud + Wipe) */}
                                    <div className="relative flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsExtraMenuOpen((prev) => !prev);
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('extra', false)}`}
                                        >
                                            <Activity size={16} /> Дополнительно
                                            <ChevronDown size={14} className={`transition-transform ${isExtraMenuOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {isExtraMenuOpen && (
                                            <div
                                                className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        wipeAllData();
                                                    }}
                                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                    <span>Сброс (Wipe All)</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {viewMode === 'dashboard' && (
                                    <CustomDateSelector
                                        dates={scheduleDates}
                                        selectedDate={selectedDate}
                                        onSelect={setSelectedDate}
                                        dayStats={calculateDailyStats}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden p-4 sm:p-6 w-full max-w-[1800px] mx-auto">
                        {viewMode === 'dashboard' && <div className="h-full overflow-y-auto pr-2"><DashboardView /></div>}
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
                    </div>
                </>
        </div>
    );
}

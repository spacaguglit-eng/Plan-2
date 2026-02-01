import React, { useEffect, useState } from 'react';
const BRAND_IMAGES = ['/brand.jpg', '/brand.png', '/brand.svg'];
import { LayoutGrid, Grid3X3, Users, FileCheck, Briefcase, AlertCircle, Loader2, Activity, FolderOpen, Lock, Unlock, Database, ChevronDown, Factory, Calendar, BarChart, X, Cloud, CloudOff, Shield, Eye, Bug } from 'lucide-react';
import { useData } from './context/DataContext';
import { UpdateReportModal, CustomDateSelector, EditWorkerModal } from './UIComponents';
import { PerformanceView } from './PerformanceMonitor';
import { usePerformanceMetrics } from './performanceStore';

// Import view components
import DashboardView from './components/views/DashboardView';
import DistributionView from './components/views/DistributionView';
import FileUploader from './components/views/FileUploader';
import TimesheetView from './components/views/TimesheetView';
import VerificationView from './components/views/VerificationView';
import AllEmployeesView from './components/views/AllEmployeesView';
import EmployeesListView from './components/views/EmployeesListView';
import PlansView from './components/views/PlansView';
import RawDataView from './components/views/RawDataView';
import ProductionView from './components/views/ProductionView';
import PlanningView from './components/views/PlanningView';
import ReportsView from './components/views/ReportsView';
import DebugView from './components/views/DebugView';
import PinModal from './components/common/PinModal';

export default function App() {
    const { performanceMetrics, clearPerformanceMetrics } = usePerformanceMetrics();
    const [isPinModalOpen, setIsPinModalOpen] = useState(false);
    const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [adminError, setAdminError] = useState('');
    const [isExtraMenuOpen, setIsExtraMenuOpen] = useState(false);
    const [isStaffMenuOpen, setIsStaffMenuOpen] = useState(false);
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
        isLocked,
        unlockWithCode,
        syncLog,
        showSyncLog,
        setShowSyncLog,
        useRemoteStorage,
        setUseRemoteStorage,
        pushLocalToCloud,
        userRole,
        setUserRole,
        isReadOnly
    } = useData();

    const activePlanName = savedPlans.find(p => p.id === currentPlanId)?.name;

    // Scroll to target brigade when targetScrollBrigadeId changes
    useEffect(() => {
        if (viewMode === 'dashboard' && selectedDate) {
            // This effect will be handled by DashboardView if needed
        }
    }, [viewMode, selectedDate]);

    useEffect(() => {
        if (!isExtraMenuOpen && !isStaffMenuOpen) return;
        const handleClickOutside = () => {
            setIsExtraMenuOpen(false);
            setIsStaffMenuOpen(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isExtraMenuOpen, isStaffMenuOpen]);

    const isStaffView = ['dashboard', 'chess', 'employees_list', 'employees_roster', 'verification', 'all_employees']
        .includes(viewMode);

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
            {showSyncLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Activity size={18} className="text-blue-600" />
                                Лог синхронизации с Firebase
                            </h3>
                            <button 
                                onClick={() => setShowSyncLog(false)}
                                className="p-1 hover:bg-slate-200 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-900 font-mono text-xs">
                            {syncLog.length === 0 ? (
                                <div className="text-slate-500 italic text-center py-8">Лог пуст...</div>
                            ) : (
                                syncLog.map(log => (
                                    <div key={log.id} className="flex gap-3 border-b border-slate-800 pb-1">
                                        <span className="text-slate-500 whitespace-nowrap">[{log.timestamp}]</span>
                                        <span className={`font-bold uppercase w-16 ${
                                            log.type === 'success' ? 'text-emerald-400' : 
                                            log.type === 'error' ? 'text-rose-400' : 'text-blue-400'
                                        }`}>
                                            {log.type}
                                        </span>
                                        <span className="text-slate-300">{log.message}</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-200 bg-slate-50 text-right">
                            <button 
                                onClick={() => setShowSyncLog(false)}
                                className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <UpdateReportModal data={updateReport} onClose={() => setUpdateReport(null)} />
            {isAdminLoginOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-6">
                            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Shield size={24} className="text-emerald-600" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-800 text-center mb-4">Вход для админа</h2>
                            <input
                                type="password"
                                value={adminPassword}
                                onChange={(e) => {
                                    setAdminPassword(e.target.value);
                                    setAdminError('');
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (adminPassword === '2133') {
                                            setUserRole('admin');
                                            setIsAdminLoginOpen(false);
                                            setAdminPassword('');
                                        } else {
                                            setAdminError('Неверный пароль');
                                        }
                                    }
                                }}
                                placeholder="Введите пароль"
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                autoFocus
                            />
                            {adminError && (
                                <p className="text-red-500 text-sm text-center mt-2">{adminError}</p>
                            )}
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => {
                                        setIsAdminLoginOpen(false);
                                        setAdminPassword('');
                                        setAdminError('');
                                    }}
                                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                                >
                                    Отмена
                                </button>
                                <button
                                    onClick={() => {
                                        if (adminPassword === '2133') {
                                            setUserRole('admin');
                                            setIsAdminLoginOpen(false);
                                            setAdminPassword('');
                                        } else {
                                            setAdminError('Неверный пароль');
                                        }
                                    }}
                                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                                >
                                    Войти
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <PinModal
                isOpen={isPinModalOpen}
                onClose={() => setIsPinModalOpen(false)}
                onSuccess={() => unlockWithCode('1234')}
            />
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
            {step === 'upload' ? (
                <FileUploader />
            ) : (
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
                                {activePlanName && (
                                    <p className="text-xs text-slate-400 hidden sm:block">Активный план: {activePlanName}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 mr-4">
                                    {syncStatus === 'syncing' && (
                                        <div className="text-xs text-blue-500 flex items-center gap-1" title="Синхронизация...">
                                            <Loader2 size={12} className="animate-spin" />
                                        </div>
                                    )}
                                    {syncStatus === 'error' && (
                                        <div className="text-xs text-red-500 flex items-center gap-1" title="Ошибка сохранения">
                                            <AlertCircle size={14} />
                                        </div>
                                    )}
                                    {isReadOnly && (
                                        <div className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full flex items-center gap-1" title="Режим только для чтения">
                                            <Eye size={12} />
                                            <span>Гость</span>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        if (isLocked) {
                                            setIsPinModalOpen(true);
                                        }
                                    }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                        isLocked
                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    }`}
                                    title={isLocked ? 'Мастер-план защищен' : 'Редактирование разрешено'}
                                >
                                    {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                                    {isLocked ? 'Мастер (Защищено)' : 'Редактирование'}
                                </button>
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

                                    {/* Plans Menu Item */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('plans')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('plans', viewMode === 'plans')}`}
                                        >
                                            <FolderOpen size={16} /> Планы
                                        </button>
                                    </div>

                                    {/* Reports Menu Item */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('reports')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('reports', viewMode === 'reports')}`}
                                        >
                                            <BarChart size={16} /> Отчёты
                                        </button>
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

                                    {/* Extra Menu (Monitoring + Raw Data) */}
                                    <div className="relative flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsExtraMenuOpen((prev) => !prev);
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${getTabStyle('extra', viewMode === 'performance' || viewMode === 'raw_data' || viewMode === 'debug')}`}
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
                                                    onClick={() => {
                                                        setViewMode('performance');
                                                        setIsExtraMenuOpen(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                                        viewMode === 'performance' ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <Activity size={16} /> Мониторинг
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setViewMode('raw_data');
                                                        setIsExtraMenuOpen(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                                        viewMode === 'raw_data' ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <Database size={16} /> Исходные данные
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setViewMode('debug');
                                                        setIsExtraMenuOpen(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                                        viewMode === 'debug' ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <Bug size={16} /> Отладка
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowSyncLog(true);
                                                        setIsExtraMenuOpen(false);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                                                >
                                                    <Activity size={16} /> Лог синхронизации
                                                </button>
                                                <div className="border-t border-slate-100 my-1"></div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setUseRemoteStorage(!useRemoteStorage);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors ${
                                                        useRemoteStorage ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-500 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {useRemoteStorage ? <Cloud size={16} /> : <CloudOff size={16} />}
                                                        <span>Облако (Firebase)</span>
                                                    </div>
                                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${useRemoteStorage ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${useRemoteStorage ? 'right-0.5' : 'left-0.5'}`}></div>
                                                    </div>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        pushLocalToCloud();
                                                    }}
                                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                                                >
                                                    <Cloud size={16} />
                                                    <span>Загрузить локальные данные в облако</span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (userRole === 'admin') {
                                                            setUserRole('guest');
                                                        } else {
                                                            setIsAdminLoginOpen(true);
                                                        }
                                                        setIsExtraMenuOpen(false);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors ${
                                                        userRole === 'admin' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-500 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {userRole === 'admin' ? <Shield size={16} /> : <Eye size={16} />}
                                                        <span>{userRole === 'admin' ? 'Админ' : 'Гость'}</span>
                                                    </div>
                                                    <span className="text-xs text-slate-400">{userRole === 'admin' ? 'выйти' : 'войти'}</span>
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
                        {viewMode === 'performance' && <PerformanceView performanceMetrics={performanceMetrics} clearPerformanceMetrics={clearPerformanceMetrics} />}
                        {viewMode === 'plans' && <PlansView />}
                        {viewMode === 'reports' && <ReportsView />}
                        {viewMode === 'production' && <ProductionView />}
                        {viewMode === 'planning' && <PlanningView />}
                        {viewMode === 'raw_data' && <RawDataView />}
                        {viewMode === 'debug' && <DebugView />}
                    </div>
                </>
            )}
        </div>
    );
}

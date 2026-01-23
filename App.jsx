import React, { useEffect } from 'react';
import { LayoutGrid, Grid3X3, Users, FileCheck, Briefcase, Save, AlertCircle, Loader2, FileUp, Activity, FolderOpen } from 'lucide-react';
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

export default function App() {
    const { performanceMetrics, clearPerformanceMetrics } = usePerformanceMetrics();

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
        currentPlanId
    } = useData();

    const activePlanName = savedPlans.find(p => p.id === currentPlanId)?.name;

    // Scroll to target brigade when targetScrollBrigadeId changes
    useEffect(() => {
        if (viewMode === 'dashboard' && selectedDate) {
            // This effect will be handled by DashboardView if needed
        }
    }, [viewMode, selectedDate]);


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
            {step === 'upload' ? (
                <FileUploader />
            ) : (
                <>
                    <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-3 flex-shrink-0">
                        <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-600 text-white p-2 rounded-lg">
                                    <Briefcase size={24} />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-slate-800">Планировщик</h1>
                                    <p className="text-xs text-slate-500 hidden sm:block">План/Факт</p>
                                    {activePlanName && (
                                        <p className="text-[11px] text-slate-400">Активный план: {activePlanName}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 mr-4">
                                    {syncStatus === 'syncing' && (
                                        <div className="text-xs text-blue-500 flex items-center gap-1">
                                            <Loader2 size={12} className="animate-spin" />
                                        </div>
                                    )}
                                    {syncStatus === 'saved' && (
                                        <div className="text-xs text-green-500 flex items-center gap-1" title="Сохранено локально">
                                            <Save size={14} />
                                        </div>
                                    )}
                                    {syncStatus === 'error' && (
                                        <div className="text-xs text-red-500 flex items-center gap-1" title="Ошибка сохранения">
                                            <AlertCircle size={14} />
                                        </div>
                                    )}
                                </div>
                                <div className="bg-slate-100 p-1 rounded-lg flex border border-slate-200">
                                    <button
                                        onClick={() => setViewMode('dashboard')}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                            viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <LayoutGrid size={16} /> Смены
                                    </button>
                                    <button
                                        onClick={() => setViewMode('chess')}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                            viewMode === 'chess' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <Grid3X3 size={16} /> Табель
                                    </button>

                                    {/* Split Employees Menu */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2 gap-1">
                                        <button
                                            onClick={() => setViewMode('employees_list')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                                viewMode === 'employees_list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            <Users size={16} /> Список
                                        </button>
                                        <button
                                            onClick={() => setViewMode('employees_roster')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                                viewMode === 'employees_roster' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            <LayoutGrid size={16} /> Распределение
                                        </button>
                                    </div>

                                    {/* Verification Menu Item */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('verification')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                                viewMode === 'verification' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            <FileCheck size={16} /> Сверка
                                        </button>
                                    </div>

                                    {/* All Employees Menu Item */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('all_employees')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                                viewMode === 'all_employees' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            <Users size={16} /> Все сотрудники
                                        </button>
                                    </div>

                                    {/* Performance Monitoring Menu Item */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('performance')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                                viewMode === 'performance' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            <Activity size={16} /> Мониторинг
                                        </button>
                                    </div>

                                    {/* Plans Menu Item */}
                                    <div className="flex items-center border-l border-slate-300 ml-2 pl-2">
                                        <button
                                            onClick={() => setViewMode('plans')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                                viewMode === 'plans' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            <FolderOpen size={16} /> Планы
                                        </button>
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
                                <div className="h-8 w-px bg-slate-200 mx-2"></div>
                                <button
                                    onClick={handleNewFile}
                                    className="text-sm text-slate-500 hover:text-blue-600 font-medium px-3 py-2 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap flex items-center gap-2"
                                >
                                    <FileUp size={16} />
                                    <span>Новый</span>
                                </button>
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
                    </div>
                </>
            )}
        </div>
    );
}

import React from 'react';
import { useReportsData } from '../../hooks/useReportsData';
import ReportsHeader from './reports/ReportsHeader';
import SkudModal from './reports/SkudModal';
import MasterPlanModal from './reports/MasterPlanModal';
import AllPlansModal from './reports/AllPlansModal';
import ReportsToolbar from './reports/ReportsToolbar';
import ReportsLineDetailContent from './reports/ReportsLineDetailContent';
import ReportsEmployeeAnalysisContent from './reports/ReportsEmployeeAnalysisContent';
import { AlertCircle, Clock, LayoutGrid } from 'lucide-react';

export default function ReportsView() {
    const data = useReportsData();
    const {
        reportType,
        showOnlyDiffs,
        searchQuery, setSearchQuery,
        filterByPlan, setFilterByPlan,
        filterOffPlan, setFilterOffPlan,
        filterRv, setFilterRv,
        filterOvertime, setFilterOvertime,
        showSkudModal, setShowSkudModal,
        showMasterPlanModal, setShowMasterPlanModal,
        showAllPlansModal, setShowAllPlansModal,
        setShowDiagnosticsModal,
        employeeDisplayLimit, setEmployeeDisplayLimit,
        employeeAnalysisWorkerStatus,
        savedPlans, buildPlanSlots, factData, factDates,
        masterPlan,
        filteredLineHierarchy, searchFilteredLineHierarchy,
        filteredEmployeeHierarchy, searchFilteredEmployeeHierarchy,
        employeeDisplayList,
        showFallback, hasPlansForDiff, fallbackText,
        filterRows, getShiftMetrics, buildSummaryFromRows,
        aggregateDateMetrics, aggregateLineMetrics,
        getSkudForWorkerDate, getEmployeeSkudCounts, getEmployeeReportCounts
    } = data;

    return (
        <div className="h-full w-full flex flex-col gap-4">
            <ReportsHeader
                reportType={reportType}
                setReportType={data.setReportType}
                showOnlyDiffs={showOnlyDiffs}
                setShowOnlyDiffs={data.setShowOnlyDiffs}
                onShowSkudModal={() => setShowSkudModal(true)}
                onShowMasterPlanModal={() => setShowMasterPlanModal(true)}
                onShowAllPlansModal={() => setShowAllPlansModal(true)}
                hasMasterPlan={Boolean(masterPlan?.data && buildPlanSlots)}
                hasSavedPlans={Boolean(savedPlans?.length > 0)}
            />
            <SkudModal open={showSkudModal} onClose={() => setShowSkudModal(false)} factDates={factDates} factData={factData} />
            <MasterPlanModal open={showMasterPlanModal} onClose={() => setShowMasterPlanModal(false)} masterPlan={masterPlan} buildPlanSlots={buildPlanSlots} />
            <AllPlansModal open={showAllPlansModal} onClose={() => setShowAllPlansModal(false)} savedPlans={savedPlans} buildPlanSlots={buildPlanSlots} />

            <div className="flex-1 min-h-0 bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
                {reportType === 'employeeAnalysis' && !hasPlansForDiff && (
                    <div className="m-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-700">
                        <AlertCircle size={20} />
                        <p className="text-sm font-medium">
                            Задайте основной и оперативный планы на вкладке «Планы», чтобы сравнение работало.
                        </p>
                    </div>
                )}
                {reportType === 'employeeAnalysis' && factData && employeeAnalysisWorkerStatus.status === 'calculating' && (
                    <div className="m-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 text-indigo-700 text-sm">
                        <Clock size={18} className="animate-pulse" />
                        <span>Идёт расчёт с учётом СКУД…</span>
                    </div>
                )}
                {reportType === 'employeeAnalysis' && factData && employeeAnalysisWorkerStatus.status === 'error' && (
                    <div className="m-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-sm">
                        <AlertCircle size={18} />
                        <span>Ошибка расчёта СКУД: {employeeAnalysisWorkerStatus.error}</span>
                    </div>
                )}

                {showFallback ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                        <div className="bg-slate-50 p-6 rounded-full mb-4">
                            <LayoutGrid size={48} className="opacity-20" />
                        </div>
                        <p className="text-lg font-medium text-slate-600">{fallbackText}</p>
                        <p className="text-sm mt-1 max-w-xs">Попробуйте загрузить данные или изменить параметры фильтрации.</p>
                    </div>
                ) : (
                    <>
                        {hasPlansForDiff && (
                            <ReportsToolbar
                                reportType={reportType}
                                hasPlansForDiff={hasPlansForDiff}
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                onShowDiagnostics={() => setShowDiagnosticsModal(true)}
                                filterByPlan={filterByPlan}
                                setFilterByPlan={setFilterByPlan}
                                filterOffPlan={filterOffPlan}
                                setFilterOffPlan={setFilterOffPlan}
                                filterRv={filterRv}
                                setFilterRv={setFilterRv}
                                filterOvertime={filterOvertime}
                                setFilterOvertime={setFilterOvertime}
                                factData={factData}
                            />
                        )}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {reportType === 'lineDetail' && (
                                <ReportsLineDetailContent
                                    searchQuery={searchQuery}
                                    searchFilteredLineHierarchy={searchFilteredLineHierarchy}
                                    filteredLineHierarchy={filteredLineHierarchy}
                                    showOnlyDiffs={showOnlyDiffs}
                                    filterRows={filterRows}
                                    buildSummaryFromRows={buildSummaryFromRows}
                                    aggregateLineMetrics={aggregateLineMetrics}
                                    aggregateDateMetrics={aggregateDateMetrics}
                                    getShiftMetrics={getShiftMetrics}
                                />
                            )}
                            {reportType === 'employeeAnalysis' && (
                                <ReportsEmployeeAnalysisContent
                                    searchFilteredEmployeeHierarchy={searchFilteredEmployeeHierarchy}
                                    filteredEmployeeHierarchy={filteredEmployeeHierarchy}
                                    employeeDisplayList={employeeDisplayList}
                                    employeeDisplayLimit={employeeDisplayLimit}
                                    setEmployeeDisplayLimit={setEmployeeDisplayLimit}
                                    factData={factData}
                                    getEmployeeReportCounts={getEmployeeReportCounts}
                                    getEmployeeSkudCounts={getEmployeeSkudCounts}
                                    getSkudForWorkerDate={getSkudForWorkerDate}
                                />
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

import React from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { useShiftReportsData } from '../../hooks/useShiftReportsData';
import { TABS } from './shiftReports/shiftReportsViewConstants';
import ShiftReportsHeader from './shiftReports/ShiftReportsHeader';
import ShiftReportsReportsTab from './shiftReports/ShiftReportsReportsTab';
import ShiftReportsDowntimeTab from './shiftReports/ShiftReportsDowntimeTab';

export default function ShiftReportsView() {
    const {
        activeTab,
        setActiveTab,
        activePlan,
        planningState,
        factRows,
        operationalFacts,
        downtimeCatalog,
        downtimeFilterCategoriesSelected,
        downtimeFilterDescription,
        setDowntimeFilterDescription,
        setDowntimeFilterCategoriesSelected,
        downtimeFiltered,
        resetFactField,
        updateFact,
        toggleDowntimeCategory,
        handleReloadInitialPlan,
        hasFacts
    } = useShiftReportsData();

    if (!activePlan) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="text-center space-y-2">
                    <div className="mx-auto h-20 w-20 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                        <AlertCircle size={32} />
                    </div>
                    <p className="text-lg font-semibold text-slate-800">Нет активного плана</p>
                    <p className="text-sm text-slate-500 max-w-sm">
                        Выберите активный план на вкладке «Планы», чтобы увидеть данные графика.
                    </p>
                </div>
            </div>
        );
    }

    if (!planningState || ((planningState.products || []).length === 0 && (planningState.cipBetween || []).length === 0)) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="text-center space-y-2">
                    <div className="mx-auto h-20 w-20 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
                        <Calendar size={32} />
                    </div>
                    <p className="text-lg font-semibold text-slate-800">Нет данных графика</p>
                    <p className="text-sm text-slate-500 max-w-sm">
                        В выбранном плане отсутствуют данные планирования производства.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col gap-4">
            <ShiftReportsHeader
                activePlan={activePlan}
                factRowsCount={factRows.length}
                hasFacts={hasFacts}
                onReloadInitialPlan={handleReloadInitialPlan}
            />

            <div className="flex border-b border-slate-200 bg-white rounded-t-xl overflow-hidden">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
                            activeTab === tab.id
                                ? 'bg-slate-100 text-slate-800 border-b-2 border-slate-800 -mb-px'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'reports' && (
                <ShiftReportsReportsTab
                    factRows={factRows}
                    operationalFacts={operationalFacts}
                    updateFact={updateFact}
                    resetFactField={resetFactField}
                />
            )}
            {activeTab === 'downtime' && (
                <ShiftReportsDowntimeTab
                    downtimeFiltered={downtimeFiltered}
                    downtimeCatalog={downtimeCatalog}
                    downtimeFilterDescription={downtimeFilterDescription}
                    setDowntimeFilterDescription={setDowntimeFilterDescription}
                    downtimeFilterCategoriesSelected={downtimeFilterCategoriesSelected}
                    toggleDowntimeCategory={toggleDowntimeCategory}
                    setDowntimeFilterCategoriesSelected={setDowntimeFilterCategoriesSelected}
                />
            )}
        </div>
    );
}

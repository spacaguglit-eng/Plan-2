import React from 'react';
import { Factory, Loader2, BarChart3 } from 'lucide-react';
import { useProductionData } from '../../hooks/useProductionData';
import ProductionHeader from './production/ProductionHeader';
import ProductionTableTab from './production/ProductionTableTab';
import DowntimeTableTab from './production/DowntimeTableTab';
import ProductionChartsTab from './production/ProductionChartsTab';
import ProductionLinesTab from './production/ProductionLinesTab';
import ProductionReportsTab from './production/ProductionReportsTab';

const ProductionView = () => {
    const data = useProductionData();
    const {
        fileInputRef,
        isParsing,
        parseError,
        filterLine,
        setFilterLine,
        filterDate,
        setFilterDate,
        filterProduct,
        setFilterProduct,
        activeTab,
        setActiveTab,
        reportDates,
        setReportDates,
        reportTargets,
        setReportTargets,
        excludedDowntimeTypes,
        setExcludedDowntimeTypes,
        isDowntimeSelectorOpen,
        setIsDowntimeSelectorOpen,
        downtimeSelectorRef,
        flatRows,
        filteredRows,
        filteredDowntimeRows,
        uniqueLines,
        uniqueDates,
        uniqueDowntimeTypes,
        expandedCharts,
        setExpandedCharts,
        lineSlideIndex,
        setLineSlideIndex,
        isLineSlideVisible,
        lineSlides,
        sortedReportDates,
        reportLineSlides,
        reportError,
        chartData,
        handleFileChange,
        openHtmlReport,
        downloadHtmlReport
    } = data;

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <ProductionHeader
                fileInputRef={fileInputRef}
                handleFileChange={handleFileChange}
                filterProduct={filterProduct}
                setFilterProduct={setFilterProduct}
                filterLine={filterLine}
                setFilterLine={setFilterLine}
                filterDate={filterDate}
                setFilterDate={setFilterDate}
                activeTab={activeTab}
                uniqueLines={uniqueLines}
                uniqueDates={uniqueDates}
                uniqueDowntimeTypes={uniqueDowntimeTypes}
                excludedDowntimeTypes={excludedDowntimeTypes}
                setExcludedDowntimeTypes={setExcludedDowntimeTypes}
                isDowntimeSelectorOpen={isDowntimeSelectorOpen}
                setIsDowntimeSelectorOpen={setIsDowntimeSelectorOpen}
                downtimeSelectorRef={downtimeSelectorRef}
                flatRows={flatRows}
                filteredRows={filteredRows}
            />
            {isParsing && (
                <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                        <Loader2 size={20} className="animate-spin" />
                        Чтение файла…
                    </div>
                </div>
            )}
            {parseError && (
                <div className="mx-6 mt-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
                    {parseError}
                </div>
            )}
            {data.results.length > 0 && !isParsing && (
                <div className="flex-1 overflow-hidden p-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
                        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                            <button
                                onClick={() => setActiveTab('production')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'production' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600'}`}
                            >
                                Производство
                            </button>
                            <button
                                onClick={() => setActiveTab('downtime')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'downtime' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-600'}`}
                            >
                                Простои
                            </button>
                            <button
                                onClick={() => setActiveTab('charts')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'charts' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                            >
                                <BarChart3 size={16} />
                                Графики
                            </button>
                            <button
                                onClick={() => setActiveTab('lines')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'lines' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600'}`}
                            >
                                Линии
                            </button>
                            <button
                                onClick={() => setActiveTab('reports')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'reports' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600'}`}
                            >
                                Отчеты
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {activeTab === 'production' && <ProductionTableTab filteredRows={filteredRows} />}
                            {activeTab === 'downtime' && <DowntimeTableTab filteredDowntimeRows={filteredDowntimeRows} />}
                            {activeTab === 'charts' && <ProductionChartsTab chartData={chartData} expandedCharts={expandedCharts} setExpandedCharts={setExpandedCharts} />}
                            {activeTab === 'lines' && (
                                <ProductionLinesTab
                                    filterDate={filterDate}
                                    lineSlides={lineSlides}
                                    lineSlideIndex={lineSlideIndex}
                                    setLineSlideIndex={setLineSlideIndex}
                                    isLineSlideVisible={isLineSlideVisible}
                                />
                            )}
                            {activeTab === 'reports' && (
                                <ProductionReportsTab
                                    uniqueDates={uniqueDates}
                                    reportDates={reportDates}
                                    setReportDates={setReportDates}
                                    reportLineSlides={reportLineSlides}
                                    reportTargets={reportTargets}
                                    setReportTargets={setReportTargets}
                                    sortedReportDates={sortedReportDates}
                                    reportError={reportError}
                                    openHtmlReport={openHtmlReport}
                                    downloadHtmlReport={downloadHtmlReport}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
            {data.results.length === 0 && !isParsing && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-slate-500">
                        <Factory size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Нет данных</p>
                        <p className="text-sm mt-2">Загрузите Excel файл для просмотра данных</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(ProductionView);

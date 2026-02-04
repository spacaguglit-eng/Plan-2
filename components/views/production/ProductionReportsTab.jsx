import React from 'react';

export default function ProductionReportsTab({
    uniqueDates,
    reportDates,
    setReportDates,
    reportLineSlides,
    reportTargets,
    setReportTargets,
    sortedReportDates,
    reportError,
    openHtmlReport,
    downloadHtmlReport
}) {
    return (
        <div className="p-6 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="space-y-3 mb-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-700">Выбор дат для отчета</div>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setReportDates(uniqueDates)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200" disabled={uniqueDates.length === 0}>
                                Выбрать все
                            </button>
                            <button type="button" onClick={() => setReportDates([])} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200" disabled={reportDates.length === 0}>
                                Сбросить
                            </button>
                        </div>
                    </div>
                    {uniqueDates.length === 0 ? (
                        <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">Нет доступных дат для выбора.</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-auto border border-slate-200 rounded-lg p-3">
                            {uniqueDates.map((date) => (
                                <label key={date} className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={reportDates.includes(date)}
                                        onChange={() => setReportDates((prev) => prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date])}
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>{date}</span>
                                </label>
                            ))}
                        </div>
                    )}
                    {sortedReportDates.length > 0 && <div className="text-xs text-slate-500">Выбрано дат: {sortedReportDates.length}</div>}
                </div>
                <div className="space-y-3 mb-6">
                    <div className="text-sm font-semibold text-slate-700">Цель эффективности (MTD) по линиям</div>
                    {reportLineSlides.length === 0 ? (
                        <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">Выберите даты, чтобы задать цели по линиям.</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {reportLineSlides.map((line) => (
                                <label key={line.line} className="flex items-center gap-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                    <span className="flex-1 font-medium">{line.line}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={reportTargets[line.line] ?? 85}
                                        onChange={(e) => setReportTargets((prev) => ({ ...prev, [line.line]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="w-20 px-2 py-1 border border-slate-300 rounded text-right text-sm"
                                    />
                                    <span className="text-xs text-slate-500">%</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">HTML-отчет</h3>
                        <p className="text-sm text-slate-500 mt-1">Скачайте отчет по эффективности за выбранный период.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={openHtmlReport} disabled={sortedReportDates.length === 0 || reportLineSlides.length === 0} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            Открыть отчет
                        </button>
                        <button onClick={downloadHtmlReport} disabled={sortedReportDates.length === 0 || reportLineSlides.length === 0} className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">
                            Скачать HTML
                        </button>
                    </div>
                </div>
                {sortedReportDates.length === 0 && <div className="mt-4 text-sm text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">Выберите хотя бы одну дату, чтобы сформировать отчет.</div>}
                {sortedReportDates.length > 0 && reportLineSlides.length === 0 && <div className="mt-4 text-sm text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">Нет данных по линиям для выбранного периода.</div>}
                {reportError && <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{reportError}</div>}
            </div>
        </div>
    );
}

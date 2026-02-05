import React from 'react';

export default function ExportModal({
    isOpen,
    onClose,
    lineOptions,
    exportLines,
    toggleExportLine,
    exportType,
    setExportType,
    exportSections,
    onExport
}) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4">
                    <div>
                        <h3 className="text-base font-semibold text-slate-800">Выгрузка отчёта</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Формируйте отчёты по выбранным линиям</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    >
                        Закрыть
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="text-sm text-slate-600">Выберите линии для экспорта</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {lineOptions.map(line => (
                            <label
                                key={line}
                                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 transition-colors"
                            >
                                <input
                                    type="checkbox"
                                    checked={exportLines.includes(line)}
                                    onChange={() => toggleExportLine(line)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span>{line}</span>
                            </label>
                        ))}
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Тип отчета</div>
                        <div className="mt-2 flex flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <input
                                    type="radio"
                                    name="exportType"
                                    value="html"
                                    checked={exportType === 'html'}
                                    onChange={() => setExportType('html')}
                                    className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                />
                                HTML-просмотр
                            </label>
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <input
                                    type="radio"
                                    name="exportType"
                                    value="pdf"
                                    checked={exportType === 'pdf'}
                                    onChange={() => setExportType('pdf')}
                                    className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                />
                                PDF-выгрузка
                            </label>
                        </div>
                    </div>
                    <div className="text-sm text-slate-500">
                        <div>Выбраны линии: {exportLines.length > 0 ? exportLines.join(', ') : 'не выбрано'}</div>
                        <div className="text-xs text-slate-400">
                            {exportSections.length > 0
                                ? `Данные готовы для ${exportSections.length} секций.`
                                : 'Нет позиций для выбранных линий.'}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 bg-slate-50/30">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={onExport}
                        disabled={exportSections.length === 0}
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                            exportSections.length === 0
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700'
                        }`}
                    >
                        {exportType === 'pdf' ? 'Скачать PDF' : 'Открыть HTML'}
                    </button>
                </div>
            </div>
        </div>
    );
}

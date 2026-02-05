import React from 'react';

export default function PlanImportModal({
    isOpen,
    onClose,
    lineOptions,
    selectedPlanLine,
    onSelectedPlanLineChange,
    eventCountByLine,
    pasteText,
    onPasteTextChange,
    planImportError,
    planImportPreview,
    onClearPreview,
    onParsePreview,
    onImport
}) {
    if (!isOpen) return null;
    const canImport = planImportPreview && (planImportPreview.ok.length + (planImportPreview.okNoQty?.length ?? 0)) > 0;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 shrink-0">
                    <h3 className="text-base font-semibold text-slate-800">Импорт в план</h3>
                    <button
                        onClick={() => { onClose(); onClearPreview(); }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    >
                        Закрыть
                    </button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto min-h-0">
                    <p className="text-sm text-slate-600">Вставьте данные из буфера (Ctrl+V). Нажмите «Разобрать», проверьте результат, затем «Импортировать».</p>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-slate-500">Линия</label>
                        <select
                            value={selectedPlanLine}
                            onChange={(e) => onSelectedPlanLineChange(e.target.value)}
                            className="h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        >
                            {lineOptions.map(option => (
                                <option key={option} value={option}>
                                    {option} ({eventCountByLine[option] ?? 0})
                                </option>
                            ))}
                        </select>
                    </div>
                    <textarea
                        value={pasteText}
                        onChange={(e) => { onPasteTextChange(e.target.value); onClearPreview(); }}
                        rows={6}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                        placeholder="Вставьте данные сюда..."
                    />
                    <button
                        type="button"
                        onClick={onParsePreview}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        Разобрать
                    </button>
                    {planImportError && (
                        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{planImportError}</div>
                    )}
                    {planImportPreview && (
                        <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/30 p-4">
                            {planImportPreview.ok.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
                                        Распознано полностью — будет импортировано ({planImportPreview.ok.length})
                                    </h4>
                                    <ul className="max-h-40 overflow-y-auto space-y-1 text-sm text-slate-700 rounded-lg bg-white/80 p-2 border border-slate-200/60">
                                        {planImportPreview.ok.map((item, i) => (
                                            <li key={item.id} className="flex items-baseline gap-2">
                                                <span className="text-slate-400 shrink-0">{i + 1}.</span>
                                                <span>{item.name}</span>
                                                {item.qty && <span className="text-slate-500 text-xs">({item.qty} шт)</span>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {planImportPreview.okNoQty?.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                                        Распознано, но не указано количество ({planImportPreview.okNoQty.length}) — будет импортировано без кол-ва
                                    </h4>
                                    <ul className="max-h-32 overflow-y-auto space-y-1 text-sm text-slate-600 rounded-lg bg-amber-50/50 p-2 border border-amber-200/60">
                                        {planImportPreview.okNoQty.map((item, i) => (
                                            <li key={item.id} className="flex items-baseline gap-2">
                                                <span className="text-amber-600 shrink-0">{i + 1}.</span>
                                                <span>{item.name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {planImportPreview.partial.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                                        Найдено, но не распознано полностью ({planImportPreview.partial.length})
                                    </h4>
                                    <ul className="max-h-32 overflow-y-auto space-y-1 text-sm text-slate-600 rounded-lg bg-amber-50/50 p-2 border border-amber-200/60">
                                        {planImportPreview.partial.map(({ rawLine, lineIndex }, i) => (
                                            <li key={i} className="flex items-baseline gap-2">
                                                <span className="text-amber-600 shrink-0">{lineIndex}.</span>
                                                <span className="break-all">{rawLine || '(пустая строка)'}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 bg-slate-50/30 shrink-0">
                    <button
                        onClick={() => { onClose(); onClearPreview(); }}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={onImport}
                        disabled={!canImport}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                    >
                        Импортировать
                    </button>
                </div>
            </div>
        </div>
    );
}

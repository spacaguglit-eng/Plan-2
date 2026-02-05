import React from 'react';

export default function ProductImportModal({
    isOpen,
    onClose,
    pasteText,
    onPasteTextChange,
    productImportError,
    onImport
}) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4">
                    <h3 className="text-base font-semibold text-slate-800">Импорт в справочник продуктов</h3>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    >
                        Закрыть
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-600">Вставьте данные из буфера (Ctrl+V). Кол-во будет проигнорировано.</p>
                    <textarea
                        value={pasteText}
                        onChange={(e) => onPasteTextChange(e.target.value)}
                        rows={8}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                        placeholder="Вставьте данные сюда..."
                    />
                    {productImportError && (
                        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{productImportError}</div>
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 bg-slate-50/30">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={onImport}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                    >
                        Импортировать
                    </button>
                </div>
            </div>
        </div>
    );
}

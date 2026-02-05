import React from 'react';
import { Package, Plus } from 'lucide-react';

export default function PlanningProductsTab({
    baseProducts,
    productImportError,
    setProductImportError,
    setPasteText,
    setIsProductImportOpen
}) {
    return (
        <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
            <div className="flex items-center justify-between border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                        <Package size={18} strokeWidth={2} />
                    </div>
                    <div>
                        <h2 className="text-sm font-medium text-slate-700">База продуктов</h2>
                        <p className="text-xs text-slate-400">Справочник наименований и объёмов</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { setProductImportError(''); setPasteText(''); setIsProductImportOpen(true); }}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                    >
                        <Plus size={16} />
                        Импорт в справочник
                    </button>
                    <button disabled className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
                        Добавить
                    </button>
                </div>
            </div>
            <div className="p-5">
                {productImportError && (
                    <div className="mb-4 rounded-xl bg-red-50/80 px-4 py-3 text-sm text-red-700">{productImportError}</div>
                )}
                {baseProducts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200/60 bg-slate-50/40 py-12 text-center text-sm text-slate-500">
                        Нет продуктов. Импортируйте данные вставкой или добавьте вручную.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200/40">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-slate-50/70 border-b border-slate-200/50">
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 first:border-l-0">Тип</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Вкус</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Объём</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Бренд</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Кол-во</th>
                                </tr>
                            </thead>
                            <tbody>
                                {baseProducts.map((item) => (
                                    <tr key={item.id} className="border-b border-slate-100/80 bg-white hover:bg-slate-50/40 transition-colors">
                                        <td className="px-3 py-2.5 text-center text-slate-600 border-l border-slate-200/40 first:border-l-0">{item.type || '—'}</td>
                                        <td className="px-3 py-2.5 text-center border-l border-slate-200/40 text-slate-600">{item.flavor || '—'}</td>
                                        <td className="px-3 py-2.5 text-center border-l border-slate-200/40 tabular-nums text-slate-500">{item.volume || '—'}</td>
                                        <td className="px-3 py-2.5 text-center border-l border-slate-200/40 text-slate-500">{item.brand || '—'}</td>
                                        <td className="px-3 py-2.5 text-center border-l border-slate-200/40 tabular-nums font-medium text-slate-600">{item.qty || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

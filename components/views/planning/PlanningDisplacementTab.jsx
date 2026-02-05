import React from 'react';
import { Plus, Replace, Trash2 } from 'lucide-react';

export default function PlanningDisplacementTab({
    displacementRules,
    addDisplacementRule,
    removeDisplacementRule,
    updateDisplacementRule
}) {
    return (
        <section className="overflow-hidden rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40">
            <div className="flex items-center justify-between border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                        <Replace size={18} strokeWidth={2} />
                    </div>
                    <div>
                        <h2 className="text-sm font-medium text-slate-700">Вытеснения</h2>
                        <p className="text-xs text-slate-400">Из → В, исключение. Поиск по вхождению во вкус (например: морковь, морковь, дыня).</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={addDisplacementRule}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 transition-colors"
                >
                    <Plus size={16} />
                    Добавить правило
                </button>
            </div>
            <div className="p-5">
                {displacementRules.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200/60 bg-slate-50/40 py-12 text-center text-sm text-slate-500">
                        Нет правил. Добавьте правило: Из (вкус «откуда»), В (вкус «куда»), Исключение (если во вкусе «куда» есть это — правило не сработает).
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200/40">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-slate-50/70 border-b border-slate-200/50">
                                <tr>
                                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Из</th>
                                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">В</th>
                                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">Исключение</th>
                                    <th className="px-3 py-2.5 w-12 border-l border-slate-200/40" />
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {displacementRules.map((r) => (
                                    <tr key={r.id} className="border-b border-slate-100/80 hover:bg-slate-50/40">
                                        <td className="px-3 py-2.5 border-slate-200/40">
                                            <input
                                                type="text"
                                                value={r.from}
                                                onChange={(e) => updateDisplacementRule(r.id, 'from', e.target.value)}
                                                placeholder="вкус «откуда»"
                                                className="w-full min-w-0 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                            />
                                        </td>
                                        <td className="px-3 py-2.5 border-l border-slate-200/40">
                                            <input
                                                type="text"
                                                value={r.to}
                                                onChange={(e) => updateDisplacementRule(r.id, 'to', e.target.value)}
                                                placeholder="вкус «куда»"
                                                className="w-full min-w-0 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                            />
                                        </td>
                                        <td className="px-3 py-2.5 border-l border-slate-200/40">
                                            <input
                                                type="text"
                                                value={r.exception}
                                                onChange={(e) => updateDisplacementRule(r.id, 'exception', e.target.value)}
                                                placeholder="исключение (подстрока во вкусе «куда»)"
                                                className="w-full min-w-0 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                                            />
                                        </td>
                                        <td className="px-2 py-2.5 text-center border-l border-slate-200/40">
                                            <button
                                                type="button"
                                                onClick={() => removeDisplacementRule(r.id)}
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                title="Удалить"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
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

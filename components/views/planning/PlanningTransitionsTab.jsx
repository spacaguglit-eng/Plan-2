import React from 'react';
import { Plus, GitBranch, ChevronDown, Trash2 } from 'lucide-react';
import { TRANSITION_PAGE_SIZE } from './planningViewConstants';

export default function PlanningTransitionsTab({
    transitionSaveStatus,
    transitionSearchQuery,
    setTransitionSearchQuery,
    handleSaveTransitionBase,
    addTransitionRule,
    transitionPage,
    setTransitionPage,
    transitionTotalPages,
    filteredTransitionRules,
    paginatedTransitionRules,
    activeProductSearchCell,
    setActiveProductSearchCell,
    activeTransitionCell,
    setActiveTransitionCell,
    productSearchQuery,
    setProductSearchQuery,
    baseProducts,
    getTransitionKeyForProduct,
    updateTransitionRule,
    updateTransitionSearch,
    transitionSearch,
    removeTransitionRule,
    transitionRulesLength = 0
}) {
    return (
        <div className="flex flex-col min-h-[calc(100vh-240px)]">
            <div className="-mx-6 rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40 overflow-hidden">
                <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/50 bg-slate-50/40">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                            <GitBranch size={18} strokeWidth={2} />
                        </div>
                        <div>
                            <h2 className="text-sm font-medium text-slate-700">База переходов</h2>
                            <p className="text-xs text-slate-400">CIP-матрица и исключения</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {transitionSaveStatus && (
                            <span className="text-xs text-emerald-600">{transitionSaveStatus}</span>
                        )}
                        <input
                            type="text"
                            value={transitionSearchQuery}
                            onChange={(e) => setTransitionSearchQuery(e.target.value)}
                            className="h-8 w-56 rounded-md border border-slate-200/80 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300"
                            placeholder="Поиск по правилам..."
                        />
                        <button
                            onClick={handleSaveTransitionBase}
                            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200/80 text-slate-600 rounded-md hover:bg-slate-50/80 transition-colors"
                        >
                            Сохранить базу
                        </button>
                        <button
                            onClick={addTransitionRule}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            <Plus size={14} />
                            Добавить правило
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 pt-4 grid grid-cols-1 gap-6">
                <div className="rounded-2xl bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-slate-200/40 overflow-hidden flex flex-col min-h-0">
                    <div className="px-4 py-3 border-b border-slate-200/50 bg-slate-50/40 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-sm font-medium text-slate-700">Матрица переходов</div>
                        {filteredTransitionRules.length > 0 && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="tabular-nums">
                                    {(transitionPage - 1) * TRANSITION_PAGE_SIZE + 1}–{Math.min(transitionPage * TRANSITION_PAGE_SIZE, filteredTransitionRules.length)} из {filteredTransitionRules.length}
                                </span>
                                <button
                                    type="button"
                                    disabled={transitionPage <= 1}
                                    onClick={() => setTransitionPage((p) => Math.max(1, p - 1))}
                                    className="h-7 px-2 rounded border border-slate-200/80 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Назад
                                </button>
                                <span className="tabular-nums">Стр. {transitionPage} из {transitionTotalPages}</span>
                                <button
                                    type="button"
                                    disabled={transitionPage >= transitionTotalPages}
                                    onClick={() => setTransitionPage((p) => Math.min(transitionTotalPages, p + 1))}
                                    className="h-7 px-2 rounded border border-slate-200/80 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Вперёд
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">
                        {filteredTransitionRules.length === 0 ? (
                            <div className="p-6 text-sm text-slate-500">
                                {transitionRulesLength === 0
                                    ? 'Пока нет переходов. Добавьте первое правило.'
                                    : 'Ничего не найдено по фильтру.'}
                            </div>
                        ) : (
                            <table className="w-full text-xs border-collapse table-fixed">
                                <colgroup>
                                    <col className="w-[25%]" />
                                    <col className="w-[23%]" />
                                    <col className="w-[23%]" />
                                    <col className="w-[23%]" />
                                    <col className="w-[6%]" />
                                </colgroup>
                                <thead className="sticky top-0 z-10 bg-slate-50/70 border-b border-slate-200/50">
                                    <tr>
                                        <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 first:border-l-0">Тип + вкус</th>
                                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">CIP 1</th>
                                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">CIP 2</th>
                                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40">CIP 3</th>
                                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider border-l border-slate-200/40 w-[6%]"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedTransitionRules.map((rule) => (
                                        <tr key={rule.id} className="border-b border-slate-100/80 bg-white group">
                                            <td className="px-3 py-2.5 align-middle border-l border-slate-200/40 first:border-l-0">
                                                <div className="relative">
                                                    {activeProductSearchCell === rule.id ? (
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                value={productSearchQuery}
                                                                onChange={(e) => setProductSearchQuery(e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Escape') setActiveProductSearchCell(null); }}
                                                                className="h-8 w-full rounded-lg border border-indigo-400 bg-white px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                                                placeholder="Поиск продукта..."
                                                                autoFocus
                                                            />
                                                            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
                                                                <div className="p-1">
                                                                    {baseProducts
                                                                        .filter((p) => {
                                                                            const label = getTransitionKeyForProduct(p) || p.name;
                                                                            return label.toLowerCase().includes(productSearchQuery.toLowerCase());
                                                                        })
                                                                        .slice(0, 50)
                                                                        .map((p) => {
                                                                            const label = getTransitionKeyForProduct(p) || p.name;
                                                                            return (
                                                                                <button
                                                                                    key={p.id}
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        updateTransitionRule(rule.id, 'productName', label);
                                                                                        setActiveProductSearchCell(null);
                                                                                    }}
                                                                                    className="w-full rounded-lg px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                                                                >
                                                                                    {label}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    {baseProducts.filter((p) => (getTransitionKeyForProduct(p) || p.name).toLowerCase().includes(productSearchQuery.toLowerCase())).length === 0 && (
                                                                        <div className="px-3 py-2 text-[11px] text-slate-400 italic text-center">Ничего не найдено</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setActiveProductSearchCell(rule.id);
                                                                setProductSearchQuery('');
                                                            }}
                                                            className="group flex h-8 w-full items-center justify-between rounded-lg border border-slate-200/80 bg-white px-2 text-left text-[11px] transition-all hover:border-slate-300 hover:bg-slate-50/50"
                                                        >
                                                            <span className={`truncate ${rule.productName ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                                                                {rule.productName || 'Выберите продукт...'}
                                                            </span>
                                                            <ChevronDown size={14} className="ml-1 shrink-0 text-slate-300 transition-colors group-hover:text-slate-400" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            {['cip1', 'cip2', 'cip3'].map((cipKey) => {
                                                const isCellActive = activeTransitionCell?.id === rule.id && activeTransitionCell?.key === cipKey;
                                                const exceptions = String(rule[cipKey] || '').split(',').map((item) => item.trim()).filter(Boolean);
                                                return (
                                                    <td key={cipKey} className="px-3 py-2.5 align-top border-l border-slate-200/40 h-[100px]">
                                                        <div className="h-full flex flex-col gap-2 overflow-hidden">
                                                            <div className="flex items-center justify-between shrink-0">
                                                                <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        name={`base-${rule.id}`}
                                                                        checked={rule.baseCip === cipKey}
                                                                        onChange={() => updateTransitionRule(rule.id, 'baseCip', cipKey)}
                                                                        className="h-3 w-3 text-indigo-600 focus:ring-indigo-500/30"
                                                                    />
                                                                    Базовый
                                                                </label>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setActiveTransitionCell((prev) => (prev?.id === rule.id && prev?.key === cipKey ? null : { id: rule.id, key: cipKey }));
                                                                        updateTransitionSearch(rule.id, cipKey, transitionSearch[rule.id]?.[cipKey] || '');
                                                                    }}
                                                                    className={`h-5 w-5 rounded-full border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 flex items-center justify-center transition-colors ${isCellActive ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : ''}`}
                                                                    title="Добавить исключение"
                                                                >
                                                                    <Plus size={12} strokeWidth={2.5} />
                                                                </button>
                                                            </div>
                                                            <div className="flex-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
                                                                {exceptions.length === 0 && !isCellActive ? (
                                                                    <span className="text-[10px] text-slate-300 italic">Нет исключений</span>
                                                                ) : (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {exceptions.map((name) => (
                                                                            <span
                                                                                key={`${rule.id}_${cipKey}_${name}`}
                                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] border border-slate-200/50 max-w-full"
                                                                                title={name}
                                                                            >
                                                                                <span className="truncate">{name}</span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        const next = exceptions.filter((item) => item !== name);
                                                                                        updateTransitionRule(rule.id, cipKey, next.join(', '));
                                                                                    }}
                                                                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                                                                >
                                                                                    <Plus size={10} className="rotate-45" />
                                                                                </button>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {isCellActive && (
                                                                <div className="shrink-0 mt-auto pt-2 bg-white">
                                                                    <div className="relative">
                                                                        <input
                                                                            type="text"
                                                                            value={transitionSearch[rule.id]?.[cipKey] || ''}
                                                                            onChange={(e) => updateTransitionSearch(rule.id, cipKey, e.target.value)}
                                                                            className="h-7 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                                                            placeholder="Поиск..."
                                                                            autoFocus
                                                                        />
                                                                        {transitionSearch[rule.id]?.[cipKey] && (
                                                                            <div className="absolute bottom-full left-0 right-0 mb-1 z-20 max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                                                                                {baseProducts
                                                                                    .filter((product) =>
                                                                                                        (getTransitionKeyForProduct(product) || '')
                                                                                                            .toLowerCase()
                                                                                                            .includes((transitionSearch[rule.id]?.[cipKey] || '').toLowerCase())
                                                                                    )
                                                                                    .slice(0, 50)
                                                                                    .map((product) => (
                                                                                        <button
                                                                                            key={`${rule.id}_${cipKey}_${product.id}`}
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                const current = exceptions;
                                                                                                const label = getTransitionKeyForProduct(product);
                                                                                                if (label && !current.includes(label)) {
                                                                                                    updateTransitionRule(rule.id, cipKey, [...current, label].join(', '));
                                                                                                }
                                                                                            }}
                                                                                            className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-slate-50 text-slate-700"
                                                                                        >
                                                                                            {getTransitionKeyForProduct(product) || product.name}
                                                                                        </button>
                                                                                    ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td className="px-2 py-2.5 text-center align-middle border-l border-slate-200/40">
                                                <button
                                                    type="button"
                                                    onClick={() => removeTransitionRule(rule.id)}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                                                    title="Удалить правило"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

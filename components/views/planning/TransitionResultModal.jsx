import React from 'react';

export default function TransitionResultModal({
    isOpen,
    onClose,
    transitionStatus,
    transitionProgress,
    transitionProgressNodes,
    transitionError,
    transitionResult,
    transitionAnalytics,
    onApply,
    onStop
}) {
    if (!isOpen) return null;
    const rows = (transitionResult?.transitionRows?.length)
        ? transitionResult.transitionRows
        : transitionAnalytics?.now?.rows ?? [];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
            <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80 my-auto">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 shrink-0">
                    <h3 className="text-base font-semibold text-slate-800">Предложенная последовательность</h3>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    >
                        Закрыть
                    </button>
                </div>
                <div className="p-6 space-y-4 text-sm text-slate-700 overflow-y-auto min-h-0">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        Статус: {transitionStatus === 'running' ? 'выполняется' : transitionStatus === 'done' ? 'готово' : 'ожидание'}
                        {transitionStatus === 'running' && (
                            <div className="mt-2 space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                    <span>Прогресс</span>
                                    {transitionProgressNodes !== null
                                        ? <span>Узлов: {transitionProgressNodes}</span>
                                        : <span>{Math.round(transitionProgress * 100)}%</span>}
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-slate-200">
                                    <div
                                        className="h-full rounded-full bg-blue-500 transition-all"
                                        style={{ width: `${Math.min(100, Math.max(0, transitionProgress * 100))}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    {transitionError && (
                        <div className="text-xs text-red-600">{transitionError}</div>
                    )}
                    {transitionStatus === 'done' && (
                        transitionResult?.feasible === false ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                Не найден допустимый порядок: не для всех переходов заданы правила в матрице. Заполните правила в таблице «Переходы» и повторите оптимизацию.
                            </div>
                        ) : transitionResult?.order?.length > 0 ? (
                            <div className="space-y-4">
                                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                    <div className="text-xs text-slate-500">Время</div>
                                    <div className="mt-1 text-sm">
                                        Было: {(transitionResult?.baselineCost != null ? transitionResult.baselineCost : transitionAnalytics?.was?.total)} мин
                                        {transitionAnalytics?.was?.missingRules > 0 && (
                                            <span className="text-xs text-slate-500">
                                                {' '}({transitionAnalytics.was.missingRules} без правил)
                                            </span>
                                        )}
                                        {transitionAnalytics?.was?.missingDurations > 0 && (
                                            <span className="text-xs text-slate-500">
                                                {' '}({transitionAnalytics.was.missingDurations} без норм)
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm">
                                        Стало: {(transitionResult?.totalCost != null ? transitionResult.totalCost : transitionAnalytics?.now?.total)} мин
                                        {transitionAnalytics?.now?.missingRules > 0 && (
                                            <span className="text-xs text-slate-500">
                                                {' '}({transitionAnalytics.now.missingRules} без правил)
                                            </span>
                                        )}
                                        {transitionAnalytics?.now?.missingDurations > 0 && (
                                            <span className="text-xs text-slate-500">
                                                {' '}({transitionAnalytics.now.missingDurations} без норм)
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                        Переходы которые стали
                                    </div>
                                    <ol className="mt-2 space-y-1">
                                        {rows.map((row, idx) => {
                                            const cipLabel = row.cipKey === 'perenaladka' ? 'Переналадка' : row.cipKey === 'smenaAssortimenta' ? 'Смена ассортимента' : row.cipKey === 'vytesnenie' ? 'Вытеснение' : row.cipKey ? row.cipKey.toUpperCase() : 'НЕТ ПРАВИЛ';
                                            return (
                                                <li key={`${row.from}_${row.to}_${idx}`} className="text-sm">
                                                    {idx + 1}. {row.from} → {row.to} — {cipLabel} (
                                                    {row.duration === null || row.duration === undefined ? '—' : `${row.duration} мин`}
                                                    )
                                                </li>
                                            );
                                        })}
                                    </ol>
                                    {!transitionResult?.transitionRows && transitionAnalytics?.now?.missingDurations > 0 && (
                                        <div className="mt-2 text-xs text-slate-500">
                                            Для точного времени заполните нормы CIP в таблице «CIP».
                                        </div>
                                    )}
                                    {!transitionResult?.transitionRows && transitionAnalytics?.now?.missingRules > 0 && (
                                        <div className="mt-1 text-xs text-slate-500">
                                            В базе переходов нет правил для некоторых продуктов.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div>Нет данных для расчета.</div>
                        )
                    )}
                </div>
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                    {transitionStatus === 'done' && (transitionResult?.order?.length > 0 || transitionResult?.orderIndices?.length > 0) && transitionResult?.feasible !== false && (
                        <button
                            onClick={() => onApply(transitionResult.orderIndices ?? transitionResult.order)}
                            className="px-4 py-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                            Применить
                        </button>
                    )}
                    {transitionStatus === 'running' && (
                        <button
                            onClick={onStop}
                            className="px-4 py-2 text-sm font-semibold text-red-600 hover:text-red-700"
                        >
                            Остановить
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
}

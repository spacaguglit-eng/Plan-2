import React from 'react';
import { BarChart3, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { getCategoryColor } from '../productionViewUtils';

function ChartRow({ item, keyField, keyLabel, expandedSet, onToggle, getCategoryColor }) {
    const keyVal = item[keyField];
    const efficiencyPercent = Math.min(item.efficiency, 100);
    const isOverPlan = item.fact >= item.plan;
    const isGreen = item.efficiency >= 95;
    const isExpanded = expandedSet.has(keyVal);
    let leftOffset = efficiencyPercent;
    return (
        <div className="space-y-2 border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button type="button" onClick={() => onToggle(keyVal)} className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0">
                        {isExpanded ? <ChevronDown size={16} className="text-slate-600" /> : <ChevronRight size={16} className="text-slate-600" />}
                    </button>
                    <span className="font-medium text-slate-700 truncate">{keyLabel}</span>
                </div>
                <div className="flex items-center gap-4 text-xs flex-shrink-0">
                    <span className="text-blue-600">План: {item.plan.toLocaleString()}</span>
                    <span className={`font-semibold ${isOverPlan ? 'text-green-600' : 'text-orange-600'}`}>Факт: {item.fact.toLocaleString()}</span>
                    <span className={`font-semibold ${isGreen ? 'text-green-600' : item.efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>{item.efficiency}%</span>
                </div>
            </div>
            <div className="relative h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                <div
                    className={`absolute left-0 top-0 h-full rounded-lg transition-all duration-500 ${isGreen || isOverPlan ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-orange-400 to-orange-500'}`}
                    style={{ width: `${efficiencyPercent}%` }}
                />
                {item.downtimeCategories?.map((downtime, dIdx) => {
                    const maxAvailable = 100 - efficiencyPercent;
                    const usedSoFar = leftOffset - efficiencyPercent;
                    const width = Math.min(downtime.percent, maxAvailable - usedSoFar);
                    const currentLeft = leftOffset;
                    if (width <= 0) return null;
                    leftOffset += width;
                    return (
                        <div
                            key={dIdx}
                            className={`absolute top-0 h-full ${getCategoryColor(downtime.category)} transition-all duration-500 border-r border-slate-300`}
                            style={{ left: `${currentLeft}%`, width: `${width}%` }}
                            title={`${downtime.category}: ${downtime.minutes || 0} мин (${downtime.percent.toFixed(1)}%)`}
                        />
                    );
                })}
            </div>
            {isExpanded && (
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <div><span className="text-slate-500">Количество записей: </span><span className="font-semibold text-slate-700">{item.count}</span></div>
                        <div>
                            <span className="text-slate-500">Эффективность: </span>
                            <span className={`font-semibold ${isGreen ? 'text-green-600' : item.efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>{item.efficiency}%</span>
                        </div>
                    </div>
                    {item.downtimeCategories?.length > 0 && (
                        <div className="mt-2">
                            <div className="text-xs font-semibold text-slate-700 mb-2">Детализация простоев:</div>
                            <div className="space-y-2">
                                {item.downtimeCategories.map((downtime, dIdx) => (
                                    <div key={dIdx} className="bg-slate-50 p-3 rounded border border-slate-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded ${getCategoryColor(downtime.category)}`} />
                                                <span className="text-sm font-semibold text-slate-700">{downtime.category}</span>
                                            </div>
                                            <span className="text-sm font-semibold text-slate-600">{downtime.minutes || 0} мин · {downtime.percent.toFixed(2)}%</span>
                                        </div>
                                        {downtime.descriptions?.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {downtime.descriptions.map((desc, descIdx) => (
                                                    <div key={descIdx} className="text-xs text-slate-600 pl-5">• {desc}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ProductionChartsTab({ chartData, expandedCharts, setExpandedCharts }) {
    if (!chartData?.byDate?.length) {
        return (
            <div className="p-6">
                <div className="text-center py-12 text-slate-400">
                    <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Нет данных для графиков</p>
                    <p className="text-sm mt-2">Загрузите Excel файл для просмотра графиков</p>
                </div>
            </div>
        );
    }
    const toggleDate = (date) => {
        const next = new Set(expandedCharts.byDate);
        if (next.has(date)) next.delete(date); else next.add(date);
        setExpandedCharts({ ...expandedCharts, byDate: next });
    };
    const toggleLine = (line) => {
        const next = new Set(expandedCharts.byLine);
        if (next.has(line)) next.delete(line); else next.add(line);
        setExpandedCharts({ ...expandedCharts, byLine: next });
    };
    const toggleProduct = (product) => {
        const next = new Set(expandedCharts.byProduct);
        if (next.has(product)) next.delete(product); else next.add(product);
        setExpandedCharts({ ...expandedCharts, byProduct: next });
    };
    return (
        <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-700">Общий план</span>
                        <TrendingUp size={20} className="text-blue-600" />
                    </div>
                    <div className="text-3xl font-bold text-blue-900">{chartData.byDate.reduce((s, d) => s + d.plan, 0).toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-green-700">Общий факт</span>
                        <TrendingUp size={20} className="text-green-600" />
                    </div>
                    <div className="text-3xl font-bold text-green-900">{chartData.byDate.reduce((s, d) => s + d.fact, 0).toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-purple-700">Средняя эффективность</span>
                        <BarChart3 size={20} className="text-purple-600" />
                    </div>
                    <div className="text-3xl font-bold text-purple-900">
                        {chartData.byDate.length > 0 ? Math.round(chartData.byDate.reduce((s, d) => s + d.efficiency, 0) / chartData.byDate.length) : 0}%
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-600" /> Выработка по датам
                </h3>
                <div className="space-y-4">
                    {chartData.byDate.map((item, idx) => (
                        <ChartRow key={idx} item={item} keyField="date" keyLabel={item.date} expandedSet={expandedCharts.byDate} onToggle={toggleDate} getCategoryColor={getCategoryColor} />
                    ))}
                </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-600" /> Выработка по линиям
                </h3>
                <div className="space-y-4">
                    {chartData.byLine.map((item, idx) => (
                        <ChartRow key={idx} item={item} keyField="line" keyLabel={item.line} expandedSet={expandedCharts.byLine} onToggle={toggleLine} getCategoryColor={getCategoryColor} />
                    ))}
                </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-600" /> Выработка по продуктам (Топ 15)
                </h3>
                <div className="space-y-4">
                    {chartData.byProduct.map((item, idx) => (
                        <ChartRow key={idx} item={item} keyField="product" keyLabel={item.product} expandedSet={expandedCharts.byProduct} onToggle={toggleProduct} getCategoryColor={getCategoryColor} />
                    ))}
                </div>
            </div>
        </div>
    );
}

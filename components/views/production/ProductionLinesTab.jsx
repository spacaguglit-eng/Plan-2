import React from 'react';
import { BarChart3 } from 'lucide-react';
import { buildConicGradient } from '../productionViewUtils';

export default function ProductionLinesTab({
    filterDate,
    lineSlides,
    lineSlideIndex,
    setLineSlideIndex,
    isLineSlideVisible
}) {
    if (!filterDate) {
        return (
            <div className="p-6">
                <div className="text-center py-12 text-slate-400">
                    <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Выберите дату</p>
                    <p className="text-sm mt-2">Для просмотра линий выберите дату в фильтре</p>
                </div>
            </div>
        );
    }
    if (lineSlides.length === 0) {
        return (
            <div className="p-6">
                <div className="text-center py-12 text-slate-400">
                    <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Нет линий на выбранную дату</p>
                </div>
            </div>
        );
    }
    const slide = lineSlides[lineSlideIndex];
    const efficiencyPercent = slide?.plan > 0 ? Math.min(100, (slide.fact / slide.plan) * 100) : 0;
    const isGreen = efficiencyPercent >= 95;
    const totalDowntimePercent = (slide?.segments || []).reduce((s, seg) => s + seg.percent, 0);
    const maxDowntimePercent = Math.max(0, 100 - efficiencyPercent);
    const scale = totalDowntimePercent > maxDowntimePercent && totalDowntimePercent > 0 ? maxDowntimePercent / totalDowntimePercent : 1;
    let leftOffset = efficiencyPercent;
    return (
        <div className="p-6 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Линия: {slide?.line}</h3>
                        <div className="text-xs text-slate-500">Дата: {filterDate}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setLineSlideIndex((p) => Math.max(0, p - 1))}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                            disabled={lineSlideIndex === 0}
                        >
                            Назад
                        </button>
                        <div className="text-sm text-slate-500">{lineSlideIndex + 1} / {lineSlides.length}</div>
                        <button
                            onClick={() => setLineSlideIndex((p) => Math.min(lineSlides.length - 1, p + 1))}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                            disabled={lineSlideIndex >= lineSlides.length - 1}
                        >
                            Вперёд
                        </button>
                    </div>
                </div>
                <div className={`transition-opacity duration-500 ease-out ${isLineSlideVisible ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-8">
                        <div className="flex flex-col items-center">
                            <div className="relative h-96 w-96">
                                <div
                                    key={`pie-${lineSlideIndex}-${filterDate}`}
                                    className="h-96 w-96 rounded-full border border-slate-200 shadow-sm"
                                    style={{ background: buildConicGradient(slide?.segments || []), animation: 'pieGrow 1.2s ease-out' }}
                                />
                            </div>
                            <div className="mt-4 text-lg font-medium text-slate-600">Простои по категориям (мин)</div>
                            <div className="mt-6 w-full max-w-md">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 text-center shadow-sm">
                                        <div className="text-xs font-medium text-blue-600 mb-1">План</div>
                                        <div className="text-2xl font-bold text-blue-700">{slide?.plan?.toLocaleString() || 0}</div>
                                    </div>
                                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4 text-center shadow-sm">
                                        <div className="text-xs font-medium text-purple-600 mb-1">Факт</div>
                                        <div className="text-2xl font-bold text-purple-700">{slide?.fact?.toLocaleString() || 0}</div>
                                    </div>
                                    <div className={`bg-gradient-to-br border rounded-xl p-4 text-center shadow-sm ${
                                        (slide?.efficiency || 0) >= 95 ? 'from-green-50 to-green-100 border-green-200' :
                                        (slide?.efficiency || 0) >= 80 ? 'from-yellow-50 to-yellow-100 border-yellow-200' : 'from-red-50 to-red-100 border-red-200'
                                    }`}>
                                        <div className={`text-xs font-medium mb-1 ${
                                            (slide?.efficiency || 0) >= 95 ? 'text-green-600' : (slide?.efficiency || 0) >= 80 ? 'text-yellow-600' : 'text-red-600'
                                        }`}>Эффективность</div>
                                        <div className={`text-2xl font-bold ${
                                            (slide?.efficiency || 0) >= 95 ? 'text-green-700' : (slide?.efficiency || 0) >= 80 ? 'text-yellow-700' : 'text-red-700'
                                        }`}>{slide?.efficiency || 0}%</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div>
                            {slide?.downtimeList?.length ? (
                                <div className="space-y-3">
                                    {slide.downtimeList.slice(0, 6).map((item) => (
                                        <div key={item.category} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                                            <div className="flex items-center justify-between text-lg">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
                                                    <span className="text-slate-700 font-semibold">{item.category}</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="font-semibold text-slate-600 text-lg">{item.minutes} мин</span>
                                                    <span className="text-base text-slate-500 mt-0.5">{item.underproduction?.toLocaleString() || 0} шт</span>
                                                </div>
                                            </div>
                                            {item.descriptions?.length ? (
                                                <div className="mt-2 text-base text-slate-600">
                                                    {item.descriptions.slice(0, 2).map((desc, idx) => (
                                                        <div key={`${item.category}_${idx}`} className="truncate">• {desc}</div>
                                                    ))}
                                                    {item.descriptions.length > 2 && <div className="text-sm text-slate-400">и еще {item.descriptions.length - 2}</div>}
                                                </div>
                                            ) : (
                                                <div className="mt-2 text-base text-slate-400">Описание отсутствует</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-base text-slate-400">Нет простоев</div>
                            )}
                        </div>
                    </div>
                    <div className="mt-8">
                        <div className="relative h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                            <div
                                className={`absolute left-0 top-0 h-full rounded-lg transition-all duration-500 ${isGreen ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-orange-400 to-orange-500'}`}
                                style={{ width: `${efficiencyPercent}%` }}
                            />
                            {(slide?.segments || []).map((seg, idx) => {
                                const width = Math.min(seg.percent * scale, 100 - leftOffset);
                                const currentLeft = leftOffset;
                                if (width <= 0) return null;
                                leftOffset += width;
                                return (
                                    <div
                                        key={`${seg.category}_${idx}`}
                                        className="absolute top-0 h-full border-r border-slate-300 transition-all duration-500"
                                        style={{ left: `${currentLeft}%`, width: `${width}%`, backgroundColor: seg.color }}
                                        title={`${seg.category}: ${seg.minutes} мин (${seg.percent.toFixed(1)}%)`}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

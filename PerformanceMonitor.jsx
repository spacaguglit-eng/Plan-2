import React, { useEffect, useRef } from 'react';
import { Activity, TrendingUp, TrendingDown, Zap, Clock, Eye, RefreshCw, Trash2 } from 'lucide-react';

// Hook для измерения времени рендера компонента
export const useRenderTime = (componentName, onRenderComplete, isVisible = true) => {
    const startTimeRef = useRef(Date.now());
    const renderCountRef = useRef(0);
    const mountTimeRef = useRef(Date.now());
    
    renderCountRef.current++;
    
    useEffect(() => {
        const renderTime = Date.now() - startTimeRef.current;
        const timeSinceMount = Date.now() - mountTimeRef.current;

        // В текущей схеме вкладки размонтируются и монтируются заново при переключении.
        // Поэтому «переключение вкладки» = первый commit после mount (когда компонент видим).
        // timeSinceMount оставляем как дополнительную страховку от редких повторных монтирований.
        const isTabSwitch = isVisible && renderCountRef.current === 1 && timeSinceMount < 1000;
        
        if (isVisible && onRenderComplete) {
            onRenderComplete({
                componentName,
                renderTime,
                renderCount: renderCountRef.current,
                timestamp: Date.now(),
                isTabSwitch,
                isVisible
            });
        }
        startTimeRef.current = Date.now();
    });
    
    return { renderCount: renderCountRef.current };
};

// Компонент для отображения метрик производительности
export const PerformanceView = ({ performanceMetrics, clearPerformanceMetrics }) => {
    const getAverageTime = (metrics) => {
        if (!metrics || metrics.length === 0) return 0;
        const sum = metrics.reduce((acc, m) => acc + m.renderTime, 0);
        return (sum / metrics.length).toFixed(2);
    };

    const getMaxTime = (metrics) => {
        if (!metrics || metrics.length === 0) return 0;
        return Math.max(...metrics.map(m => m.renderTime)).toFixed(2);
    };

    const getMinTime = (metrics) => {
        if (!metrics || metrics.length === 0) return 0;
        return Math.min(...metrics.map(m => m.renderTime)).toFixed(2);
    };

    const getLastRenderTime = (metrics) => {
        if (!metrics || metrics.length === 0) return 0;
        return metrics[metrics.length - 1].renderTime.toFixed(2);
    };

    const getRenderCount = (metrics) => {
        return metrics ? metrics.length : 0;
    };

    const getTabSwitchCount = (metrics) => {
        if (!metrics || metrics.length === 0) return 0;
        return metrics.filter(m => m.isTabSwitch).length;
    };

    const getAverageTabSwitchTime = (metrics) => {
        if (!metrics || metrics.length === 0) return 0;
        const tabSwitches = metrics.filter(m => m.isTabSwitch);
        if (tabSwitches.length === 0) return 0;
        const sum = tabSwitches.reduce((acc, m) => acc + m.renderTime, 0);
        return (sum / tabSwitches.length).toFixed(2);
    };

    const getTotalRenderCount = (metrics) => {
        if (!metrics || metrics.length === 0) return 0;
        return metrics[metrics.length - 1]?.renderCount || metrics.length;
    };

    const getRecentActivity = (metrics) => {
        if (!metrics || metrics.length === 0) return 'Нет данных';
        const lastMetric = metrics[metrics.length - 1];
        const timeSince = Date.now() - lastMetric.timestamp;
        if (timeSince < 5000) return 'Только что';
        if (timeSince < 60000) return `${Math.floor(timeSince / 1000)} сек назад`;
        return `${Math.floor(timeSince / 60000)} мин назад`;
    };

    const getPerformanceColor = (time) => {
        if (time < 50) return 'text-green-600';
        if (time < 200) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getPerformanceIcon = (time) => {
        if (time < 50) return <TrendingUp className="text-green-600" size={20} />;
        if (time < 200) return <Activity className="text-yellow-600" size={20} />;
        return <TrendingDown className="text-red-600" size={20} />;
    };

    const tabs = [
        { key: 'dashboard', label: 'Смены' },
        { key: 'chess', label: 'Табель' },
        { key: 'employees_list', label: 'Список сотрудников' },
        { key: 'employees_roster', label: 'Распределение' },
        { key: 'all_employees', label: 'Все сотрудники' },
        { key: 'verification', label: 'Сверка' }
    ];

    return (
        <div className="h-full overflow-y-auto space-y-6 pb-8">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-purple-100 p-3 rounded-lg">
                        <Zap className="text-purple-600" size={24} />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-slate-800">Мониторинг производительности</h2>
                        <p className="text-slate-500 text-sm">Анализ скорости рендеринга вкладок приложения</p>
                    </div>
                    {clearPerformanceMetrics && (
                        <button
                            onClick={() => {
                                if (confirm('Очистить все метрики производительности?')) {
                                    clearPerformanceMetrics();
                                }
                            }}
                            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200 flex items-center gap-2"
                        >
                            <Trash2 size={16} />
                            Очистить метрики
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {tabs.map(tab => {
                        const metrics = performanceMetrics[tab.key] || [];
                        const avgTime = parseFloat(getAverageTime(metrics));
                        const lastTime = parseFloat(getLastRenderTime(metrics));
                        const maxTime = parseFloat(getMaxTime(metrics));
                        const minTime = parseFloat(getMinTime(metrics));
                        const renderCount = getRenderCount(metrics);

                        return (
                            <div
                                key={tab.key}
                                className="bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        {getPerformanceIcon(avgTime)}
                                        <div>
                                            <h3 className="font-semibold text-lg text-slate-800">{tab.label}</h3>
                                            <p className="text-xs text-slate-500">{renderCount} рендеров</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-2xl font-bold ${getPerformanceColor(lastTime)}`}>
                                            {lastTime} мс
                                        </div>
                                        <p className="text-xs text-slate-500">последний рендер</p>
                                    </div>
                                </div>

                                {renderCount > 0 ? (
                                    <div className="grid grid-cols-4 gap-4 pt-4 border-t border-slate-200">
                                        <div className="text-center">
                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                <Clock size={14} className="text-slate-400" />
                                                <p className="text-xs text-slate-500 font-medium">Средний</p>
                                            </div>
                                            <p className={`text-lg font-semibold ${getPerformanceColor(avgTime)}`}>
                                                {avgTime} мс
                                            </p>
                                        </div>
                                        <div className="text-center">
                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                <Eye size={14} className="text-purple-500" />
                                                <p className="text-xs text-slate-500 font-medium">Переключений</p>
                                            </div>
                                            <p className="text-lg font-semibold text-purple-600">
                                                {getTabSwitchCount(metrics)}
                                            </p>
                                            {getTabSwitchCount(metrics) > 0 && (
                                                <p className="text-[10px] text-slate-400">
                                                    ~{getAverageTabSwitchTime(metrics)} мс
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                <RefreshCw size={14} className="text-blue-500" />
                                                <p className="text-xs text-slate-500 font-medium">Всего рендеров</p>
                                            </div>
                                            <p className="text-lg font-semibold text-blue-600">
                                                {getTotalRenderCount(metrics)}
                                            </p>
                                        </div>
                                        <div className="text-center">
                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                <Activity size={14} className="text-slate-400" />
                                                <p className="text-xs text-slate-500 font-medium">Активность</p>
                                            </div>
                                            <p className="text-xs font-medium text-slate-600">
                                                {getRecentActivity(metrics)}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="pt-4 border-t border-slate-200 text-center">
                                        <p className="text-slate-400 text-sm">Нет данных о рендере</p>
                                    </div>
                                )}

                                {/* График последних рендеров */}
                                {metrics.length > 1 && (
                                    <div className="mt-4 pt-4 border-t border-slate-200">
                                        <p className="text-xs text-slate-500 mb-2 font-medium">История рендеров (последние {Math.min(20, metrics.length)})</p>
                                        <div className="flex items-end gap-1 h-16">
                                            {metrics.slice(-20).map((metric, idx) => {
                                                const maxTimeNum = parseFloat(maxTime) || 1;
                                                const height = Math.min((metric.renderTime / maxTimeNum) * 100, 100);
                                                const color = metric.renderTime < 50
                                                    ? 'bg-green-400'
                                                    : metric.renderTime < 200
                                                    ? 'bg-yellow-400'
                                                    : 'bg-red-400';
                                                
                                                // Специальная подсветка для смены вкладок
                                                const isTabSwitch = metric.isTabSwitch;
                                                const borderClass = isTabSwitch ? 'ring-2 ring-purple-500' : '';

                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`flex-1 ${color} rounded-t transition-all hover:opacity-70 ${borderClass}`}
                                                        style={{ height: `${height}%` }}
                                                        title={`Рендер ${metric.renderCount || idx + 1}: ${metric.renderTime.toFixed(2)} мс${isTabSwitch ? ' (смена вкладки)' : ''}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg">
                            <Activity className="text-blue-600" size={20} />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-slate-800 mb-2">Рекомендации по оптимизации</h4>
                            <ul className="text-sm text-slate-600 space-y-1">
                                <li>• <strong className="text-green-600">&lt; 50 мс</strong> - отличная производительность</li>
                                <li>• <strong className="text-yellow-600">50-200 мс</strong> - приемлемая производительность</li>
                                <li>• <strong className="text-red-600">&gt; 200 мс</strong> - требуется оптимизация (мемоизация, виртуализация)</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PerformanceView;

import React, { useMemo } from 'react';
import { Calendar, Filter, Search, Download, X, Plus, CheckCircle2, XCircle, Clock, AlertTriangle, GraduationCap, ChevronDown } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';

const TimesheetView = () => {
    const {
        calculateChessTable,
        chessFilterShift,
        setChessFilterShift,
        chessSearch,
        setChessSearch,
        chessDisplayLimit,
        setChessDisplayLimit,
        exportChessTableToExcel,
        workerRegistry,
        selectedDate,
        setSelectedDate,
        setViewMode,
        setTargetScrollBrigadeId,
        factData,
        viewMode
    } = useData();

    useRenderTime('chess', logPerformanceMetric, viewMode === 'chess');

    const chessTableData = useMemo(() => {
        const tableData = calculateChessTable();
        if (!tableData) return { dates: [], workers: [], filteredWorkers: [] };
        
        const dates = Array.isArray(tableData.dates) ? tableData.dates : [];
        const workers = Array.isArray(tableData.workers) ? tableData.workers : [];
        
        const filteredWorkers = workers.filter(w => {
            if (!w || !w.name) return false;
            if (chessSearch && !w.name.toLowerCase().includes(chessSearch.toLowerCase())) return false;
            if (chessFilterShift !== 'all') {
                if (chessFilterShift === 'floaters') return w.category && w.category.startsWith('floater');
                return w.homeBrigades && w.homeBrigades.has && w.homeBrigades.has(chessFilterShift);
            }
            return true;
        });
        
        return { dates, workers, filteredWorkers };
    }, [calculateChessTable, chessSearch, chessFilterShift]);

    const exportToJSON = () => {
        const tableData = calculateChessTable();
        if (!tableData) {
            alert('Нет данных для экспорта');
            return;
        }

        const { dates, workers } = tableData;
        const filteredWorkers = workers.filter(w => {
            if (chessSearch && !w.name.toLowerCase().includes(chessSearch.toLowerCase())) return false;
            if (chessFilterShift !== 'all') {
                if (chessFilterShift === 'floaters') return w.category.startsWith('floater');
                return w.homeBrigades.has(chessFilterShift);
            }
            return true;
        });

        const exportData = {
            exportDate: new Date().toISOString(),
            dates: dates,
            workers: filteredWorkers.map(worker => ({
                name: worker.name,
                brigades: Array.from(worker.homeBrigades),
                role: worker.role,
                cells: dates.reduce((acc, date) => {
                    const cell = worker.cells[date] || { text: '', color: 'bg-white', verificationStatus: null };
                    acc[date] = {
                        text: cell.text || '',
                        verificationStatus: cell.verificationStatus
                    };
                    return acc;
                }, {})
            }))
        };

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const filterSuffix = chessFilterShift !== 'all' ? `_${chessFilterShift === 'floaters' ? 'Резерв' : `Бригада${chessFilterShift}`}` : '';
        link.download = `Табель_${dateStr}${filterSuffix}.json`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    };

    const exportToCSV = () => {
        const tableData = calculateChessTable();
        if (!tableData) {
            alert('Нет данных для экспорта');
            return;
        }

        const { dates, workers } = tableData;
        const filteredWorkers = workers.filter(w => {
            if (chessSearch && !w.name.toLowerCase().includes(chessSearch.toLowerCase())) return false;
            if (chessFilterShift !== 'all') {
                if (chessFilterShift === 'floaters') return w.category.startsWith('floater');
                return w.homeBrigades.has(chessFilterShift);
            }
            return true;
        });

        // Функция для экранирования CSV значений
        const escapeCSV = (value) => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        // Создаем CSV строку
        const csvRows = [];

        // Заголовки
        const headerRow = ['ФИО Сотрудника', 'Бригада', 'Должность', ...dates];
        csvRows.push(headerRow.map(escapeCSV).join(','));

        // Данные
        filteredWorkers.forEach(worker => {
            const row = [
                worker.name,
                Array.from(worker.homeBrigades).join(', '),
                worker.role,
                ...dates.map(date => {
                    const cell = worker.cells[date] || { text: '', color: 'bg-white', verificationStatus: null };
                    let cellText = cell.text || '';

                    if (cell.verificationStatus === 'ok') {
                        cellText += ' ✓';
                    } else if (cell.verificationStatus === 'missing') {
                        cellText += ' ✗';
                    } else if (cell.verificationStatus === 'unexpected') {
                        cellText += ' !';
                    }

                    return cellText;
                })
            ];
            csvRows.push(row.map(escapeCSV).join(','));
        });

        const csvContent = csvRows.join('\n');

        // Добавляем BOM для правильного отображения кириллицы в Excel
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const filterSuffix = chessFilterShift !== 'all' ? `_${chessFilterShift === 'floaters' ? 'Резерв' : `Бригада${chessFilterShift}`}` : '';
        link.download = `Табель_${dateStr}${filterSuffix}.csv`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    };

    if (!chessTableData || chessTableData.dates.length === 0) {
        return <div className="p-10 text-center text-slate-400">Нет данных для расчета</div>;
    }
    
    const { dates, filteredWorkers } = chessTableData;
    
    // Виртуализация: показываем только срез данных
    const visibleWorkers = filteredWorkers.slice(0, chessDisplayLimit);
    const hasMore = filteredWorkers.length > chessDisplayLimit;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full max-h-[calc(100vh-140px)]">
            <div className="p-4 border-b bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="font-bold text-slate-700 flex items-center gap-2">
                        <Calendar size={20} className="text-blue-600" /> Табель
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportChessTableToExcel}
                            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
                            title="Выгрузить табель в Excel"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Excel</span>
                        </button>
                        <button
                            onClick={exportToCSV}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                            title="Выгрузить табель в CSV (работает без интернета)"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">CSV</span>
                        </button>
                        <button
                            onClick={exportToJSON}
                            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
                            title="Выгрузить табель в JSON (работает без интернета)"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">JSON</span>
                        </button>
                    </div>
                    <div className="relative">
                        <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select value={chessFilterShift} onChange={(e) => setChessFilterShift(e.target.value)} className="pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer hover:border-blue-300 transition-colors">
                            <option value="all">Все смены</option>
                            <option value="1">Бригада 1</option>
                            <option value="2">Бригада 2</option>
                            <option value="3">Бригада 3</option>
                            <option value="4">Бригада 4</option>
                            <option value="floaters">Резерв</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative hidden sm:block">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="text" placeholder="Поиск по ФИО..." value={chessSearch} onChange={(e) => setChessSearch(e.target.value)} className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none w-48" />
                        {chessSearch && (
                            <button onClick={() => setChessSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 text-xs font-medium self-end sm:self-auto">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div> Работа</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div> РВ</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div> Простой</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-50 border border-emerald-200 rounded"></div> Отпуск</div>
                    </div>
                    {factData && (
                        <div className="flex items-center gap-2 pl-2 border-l border-slate-300">
                            <div className="flex items-center gap-1" title="Вышел по факту и был на линии"><CheckCircle2 size={12} className="text-green-600" /> Вышел</div>
                            <div className="flex items-center gap-1" title="Прогул (не вышел)"><XCircle size={12} className="text-red-600" /> Прогул</div>
                            <div className="flex items-center gap-1" title="Вышел в смену, но не стоял на линии"><Clock size={12} className="text-blue-600" /> Без линии</div>
                            <div className="flex items-center gap-1" title="Вышел, но не был в плане"><AlertTriangle size={12} className="text-orange-600" /> Вне плана</div>
                        </div>
                    )}
                </div>
            </div>
            <div className="overflow-auto flex-1">
                <table className="w-full text-xs text-left text-slate-500 border-collapse">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 z-40 shadow-sm">
                        <tr>
                            <th className="px-4 py-3 sticky left-0 bg-slate-100 z-30 border-r border-b border-slate-200 min-w-[200px] shadow-[2px_0_4px_rgba(0,0,0,0.05)]">ФИО Сотрудника</th>
                            <th className="px-2 py-3 sticky left-[200px] bg-slate-100 z-30 border-r border-b border-slate-200 w-[60px] text-center shadow-[2px_0_4px_rgba(0,0,0,0.05)]">Бригада</th>
                            <th className="px-2 py-3 sticky left-[260px] bg-slate-100 z-30 border-r border-b border-slate-200 min-w-[150px] shadow-[2px_0_4px_rgba(0,0,0,0.05)]">Должность</th>
                            {dates.map(d => {
                                const [day, month] = d.split('.');
                                return (
                                    <th key={d} className="px-1 py-3 text-center border-b border-r border-slate-200 min-w-[35px]">
                                        <div className="font-bold">{day}</div>
                                        <div className="text-[9px] text-slate-400">{month}</div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleWorkers.map((w, i) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                                <td className="px-4 py-2 font-medium text-slate-900 sticky left-0 bg-white border-r border-slate-100 z-20 whitespace-nowrap group-hover:bg-slate-50 shadow-[2px_0_4px_rgba(0,0,0,0.05)]" title={workerRegistry[w.name]?.competencies.size > 0 ? `Компетенции: ${Array.from(workerRegistry[w.name].competencies).join(', ')}` : ''}>
                                    {w.name} {workerRegistry[w.name]?.competencies.size > 0 && <GraduationCap size={10} className="inline text-blue-400 ml-1" />}
                                </td>
                                <td className="px-1 py-2 sticky left-[200px] bg-white border-r border-slate-100 z-20 text-center group-hover:bg-slate-50 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-500 border-slate-200 inline-block">
                                        {Array.from(w.homeBrigades).join(',')}
                                    </span>
                                </td>
                                <td className="px-2 py-2 text-slate-500 sticky left-[260px] bg-white border-r border-slate-100 z-20 truncate max-w-[150px] group-hover:bg-slate-50 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">{w.role}</td>
                                {dates.map(d => {
                                    const cell = w.cells[d] || { text: '', color: 'bg-white', verificationStatus: null };
                                    return (
                                        <td
                                            key={d}
                                            onClick={() => {
                                                if (cell.brigadeId) {
                                                    setSelectedDate(d);
                                                    setTargetScrollBrigadeId(cell.brigadeId);
                                                    setViewMode('dashboard');
                                                }
                                            }}
                                            className={`border-r border-slate-100 text-center p-0 h-10 ${cell.color} border-b relative ${cell.brigadeId ? 'cursor-pointer hover:brightness-95' : ''} transition-all`}
                                            title={
                                                cell.verificationStatus === 'ok' ? '✓ Вышел по факту и был на линии (СКУД)' :
                                                cell.verificationStatus === 'missing' ? '✗ Прогул - не вышел по факту (СКУД)' :
                                                cell.verificationStatus === 'unassigned' ? '⏰ Вышел в смену, но не стоял на линии' :
                                                cell.verificationStatus === 'unexpected' ? '! Вышел, но не был в плане' :
                                                ''
                                            }
                                        >
                                            <div className="w-full h-full flex items-center justify-center font-bold relative overflow-visible">
                                                <span className="relative z-10 leading-none">{cell.text}</span>
                                                {cell.verificationStatus === 'ok' && (
                                                    <div className="absolute -top-1 -right-1 pointer-events-none z-30">
                                                        <div className="bg-green-500 rounded-full p-0.5 shadow-md border-2 border-white">
                                                            <CheckCircle2 size={6} className="text-white" strokeWidth={2.5} fill="currentColor" />
                                                        </div>
                                                    </div>
                                                )}
                                                {cell.verificationStatus === 'missing' && (
                                                    <div className="absolute -top-1 -right-1 pointer-events-none z-30">
                                                        <div className="bg-red-500 rounded-full p-0.5 shadow-md border-2 border-white">
                                                            <XCircle size={6} className="text-white" strokeWidth={2.5} fill="currentColor" />
                                                        </div>
                                                    </div>
                                                )}
                                                {cell.verificationStatus === 'unassigned' && (
                                                    <div className="absolute -top-1 -right-1 pointer-events-none z-30">
                                                        <div className="bg-blue-500 rounded-full p-0.5 shadow-md border-2 border-white">
                                                            <Clock size={6} className="text-white" strokeWidth={2.5} fill="currentColor" />
                                                        </div>
                                                    </div>
                                                )}
                                                {cell.verificationStatus === 'unexpected' && (
                                                    <div className="absolute -top-1 -right-1 pointer-events-none z-30">
                                                        <div className="bg-orange-500 rounded-full p-0.5 shadow-md border-2 border-white">
                                                            <AlertTriangle size={6} className="text-white" strokeWidth={2.5} fill="currentColor" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {hasMore && (
                            <tr>
                                <td colSpan={dates.length + 3} className="px-6 py-4 text-center bg-slate-50">
                                    <button
                                        onClick={() => setChessDisplayLimit(prev => prev + 50)}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                                    >
                                        <Plus size={16} />
                                        Загрузить еще (+50)
                                    </button>
                                    <div className="text-xs text-slate-500 mt-2">
                                        Показано {chessDisplayLimit} из {filteredWorkers.length}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default React.memo(TimesheetView);

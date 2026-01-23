import React, { useState, useMemo } from 'react';
import { Users, Search, Plus, SlidersHorizontal, ChevronUp, ChevronDown, ArrowUpDown, Edit3, GraduationCap, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useRenderTime } from '../../PerformanceMonitor';

const EmployeesListView = () => {
    const {
        workerRegistry,
        setEditingWorker,
        logPerformance
    } = useData();

    useRenderTime('employees_list', logPerformance);

    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [showFilters, setShowFilters] = useState(false);
    const [roleFilter, setRoleFilter] = useState('');
    const [lineFilter, setLineFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [compFilter, setCompFilter] = useState('');

    const { uniqueRoles, uniqueLines } = useMemo(() => {
        const roles = new Set();
        const lines = new Set();
        Object.values(workerRegistry).forEach(w => {
            if (w.role) roles.add(w.role);
            if (w.homeLine) lines.add(w.homeLine);
        });
        return {
            uniqueRoles: Array.from(roles).sort(),
            uniqueLines: Array.from(lines).sort()
        };
    }, [workerRegistry]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedWorkers = useMemo(() => {
        let items = Object.values(workerRegistry);
        if (sortConfig.key) {
            items.sort((a, b) => {
                let aValue, bValue;

                if (sortConfig.key === 'role') {
                    aValue = `${a.role || ''} ${a.homeLine || ''}`.toLowerCase();
                    bValue = `${b.role || ''} ${b.homeLine || ''}`.toLowerCase();
                } else if (sortConfig.key === 'status') {
                    const getRank = (s) => !s ? 0 : (s.type === 'vacation' ? 1 : (s.type === 'sick' ? 2 : 3));
                    aValue = getRank(a.status);
                    bValue = getRank(b.status);
                } else if (sortConfig.key === 'competencies') {
                    aValue = a.competencies ? a.competencies.size : 0;
                    bValue = b.competencies ? b.competencies.size : 0;
                } else {
                    aValue = String(a[sortConfig.key] || '').toLowerCase();
                    bValue = String(b[sortConfig.key] || '').toLowerCase();
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [workerRegistry, sortConfig]);

    const filteredWorkers = sortedWorkers.filter(w => {
        if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (roleFilter && w.role !== roleFilter) return false;
        if (lineFilter && w.homeLine !== lineFilter) return false;
        if (statusFilter) {
            if (statusFilter === 'active') {
                if (w.status && !w.status.permanent && (w.status.type === 'vacation' || w.status.type === 'sick')) return false;
                if (w.status?.type === 'fired') return false;
            } else {
                if (w.status?.type !== statusFilter) return false;
            }
        }
        if (compFilter) {
            const hasComp = Array.from(w.competencies || []).some(c => c.toLowerCase().includes(compFilter.toLowerCase()));
            if (!hasComp) return false;
        }
        return true;
    });

    const activeFiltersCount = [roleFilter, lineFilter, statusFilter, compFilter].filter(Boolean).length;

    const clearFilters = () => {
        setRoleFilter('');
        setLineFilter('');
        setStatusFilter('');
        setCompFilter('');
        setSearch('');
    };

    const SortHeader = ({ label, sortKey, className = "" }) => (
        <th
            className={`px-6 py-3 border-b cursor-pointer hover:bg-slate-200 transition-colors group select-none ${className}`}
            onClick={() => handleSort(sortKey)}
        >
            <div className="flex items-center gap-1">
                {label}
                <div className={`text-slate-400 transition-opacity ${sortConfig.key === sortKey ? 'opacity-100 text-blue-600' : 'opacity-0 group-hover:opacity-50'}`}>
                    {sortConfig.key === sortKey && sortConfig.direction === 'desc' ? <ChevronDown size={14} /> : (sortConfig.key === sortKey ? <ChevronUp size={14} /> : <ArrowUpDown size={14} />)}
                </div>
            </div>
        </th>
    );

    return (
        <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex flex-col gap-4 flex-shrink-0">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                        <Users size={20} className="text-blue-600" />
                        База сотрудников
                        <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full">{filteredWorkers.length}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input type="text" placeholder="Быстрый поиск..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none w-64" />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${showFilters || activeFiltersCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            <SlidersHorizontal size={16} />
                            Фильтры
                            {activeFiltersCount > 0 && <span className="bg-blue-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[9px]">{activeFiltersCount}</span>}
                        </button>
                        <button onClick={() => setEditingWorker('new')} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-2 transition-colors">
                            <Plus size={16} /> Добавить
                        </button>
                    </div>
                </div>

                {showFilters && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Должность</label>
                            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full text-sm border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Все должности</option>
                                {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Линия</label>
                            <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} className="w-full text-sm border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Все линии</option>
                                {uniqueLines.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Статус</label>
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full text-sm border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Все статусы</option>
                                <option value="active">Работает (Активен)</option>
                                <option value="vacation">В отпуске</option>
                                <option value="sick">На больничном</option>
                                <option value="fired">Уволен</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Компетенция</label>
                            <input type="text" placeholder="Например: Оператор..." value={compFilter} onChange={(e) => setCompFilter(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        {activeFiltersCount > 0 && (
                            <div className="sm:col-span-4 flex justify-end">
                                <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
                                    <X size={12} /> Сбросить все фильтры
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <SortHeader label="ФИО" sortKey="name" />
                            <SortHeader label="Роль / Линия" sortKey="role" />
                            <SortHeader label="Компетенции" sortKey="competencies" />
                            <SortHeader label="Статус" sortKey="status" />
                            <th className="px-4 py-3 border-b w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredWorkers.map(worker => {
                            const status = worker.status;
                            let statusBadge = null;
                            if (status && !status.permanent && status.type !== 'active') {
                                let color = 'bg-slate-100 text-slate-500';
                                if (status.type === 'vacation') color = 'bg-emerald-100 text-emerald-700';
                                else if (status.type === 'sick') color = 'bg-amber-100 text-amber-700';
                                statusBadge = <span className={`px-2 py-1 rounded-md text-xs font-bold ${color}`}>{status.raw}</span>;
                            } else if (status && status.permanent) {
                                statusBadge = <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700">Уволен</span>;
                            } else {
                                statusBadge = <span className="px-2 py-1 rounded-md text-xs font-bold bg-green-50 text-green-600">Работает</span>;
                            }

                            return (
                                <tr key={worker.name} className="hover:bg-slate-50 group">
                                    <td className="px-6 py-3 font-medium text-slate-800">{worker.name}</td>
                                    <td className="px-6 py-3 text-slate-500">
                                        <div className="text-xs">{worker.role || 'Без роли'}</div>
                                        <div className="text-[10px] text-slate-400">{worker.homeLine || 'Не распределен'}</div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            {worker.competencies && worker.competencies.size > 0 ? Array.from(worker.competencies).map((c, i) => (
                                                <span key={i} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">{c}</span>
                                            )) : <span className="text-slate-300 text-xs italic">-</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">{statusBadge}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => setEditingWorker(worker)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                            <Edit3 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredWorkers.length === 0 && (
                            <tr><td colSpan={5} className="text-center py-10 text-slate-400">Ничего не найдено</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EmployeesListView;

import React from 'react';
import { Users, Search, Edit3, Check, X, Calendar, Zap, AlertTriangle, Clock, ChevronDown, ChevronRight, CheckCircle2, XCircle, Filter, Settings } from 'lucide-react';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';
import ManageDepartmentsModal from '../common/ManageDepartmentsModal';
import { useAllEmployeesData } from '../../hooks/useAllEmployeesData.jsx';
import { normalizeName } from '../../utils';

const AllEmployeesView = () => {
    useRenderTime('all_employees', logPerformanceMetric, true);

    const {
        search,
        setSearch,
        filterRole,
        setFilterRole,
        filterBrigade,
        setFilterBrigade,
        filterStatus,
        setFilterStatus,
        editingDepartment,
        departmentInput,
        setDepartmentInput,
        setEditingDepartment,
        expandedEmployees,
        departmentSuggestions,
        showManageDepartments,
        setShowManageDepartments,
        departmentMasterList,
        currentPage,
        setCurrentPage,
        isCalculating,
        isInitializing,
        employeesWithStats,
        allRoles,
        filteredEmployees,
        filterCounts,
        paginatedEmployees,
        totalPages,
        hasActiveFilters,
        PAGE_SIZE,
        formatHours,
        formatTime,
        formatDate,
        getStatusBadge,
        handleDepartmentChange,
        startEditing,
        toggleEmployee,
        resetFilters,
        handleDepartmentsUpdate
    } = useAllEmployeesData();

    if (isInitializing) {
        return (
            <div className="h-full flex flex-col bg-slate-50 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600" />
                    <p className="text-slate-600 font-medium">Загрузка данных...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                        <Users size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Все сотрудники</h2>
                        <p className="text-xs text-slate-500 mt-1">Аналитика посещаемости и смен</p>
                    </div>
                </div>
                <div className="relative flex-1 max-w-sm">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Поиск по ФИО, должности, отделению..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                </div>
            </div>

            <div className="flex-1 p-6 overflow-hidden flex flex-col">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-slate-600">
                            <Filter size={16} />
                            <span className="text-sm font-semibold">Фильтры:</span>
                        </div>
                        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[180px]">
                            <option value="all">Все должности ({filterCounts.total})</option>
                            {allRoles.map(role => (
                                <option key={role} value={role}>{role} ({filterCounts.roles[role] || 0})</option>
                            ))}
                        </select>
                        <select value={filterBrigade} onChange={e => setFilterBrigade(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[140px]">
                            <option value="all">Все бригады ({filterCounts.total})</option>
                            <option value="1">Бригада 1 ({filterCounts.brigades['1'] || 0})</option>
                            <option value="2">Бригада 2 ({filterCounts.brigades['2'] || 0})</option>
                            <option value="3">Бригада 3 ({filterCounts.brigades['3'] || 0})</option>
                            <option value="4">Бригада 4 ({filterCounts.brigades['4'] || 0})</option>
                        </select>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[180px]">
                            <option value="all">Все статусы ({filterCounts.total})</option>
                            <option value="errors">⚠ С ошибками ({filterCounts.statuses.errors || 0})</option>
                            <option value="rv">⚡ С переработками (РВ) ({filterCounts.statuses.rv || 0})</option>
                            <option value="working">📅 Работающие (В плане) ({filterCounts.statuses.working || 0})</option>
                            <option value="idle">💤 Без смен ({filterCounts.statuses.idle || 0})</option>
                        </select>
                        {hasActiveFilters && (
                            <button onClick={resetFilters} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                                <X size={14} /> Сбросить
                            </button>
                        )}
                        <button onClick={() => setShowManageDepartments(true)} className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-blue-200">
                            <Settings size={16} /> Управление отделениями
                        </button>
                    </div>
                </div>
                {isCalculating && (
                    <div className="flex items-center gap-2 text-slate-500 text-sm mb-3">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                        Пересчёт данных...
                    </div>
                )}

                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                    {filteredEmployees.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center text-slate-400">
                            {employeesWithStats.length === 0
                                ? 'Загрузите данные из Плана или СКУД для отображения сотрудников'
                                : hasActiveFilters ? 'Нет сотрудников с выбранными критериями' : 'Ничего не найдено'}
                        </div>
                    ) : (
                        paginatedEmployees.map(emp => {
                            const normName = normalizeName(emp.name);
                            const isExpanded = expandedEmployees.has(normName);
                            const isEditing = editingDepartment === normName;
                            const totalHours = Math.floor(emp.hoursTotal / 60);
                            const totalMinutes = emp.hoursTotal % 60;
                            return (
                                <div key={normName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="px-6 py-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between" onClick={() => toggleEmployee(normName)}>
                                        <div className="flex-1 flex items-center gap-4">
                                            <div className="text-slate-400">
                                                {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-bold text-slate-800 text-base">{emp.name}</div>
                                                <div className="text-sm text-slate-600 mt-1">{emp.role}</div>
                                                {emp.department && <div className="text-xs text-slate-500 mt-1">{emp.department}</div>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg">
                                                <Calendar size={16} />
                                                <span className="text-sm font-bold">{emp.shiftsCount}</span>
                                            </div>
                                            {emp.rvCount > 0 && (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg">
                                                    <Zap size={16} />
                                                    <span className="text-sm font-bold">{emp.rvCount}</span>
                                                </div>
                                            )}
                                            {emp.errorCount > 0 && (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg">
                                                    <AlertTriangle size={16} />
                                                    <span className="text-sm font-bold">{emp.errorCount}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg">
                                                <Clock size={16} />
                                                <span className="text-sm font-bold">
                                                    {totalHours > 0 ? `${totalHours}ч` : '0ч'}
                                                    {totalMinutes > 0 ? ` ${totalMinutes}м` : ''}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-slate-200 px-6 py-4">
                                            <div className="mb-4 flex items-center justify-between">
                                                <h3 className="font-semibold text-slate-800">История смен</h3>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500">Отделение:</span>
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                list={`dept-list-${normName}`}
                                                                value={departmentInput}
                                                                onChange={e => setDepartmentInput(e.target.value)}
                                                                onBlur={() => handleDepartmentChange(normName, departmentInput)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleDepartmentChange(normName, departmentInput);
                                                                    else if (e.key === 'Escape') { setEditingDepartment(null); setDepartmentInput(''); }
                                                                }}
                                                                className="px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                                autoFocus
                                                            />
                                                            <datalist id={`dept-list-${normName}`}>
                                                                {departmentSuggestions.map(dept => <option key={dept} value={dept} />)}
                                                            </datalist>
                                                            <button onClick={() => handleDepartmentChange(normName, departmentInput)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Сохранить">
                                                                <Check size={16} />
                                                            </button>
                                                            <button onClick={() => { setEditingDepartment(null); setDepartmentInput(''); }} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Отмена">
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className={emp.department ? 'text-slate-800' : 'text-slate-300 italic'}>{emp.department || 'Не указано'}</span>
                                                            <button onClick={(e) => { e.stopPropagation(); startEditing(normName, emp.department); }} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Редактировать отделение">
                                                                <Edit3 size={14} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left border-b">Дата</th>
                                                            <th className="px-4 py-2 text-left border-b">План</th>
                                                            <th className="px-4 py-2 text-left border-b">Факт</th>
                                                            <th className="px-4 py-2 text-left border-b">Длительность</th>
                                                            <th className="px-4 py-2 text-center border-b">Статус</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {emp.events.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Нет данных</td>
                                                            </tr>
                                                        ) : (
                                                            emp.events.map((event, idx) => (
                                                                <tr key={`${event.date}-${idx}`} className="hover:bg-slate-50">
                                                                    <td className="px-4 py-3 font-medium text-slate-800">{formatDate(event.date)}</td>
                                                                    <td className="px-4 py-3 text-slate-600">
                                                                        {event.planInfo ? (
                                                                            event.planInfo.isRv ? (
                                                                                <div>
                                                                                    <span className="font-semibold text-orange-600">РВ</span>
                                                                                    <span className="text-slate-500 ml-2">{event.planInfo.shiftName}, {event.planInfo.lineName}</span>
                                                                                </div>
                                                                            ) : (
                                                                                <div>
                                                                                    <span className="font-semibold">Бригада {event.planInfo.shiftId}</span>
                                                                                    <span className="text-slate-500 ml-2">{event.planInfo.lineName}, {event.planInfo.role}</span>
                                                                                </div>
                                                                            )
                                                                        ) : (
                                                                            <span className="text-slate-400 italic">Выходной</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-700 font-mono text-xs">{formatTime(event.factInfo)}</td>
                                                                    <td className="px-4 py-3 text-slate-600">{formatHours(event.duration)}</td>
                                                                    <td className="px-4 py-3 text-center">{getStatusBadge(event.status)}</td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                    {filteredEmployees.length > PAGE_SIZE && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mt-4 flex items-center justify-between">
                            <div className="text-sm text-slate-600">
                                Показано {((currentPage - 1) * PAGE_SIZE) + 1} - {Math.min(currentPage * PAGE_SIZE, filteredEmployees.length)} из {filteredEmployees.length}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">
                                    Назад
                                </button>
                                <span className="px-4 py-2 text-sm font-medium text-slate-700">Страница {currentPage} из {totalPages}</span>
                                <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">
                                    Вперед
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {showManageDepartments && (
                <ManageDepartmentsModal
                    isOpen={showManageDepartments}
                    onClose={() => setShowManageDepartments(false)}
                    masterList={departmentMasterList}
                    onUpdate={handleDepartmentsUpdate}
                />
            )}
        </div>
    );
};

export default React.memo(AllEmployeesView);

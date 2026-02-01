import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Users, Search, Edit3, Check, X, Calendar, Zap, AlertTriangle, Clock, ChevronDown, ChevronRight, CheckCircle2, XCircle, Filter, Settings, Trash2, Plus } from 'lucide-react';
import { useData } from '../../context/DataContext';
<<<<<<< Updated upstream
import { STORAGE_KEYS, saveToLocalStorage, loadFromLocalStorage, normalizeName, matchNames } from '../../utils';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';
=======
import { STORAGE_KEYS, loadFromLocalStorage, normalizeName, matchNames } from '../../utils';
import { useRenderTime } from '../PerformanceMonitor';
import { logPerformanceMetric } from '../../context/performanceStore';
>>>>>>> Stashed changes

const AllEmployeesView = () => {
    const {
        workerRegistry,
        factData,
        savedPlans,
        viewMode
    } = useData();

    useRenderTime('all_employees', logPerformanceMetric, viewMode === 'all_employees');

    const [allEmployees, setAllEmployees] = useState({});
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [filterBrigade, setFilterBrigade] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [editingDepartment, setEditingDepartment] = useState(null);
    const [departmentInput, setDepartmentInput] = useState('');
    const [expandedEmployees, setExpandedEmployees] = useState(new Set());
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isCalculating, setIsCalculating] = useState(false);
    const [workerResult, setWorkerResult] = useState({
        employeesWithStats: [],
        filteredEmployees: [],
        allRoles: [],
        filterCounts: {
            roles: {},
            brigades: { '1': 0, '2': 0, '3': 0, '4': 0 },
            statuses: { errors: 0, rv: 0, working: 0, idle: 0 },
            total: 0
        }
    });
    const [departmentSuggestions] = useState([
        'Бухгалтерия', 'Склад', 'Линия 1', 'Линия 2', 'Линия 3', 'Линия 4', 
        'Администрация', 'ОТК', 'Ремонт', 'Энергетика', 'Транспорт', 'Охрана'
    ]);
    const [showManageDepartments, setShowManageDepartments] = useState(false);
    const [departmentMasterList, setDepartmentMasterList] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 50;
    const [isInitializing, setIsInitializing] = useState(true);

    const workerRef = useRef(null);
    const requestIdRef = useRef(0);
    const isInitializingRef = useRef(true);

    // Загружаем данные из localStorage при монтировании (async для неблокирующей инициализации)
    useEffect(() => {
        // Use setTimeout to allow the browser to paint the loading state first
        setTimeout(() => {
            const saved = loadFromLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, {});
            setAllEmployees(saved);
            
            // Load department master list
            const masterList = loadFromLocalStorage(STORAGE_KEYS.DEPARTMENT_MASTER_LIST, null);
            if (masterList) {
                setDepartmentMasterList(masterList);
            } else {
                // Initialize with defaults
                const defaults = ['Бухгалтерия', 'Склад', 'Линия 1', 'Линия 2', 'Линия 3', 'Линия 4', 
                                'Администрация', 'ОТК', 'Ремонт', 'Энергетика', 'Транспорт', 'Охрана'];
                setDepartmentMasterList(defaults);
                saveToLocalStorage(STORAGE_KEYS.DEPARTMENT_MASTER_LIST, defaults);
            }
        }, 0);
    }, []);

    // Синхронизируем данные из workerRegistry и factData
    useEffect(() => {
        setAllEmployees(prev => {
            const updated = { ...prev };
            let changed = false;

            // Добавляем сотрудников из реестра (План)
            Object.values(workerRegistry || {}).forEach(worker => {
                if (!worker || !worker.name) return;
                const normName = normalizeName(worker.name);
                if (!updated[normName]) {
                    updated[normName] = {
                        name: worker.name,
                        role: worker.role || 'Не указано',
                        department: prev[normName]?.department || '',
                        source: 'План'
                    };
                    changed = true;
                } else {
                    // Обновляем роль, если она изменилась
                    if (updated[normName].role !== worker.role) {
                        updated[normName].role = worker.role || 'Не указано';
                        changed = true;
                    }
                    // Сохраняем отделение, если оно было задано
                    if (!updated[normName].department && prev[normName]?.department) {
                        updated[normName].department = prev[normName].department;
                    }
                }
            });

            // Добавляем сотрудников из factData (СКУД)
            if (factData && typeof factData === 'object' && Object.keys(factData).length > 0) {
                Object.values(factData).forEach(dateData => {
                    if (!dateData || typeof dateData !== 'object') return;
                    Object.values(dateData).forEach(entry => {
                        if (entry && entry.rawName) {
                            const normName = normalizeName(entry.rawName);
                            if (!updated[normName]) {
                                updated[normName] = {
                                    name: entry.rawName,
                                    role: 'Не указано',
                                    department: prev[normName]?.department || '',
                                    source: 'СКУД'
                                };
                                changed = true;
                            } else {
                                if (updated[normName].source === 'План') {
                                    updated[normName].source = 'План/СКУД';
                                    changed = true;
                                }
                                const regEntry = Object.values(workerRegistry || {}).find(w => 
                                    w && w.name && (normalizeName(w.name) === normName || matchNames(w.name, entry.rawName))
                                );
                                if (regEntry && regEntry.role) {
                                    updated[normName].role = regEntry.role;
                                    changed = true;
                                }
                            }
                        }
                    });
                });
            }

            if (changed) {
                saveToLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, updated);
            }
            return updated;
        });
    }, [workerRegistry, factData]);

    const formatHours = (hoursData) => {
        if (!hoursData) return '—';
        if (hoursData.minutes === 0) {
            return `${hoursData.hours}ч`;
        }
        return `${hoursData.hours}ч ${hoursData.minutes}м`;
    };

    const formatTime = (factEntry) => {
        if (!factEntry) return '—';
        if (factEntry.hasOvernightShift && factEntry.nextDayExit) {
            return `${factEntry.entryTime} → ${factEntry.nextDayExit} (+1)`;
        }
        if (factEntry.entryTime && factEntry.exitTime) {
            return `${factEntry.entryTime} → ${factEntry.exitTime}`;
        }
        if (factEntry.entryTime && !factEntry.exitTime) {
            return `Вход: ${factEntry.entryTime}`;
        }
        return factEntry.time || '—';
    };

    const handleDepartmentChange = (normName, newDepartment) => {
        setAllEmployees(prev => {
            const updated = {
                ...prev,
                [normName]: {
                    ...prev[normName],
                    department: newDepartment
                }
            };
            saveToLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, updated);
            return updated;
        });
        setEditingDepartment(null);
        setDepartmentInput('');
    };

    const startEditing = (normName, currentDepartment) => {
        setEditingDepartment(normName);
        setDepartmentInput(currentDepartment || '');
    };

    const toggleEmployee = useCallback((normName) => {
        setExpandedEmployees(prev => {
            const newSet = new Set(prev);
            if (newSet.has(normName)) {
                newSet.delete(normName);
            } else {
                newSet.add(normName);
            }
            return newSet;
        });
    }, []);

    const workerRegistryLite = useMemo(() => {
        return Object.values(workerRegistry || {})
            .map(worker => (worker?.name ? { name: worker.name, role: worker.role } : null))
            .filter(Boolean);
    }, [workerRegistry]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        if (workerRef.current) return;
        const worker = new Worker(new URL('../../workers/allEmployees.worker.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        worker.onmessage = (e) => {
            const { requestId, result } = e.data || {};
            if (requestId !== requestIdRef.current) return;
            if (result) {
                setWorkerResult(result);
                // Clear initialization state after first successful result
                if (isInitializingRef.current) {
                    isInitializingRef.current = false;
                    setIsInitializing(false);
                }
            }
            setIsCalculating(false);
        };
        worker.onerror = () => {
            setIsCalculating(false);
            // Clear initialization state on error
            if (isInitializingRef.current) {
                isInitializingRef.current = false;
                setIsInitializing(false);
            }
        };
        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!workerRef.current) return;
        const requestId = ++requestIdRef.current;
        setIsCalculating(true);
        workerRef.current.postMessage({
            requestId,
            payload: {
                workerRegistry: workerRegistryLite,
                factData,
                savedPlans,
                allEmployees
            }
        });
    }, [workerRegistryLite, factData, savedPlans, allEmployees]);

    const { employeesWithStats = [], allRoles = [] } = workerResult;

    // Client-side filtering with useMemo
    const filteredEmployees = useMemo(() => {
        if (!employeesWithStats || employeesWithStats.length === 0) return [];
        
        const searchLower = debouncedSearch.toLowerCase();
        return employeesWithStats.filter(emp => {
            // Search filter
            if (searchLower && !(
                emp.name.toLowerCase().includes(searchLower) ||
                emp.role.toLowerCase().includes(searchLower) ||
                (emp.department || '').toLowerCase().includes(searchLower)
            )) return false;
            
            // Role filter
            if (filterRole !== 'all' && emp.role !== filterRole) return false;
            
            // Brigade filter
            if (filterBrigade !== 'all') {
                const hasBrigade = emp.events?.some(event => 
                    event.planInfo && event.planInfo.shiftId === filterBrigade
                );
                if (!hasBrigade) return false;
            }
            
            // Status filter
            if (filterStatus !== 'all') {
                switch (filterStatus) {
                    case 'errors':
                        if (emp.errorCount === 0) return false;
                        break;
                    case 'rv':
                        if (emp.rvCount === 0) return false;
                        break;
                    case 'working':
                        if (emp.shiftsCount === 0) return false;
                        break;
                    case 'idle':
                        if (emp.shiftsCount > 0 || emp.events?.some(e => e.factInfo)) return false;
                        break;
                }
            }
            
            return true;
        });
    }, [employeesWithStats, debouncedSearch, filterRole, filterBrigade, filterStatus]);

    const filterCounts = useMemo(() => {
        const roles = {};
        const brigades = { '1': 0, '2': 0, '3': 0, '4': 0 };
        const statuses = { errors: 0, rv: 0, working: 0, idle: 0 };
        
        filteredEmployees.forEach(emp => {
            if (emp.role && emp.role !== 'Не указано') {
                roles[emp.role] = (roles[emp.role] || 0) + 1;
            }
            
            ['1', '2', '3', '4'].forEach(brigadeId => {
                if (emp.events?.some(e => e.planInfo?.shiftId === brigadeId)) {
                    brigades[brigadeId]++;
                }
            });
            
            if (emp.errorCount > 0) statuses.errors++;
            if (emp.rvCount > 0) statuses.rv++;
            if (emp.shiftsCount > 0) statuses.working++;
            if (emp.shiftsCount === 0 && !emp.events?.some(e => e.factInfo)) statuses.idle++;
        });
        
        return {
            roles,
            brigades,
            statuses,
            total: filteredEmployees.length
        };
    }, [filteredEmployees]);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, filterRole, filterBrigade, filterStatus]);

    // Pagination logic
    const paginatedEmployees = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        return filteredEmployees.slice(start, end);
    }, [filteredEmployees, currentPage]);

    const totalPages = Math.ceil(filteredEmployees.length / PAGE_SIZE);

    const hasActiveFilters = filterRole !== 'all' || filterBrigade !== 'all' || filterStatus !== 'all';

    const resetFilters = () => {
        setFilterRole('all');
        setFilterBrigade('all');
        setFilterStatus('all');
    };

    const formatDate = (dateStr) => {
        const [day, month] = dateStr.split('.');
        return `${day}.${month}`;
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'ok':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-green-100 text-green-700"><CheckCircle2 size={12} /> OK</span>;
            case 'incomplete':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700"><XCircle size={12} /> Нет выхода</span>;
            case 'missing':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600">—</span>;
            default:
                return <span className="text-slate-400">—</span>;
        }
    };

    const ManageDepartmentsModal = ({ isOpen, onClose, masterList, onUpdate }) => {
        const [departments, setDepartments] = useState([]);
        const [newDeptInput, setNewDeptInput] = useState('');

        useEffect(() => {
            if (isOpen) {
                setDepartments([...masterList]);
                setNewDeptInput('');
            }
        }, [isOpen, masterList]);

        const handleAdd = () => {
            const trimmed = newDeptInput.trim();
            if (trimmed && !departments.includes(trimmed)) {
                const updated = [...departments, trimmed].sort();
                setDepartments(updated);
                setNewDeptInput('');
                onUpdate(updated);
            }
        };

        const handleDelete = (deptToDelete) => {
            const updated = departments.filter(d => d !== deptToDelete);
            setDepartments(updated);
            onUpdate(updated);
        };

        if (!isOpen) return null;

        return (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg text-blue-800 flex items-center gap-2">
                                <Settings size={20} /> Управление отделениями
                            </h3>
                            <p className="text-xs text-blue-600 mt-1">Добавьте или удалите отделения из списка</p>
                        </div>
                        <button onClick={onClose} className="text-blue-400 hover:text-blue-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Добавить новое отделение
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newDeptInput}
                                    onChange={(e) => setNewDeptInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAdd();
                                        }
                                    }}
                                    placeholder="Введите название отделения"
                                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <button
                                    onClick={handleAdd}
                                    disabled={!newDeptInput.trim() || departments.includes(newDeptInput.trim())}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                >
                                    <Plus size={16} /> Добавить
                                </button>
                            </div>
                            {newDeptInput.trim() && departments.includes(newDeptInput.trim()) && (
                                <p className="text-xs text-red-500 mt-1">Это отделение уже существует</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Список отделений ({departments.length})
                            </label>
                            {departments.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 text-sm">
                                    Нет отделений. Добавьте первое отделение выше.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {departments.map((dept) => (
                                        <div
                                            key={dept}
                                            className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                                        >
                                            <span className="text-sm font-medium text-slate-700">{dept}</span>
                                            <button
                                                onClick={() => handleDelete(dept)}
                                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Удалить отделение"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end rounded-b-2xl">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        );
    };


    // Show loading spinner during initialization
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
                {/* Панель фильтров */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-slate-600">
                            <Filter size={16} />
                            <span className="text-sm font-semibold">Фильтры:</span>
                        </div>
                        
                        {/* Фильтр по должности */}
                        <select
                            value={filterRole}
                            onChange={e => setFilterRole(e.target.value)}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[180px]"
                        >
                            <option value="all">Все должности ({filterCounts.total})</option>
                            {allRoles.map(role => (
                                <option key={role} value={role}>{role} ({filterCounts.roles[role] || 0})</option>
                            ))}
                        </select>

                        {/* Фильтр по бригаде */}
                        <select
                            value={filterBrigade}
                            onChange={e => setFilterBrigade(e.target.value)}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[140px]"
                        >
                            <option value="all">Все бригады ({filterCounts.total})</option>
                            <option value="1">Бригада 1 ({filterCounts.brigades['1'] || 0})</option>
                            <option value="2">Бригада 2 ({filterCounts.brigades['2'] || 0})</option>
                            <option value="3">Бригада 3 ({filterCounts.brigades['3'] || 0})</option>
                            <option value="4">Бригада 4 ({filterCounts.brigades['4'] || 0})</option>
                        </select>

                        {/* Фильтр по статусу */}
                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[180px]"
                        >
                            <option value="all">Все статусы ({filterCounts.total})</option>
                            <option value="errors">⚠ С ошибками ({filterCounts.statuses.errors || 0})</option>
                            <option value="rv">⚡ С переработками (РВ) ({filterCounts.statuses.rv || 0})</option>
                            <option value="working">📅 Работающие (В плане) ({filterCounts.statuses.working || 0})</option>
                            <option value="idle">💤 Без смен ({filterCounts.statuses.idle || 0})</option>
                        </select>

                        {/* Кнопка сброса */}
                        {hasActiveFilters && (
                            <button
                                onClick={resetFilters}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <X size={14} />
                                Сбросить
                            </button>
                        )}
                        
                        {/* Кнопка управления отделениями */}
                        <button
                            onClick={() => setShowManageDepartments(true)}
                            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-blue-200"
                        >
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
                                : hasActiveFilters
                                    ? 'Нет сотрудников с выбранными критериями'
                                    : 'Ничего не найдено'}
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
                                    {/* Summary Row */}
                                    <div 
                                        className="px-6 py-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between"
                                        onClick={() => toggleEmployee(normName)}
                                    >
                                        <div className="flex-1 flex items-center gap-4">
                                            <div className="text-slate-400">
                                                {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-bold text-slate-800 text-base">{emp.name}</div>
                                                <div className="text-sm text-slate-600 mt-1">{emp.role}</div>
                                                {emp.department && (
                                                    <div className="text-xs text-slate-500 mt-1">{emp.department}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {/* План */}
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg">
                                                <Calendar size={16} />
                                                <span className="text-sm font-bold">{emp.shiftsCount}</span>
                                            </div>
                                            {/* РВ */}
                                            {emp.rvCount > 0 && (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg">
                                                    <Zap size={16} />
                                                    <span className="text-sm font-bold">{emp.rvCount}</span>
                                                </div>
                                            )}
                                            {/* Ошибки */}
                                            {emp.errorCount > 0 && (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg">
                                                    <AlertTriangle size={16} />
                                                    <span className="text-sm font-bold">{emp.errorCount}</span>
                                                </div>
                                            )}
                                            {/* Часы */}
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg">
                                                <Clock size={16} />
                                                <span className="text-sm font-bold">
                                                    {totalHours > 0 ? `${totalHours}ч` : '0ч'}
                                                    {totalMinutes > 0 ? ` ${totalMinutes}м` : ''}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Content */}
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
                                                                    if (e.key === 'Enter') {
                                                                        handleDepartmentChange(normName, departmentInput);
                                                                    } else if (e.key === 'Escape') {
                                                                        setEditingDepartment(null);
                                                                        setDepartmentInput('');
                                                                    }
                                                                }}
                                                                className="px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                                autoFocus
                                                            />
                                                            <datalist id={`dept-list-${normName}`}>
                                                                {departmentSuggestions.map(dept => (
                                                                    <option key={dept} value={dept} />
                                                                ))}
                                                            </datalist>
                                                            <button
                                                                onClick={() => handleDepartmentChange(normName, departmentInput)}
                                                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                                title="Сохранить"
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingDepartment(null);
                                                                    setDepartmentInput('');
                                                                }}
                                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                                title="Отмена"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className={emp.department ? 'text-slate-800' : 'text-slate-300 italic'}>
                                                                {emp.department || 'Не указано'}
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    startEditing(normName, emp.department);
                                                                }}
                                                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                title="Редактировать отделение"
                                                            >
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
                                                                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                                                                    Нет данных
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            emp.events.map((event, idx) => (
                                                                <tr key={`${event.date}-${idx}`} className="hover:bg-slate-50">
                                                                    <td className="px-4 py-3 font-medium text-slate-800">
                                                                        {formatDate(event.date)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-600">
                                                                        {event.planInfo ? (
                                                                            event.planInfo.isRv ? (
                                                                                <div>
                                                                                    <span className="font-semibold text-orange-600">РВ</span>
                                                                                    <span className="text-slate-500 ml-2">
                                                                                        {event.planInfo.shiftName}, {event.planInfo.lineName}
                                                                                    </span>
                                                                                </div>
                                                                            ) : (
                                                                                <div>
                                                                                    <span className="font-semibold">Бригада {event.planInfo.shiftId}</span>
                                                                                    <span className="text-slate-500 ml-2">
                                                                                        {event.planInfo.lineName}, {event.planInfo.role}
                                                                                    </span>
                                                                                </div>
                                                                            )
                                                                        ) : (
                                                                            <span className="text-slate-400 italic">Выходной</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-700 font-mono text-xs">
                                                                        {formatTime(event.factInfo)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-600">
                                                                        {formatHours(event.duration)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        {getStatusBadge(event.status)}
                                                                    </td>
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
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                                >
                                    Назад
                                </button>
                                <span className="px-4 py-2 text-sm font-medium text-slate-700">
                                    Страница {currentPage} из {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                                >
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
                    onUpdate={(updated) => {
                        setDepartmentMasterList(updated);
                        saveToLocalStorage(STORAGE_KEYS.DEPARTMENT_MASTER_LIST, updated);
                    }}
                />
            )}
        </div>
    );
};

export default React.memo(AllEmployeesView);

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { STORAGE_KEYS, normalizeName, matchNames } from '../utils';

const PAGE_SIZE = 50;
const DEFAULT_DEPARTMENTS = [
    'Бухгалтерия', 'Склад', 'Линия 1', 'Линия 2', 'Линия 3', 'Линия 4',
    'Администрация', 'ОТК', 'Ремонт', 'Энергетика', 'Транспорт', 'Охрана'
];

const INITIAL_WORKER_RESULT = {
    employeesWithStats: [],
    filteredEmployees: [],
    allRoles: [],
    filterCounts: {
        roles: {},
        brigades: { '1': 0, '2': 0, '3': 0, '4': 0 },
        statuses: { errors: 0, rv: 0, working: 0, idle: 0 },
        total: 0
    }
};

export function useAllEmployeesData() {
    const {
        workerRegistry,
        factData,
        savedPlans,
        persistStateKey,
        allEmployees: contextAllEmployees,
        setAllEmployees: setContextAllEmployees,
        departmentMasterList: contextDepartmentMasterList,
        setDepartmentMasterList: setContextDepartmentMasterList
    } = useData();

    const [allEmployees, setAllEmployees] = useState({});
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [filterBrigade, setFilterBrigade] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [editingDepartment, setEditingDepartment] = useState(null);
    const [departmentInput, setDepartmentInput] = useState('');
    const [expandedEmployees, setExpandedEmployees] = useState(() => new Set());
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isCalculating, setIsCalculating] = useState(false);
    const [workerResult, setWorkerResult] = useState(INITIAL_WORKER_RESULT);
    const [showManageDepartments, setShowManageDepartments] = useState(false);
    const [departmentMasterList, setDepartmentMasterList] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [isInitializing, setIsInitializing] = useState(true);

    const workerRef = useRef(null);
    const requestIdRef = useRef(0);
    const isInitializingRef = useRef(true);

    useEffect(() => {
        setTimeout(() => {
            const saved = contextAllEmployees && typeof contextAllEmployees === 'object' ? contextAllEmployees : {};
            setAllEmployees(saved);
            const masterList = Array.isArray(contextDepartmentMasterList) ? contextDepartmentMasterList : null;
            if (masterList && masterList.length > 0) {
                setDepartmentMasterList(masterList);
            } else {
                setDepartmentMasterList(DEFAULT_DEPARTMENTS);
                setContextDepartmentMasterList(DEFAULT_DEPARTMENTS);
                persistStateKey(STORAGE_KEYS.DEPARTMENT_MASTER_LIST, DEFAULT_DEPARTMENTS);
            }
        }, 0);
    }, [contextAllEmployees, contextDepartmentMasterList, persistStateKey, setContextDepartmentMasterList]);

    useEffect(() => {
        setAllEmployees(prev => {
            const updated = { ...prev };
            let changed = false;

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
                    if (updated[normName].role !== worker.role) {
                        updated[normName].role = worker.role || 'Не указано';
                        changed = true;
                    }
                    if (!updated[normName].department && prev[normName]?.department) {
                        updated[normName].department = prev[normName].department;
                    }
                }
            });

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
                persistStateKey(STORAGE_KEYS.ALL_EMPLOYEES, updated);
                setContextAllEmployees(updated);
            }
            return updated;
        });
    }, [workerRegistry, factData, persistStateKey, setContextAllEmployees]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const workerRegistryLite = useMemo(() => {
        return Object.values(workerRegistry || {})
            .map(worker => (worker?.name ? { name: worker.name, role: worker.role } : null))
            .filter(Boolean);
    }, [workerRegistry]);

    useEffect(() => {
        if (workerRef.current) return;
        const worker = new Worker(new URL('../workers/allEmployees.worker.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        worker.onmessage = (e) => {
            const { requestId, result } = e.data || {};
            if (requestId !== requestIdRef.current) return;
            if (result) {
                setWorkerResult(result);
                if (isInitializingRef.current) {
                    isInitializingRef.current = false;
                    setIsInitializing(false);
                }
            }
            setIsCalculating(false);
        };
        worker.onerror = () => {
            setIsCalculating(false);
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
            payload: { workerRegistry: workerRegistryLite, factData, savedPlans, allEmployees }
        });
    }, [workerRegistryLite, factData, savedPlans, allEmployees]);

    const { employeesWithStats = [], allRoles = [] } = workerResult;

    const filteredEmployees = useMemo(() => {
        if (!employeesWithStats || employeesWithStats.length === 0) return [];
        const searchLower = debouncedSearch.toLowerCase();
        return employeesWithStats.filter(emp => {
            if (searchLower && !(
                emp.name.toLowerCase().includes(searchLower) ||
                emp.role.toLowerCase().includes(searchLower) ||
                (emp.department || '').toLowerCase().includes(searchLower)
            )) return false;
            if (filterRole !== 'all' && emp.role !== filterRole) return false;
            if (filterBrigade !== 'all') {
                const hasBrigade = emp.events?.some(event => event.planInfo && event.planInfo.shiftId === filterBrigade);
                if (!hasBrigade) return false;
            }
            if (filterStatus !== 'all') {
                switch (filterStatus) {
                    case 'errors': if (emp.errorCount === 0) return false; break;
                    case 'rv': if (emp.rvCount === 0) return false; break;
                    case 'working': if (emp.shiftsCount === 0) return false; break;
                    case 'idle': if (emp.shiftsCount > 0 || emp.events?.some(e => e.factInfo)) return false; break;
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
            if (emp.role && emp.role !== 'Не указано') roles[emp.role] = (roles[emp.role] || 0) + 1;
            ['1', '2', '3', '4'].forEach(brigadeId => {
                if (emp.events?.some(e => e.planInfo?.shiftId === brigadeId)) brigades[brigadeId]++;
            });
            if (emp.errorCount > 0) statuses.errors++;
            if (emp.rvCount > 0) statuses.rv++;
            if (emp.shiftsCount > 0) statuses.working++;
            if (emp.shiftsCount === 0 && !emp.events?.some(e => e.factInfo)) statuses.idle++;
        });
        return { roles, brigades, statuses, total: filteredEmployees.length };
    }, [filteredEmployees]);

    useEffect(() => setCurrentPage(1), [debouncedSearch, filterRole, filterBrigade, filterStatus]);

    const paginatedEmployees = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredEmployees.slice(start, start + PAGE_SIZE);
    }, [filteredEmployees, currentPage]);

    const totalPages = Math.ceil(filteredEmployees.length / PAGE_SIZE);
    const hasActiveFilters = filterRole !== 'all' || filterBrigade !== 'all' || filterStatus !== 'all';

    const formatHours = useCallback((hoursData) => {
        if (!hoursData) return '—';
        if (hoursData.minutes === 0) return `${hoursData.hours}ч`;
        return `${hoursData.hours}ч ${hoursData.minutes}м`;
    }, []);

    const formatTime = useCallback((factEntry) => {
        if (!factEntry) return '—';
        if (factEntry.hasOvernightShift && factEntry.nextDayExit) return `${factEntry.entryTime} → ${factEntry.nextDayExit} (+1)`;
        if (factEntry.entryTime && factEntry.exitTime) return `${factEntry.entryTime} → ${factEntry.exitTime}`;
        if (factEntry.entryTime && !factEntry.exitTime) return `Вход: ${factEntry.entryTime}`;
        return factEntry.time || '—';
    }, []);

    const formatDate = useCallback((dateStr) => {
        const [day, month] = (dateStr || '').split('.');
        return `${day || ''}.${month || ''}`;
    }, []);

    const getStatusBadge = useCallback((status) => {
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
    }, []);

    const handleDepartmentChange = useCallback((normName, newDepartment) => {
        setAllEmployees(prev => {
            const updated = { ...prev, [normName]: { ...prev[normName], department: newDepartment } };
            persistStateKey(STORAGE_KEYS.ALL_EMPLOYEES, updated);
            setContextAllEmployees(updated);
            return updated;
        });
        setEditingDepartment(null);
        setDepartmentInput('');
    }, [persistStateKey, setContextAllEmployees]);

    const startEditing = useCallback((normName, currentDepartment) => {
        setEditingDepartment(normName);
        setDepartmentInput(currentDepartment || '');
    }, []);

    const toggleEmployee = useCallback((normName) => {
        setExpandedEmployees(prev => {
            const next = new Set(prev);
            if (next.has(normName)) next.delete(normName); else next.add(normName);
            return next;
        });
    }, []);

    const resetFilters = useCallback(() => {
        setFilterRole('all');
        setFilterBrigade('all');
        setFilterStatus('all');
    }, []);

    const handleDepartmentsUpdate = useCallback((updated) => {
        setDepartmentMasterList(updated);
        setContextDepartmentMasterList(updated);
        persistStateKey(STORAGE_KEYS.DEPARTMENT_MASTER_LIST, updated);
    }, [setContextDepartmentMasterList, persistStateKey]);

    return {
        // state
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
        departmentSuggestions: DEFAULT_DEPARTMENTS,
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
        // actions
        formatHours,
        formatTime,
        formatDate,
        getStatusBadge,
        handleDepartmentChange,
        startEditing,
        toggleEmployee,
        resetFilters,
        handleDepartmentsUpdate
    };
}

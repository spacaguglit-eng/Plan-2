import React, { useState, useEffect, useMemo } from 'react';
import { Users, Search, Edit3, Check, X, Calendar, Zap, AlertTriangle, Clock, ChevronDown, ChevronRight, CheckCircle2, XCircle, Filter } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { STORAGE_KEYS, saveToLocalStorage, loadFromLocalStorage, normalizeName, matchNames, cleanVal, extractShiftNumber, isLineMatch, checkWorkerAvailability } from '../../utils';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';

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
    const [departmentSuggestions] = useState([
        'Бухгалтерия', 'Склад', 'Линия 1', 'Линия 2', 'Линия 3', 'Линия 4', 
        'Администрация', 'ОТК', 'Ремонт', 'Энергетика', 'Транспорт', 'Охрана'
    ]);

    // Загружаем данные из localStorage при монтировании
    useEffect(() => {
        const saved = loadFromLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, {});
        setAllEmployees(saved);
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

    // Вспомогательные функции
    const calculateHours = (entryTime, exitTime) => {
        if (!entryTime) return null;
        if (!exitTime) return null;
        
        const parseTime = (timeStr) => {
            const match = timeStr.match(/(\d{1,2}):(\d{2})/);
            if (!match) return null;
            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            return hours * 60 + minutes; // возвращаем в минутах
        };

        const entryMinutes = parseTime(entryTime);
        const exitMinutes = parseTime(exitTime);
        
        if (entryMinutes === null || exitMinutes === null) return null;
        
        let diffMinutes = exitMinutes - entryMinutes;
        if (diffMinutes < 0) diffMinutes += 24 * 60; // обработка ночной смены
        
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        
        return { hours, minutes, totalMinutes: diffMinutes };
    };

    const formatHours = (hoursData) => {
        if (!hoursData) return '—';
        if (hoursData.minutes === 0) {
            return `${hoursData.hours}ч`;
        }
        return `${hoursData.hours}ч ${hoursData.minutes}м`;
    };

    const validateFactEntry = (factEntry) => {
        if (!factEntry) return 'missing';
        if (factEntry.hasOvernightShift && factEntry.nextDayExit) return 'ok';
        if (factEntry.entryTime && factEntry.exitTime) return 'ok';
        if (factEntry.entryTime && !factEntry.exitTime) return 'incomplete';
        if (!factEntry.entryTime && factEntry.exitTime) return 'incomplete';
        return 'missing';
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

    // Функция для получения смен из сохраненного плана
    const getShiftsFromSavedPlan = (planData, date) => {
        if (!planData || !planData.data) return [];
        
        const { rawTables, lineTemplates, manualAssignments, workerRegistry: planRegistry } = planData.data;
        if (!rawTables?.demand || !Array.isArray(rawTables.demand)) return [];

        const demandData = rawTables.demand;
        const headers = Array.isArray(demandData[0]) ? demandData[0] : [];
        const brigadesMap = {};

        // Парсим demand для получения бригад на указанную дату
        demandData.slice(1).forEach(row => {
            if (!row) return;
            let d = row[11];
            let dateStr = '';
            if (d instanceof Date) dateStr = d.toLocaleDateString('ru-RU');
            else if (typeof d === 'string') {
                const dateTry = new Date(d);
                if (!isNaN(dateTry.getTime())) dateStr = dateTry.toLocaleDateString('ru-RU');
                else dateStr = cleanVal(d);
            }
            if (dateStr !== date) return;

            const shiftType = cleanVal(row[13]);
            const brigadeRaw = cleanVal(row[14]);
            const shiftNum = extractShiftNumber(brigadeRaw);
            if (!shiftNum) return;

            if (!brigadesMap[shiftNum]) {
                brigadesMap[shiftNum] = { id: shiftNum, name: brigadeRaw, type: shiftType, activeLines: [] };
            }

            for (let i = 15; i <= 26; i++) {
                const lineHeader = cleanVal(headers[i]);
                if (lineHeader && (parseInt(row[i]) || 0) > 0 && !brigadesMap[shiftNum].activeLines.includes(lineHeader)) {
                    brigadesMap[shiftNum].activeLines.push(lineHeader);
                }
            }
        });

        // Строим смены
        const shifts = [];
        Object.values(brigadesMap).forEach(brigade => {
            const lineTasks = [];
            
            brigade.activeLines.forEach(activeLineName => {
                const templateName = Object.keys(lineTemplates || {}).find(t => isLineMatch(activeLineName, t));
                const positions = templateName ? (lineTemplates[templateName] || []) : [];
                const tasksForLine = [];

                positions.forEach(pos => {
                    const assignedNamesStr = pos?.roster?.[brigade.id];
                    const assignedNamesList = assignedNamesStr
                        ? assignedNamesStr.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1)
                        : [];
                    const totalSlots = Math.max(pos.count || 1, assignedNamesList.length);

                    for (let i = 0; i < totalSlots; i++) {
                        const slotId = `${date}_${brigade.id}_${activeLineName}_${pos.role}_${i}`;
                        const currentWorkerName = assignedNamesList[i] || null;
                        const manual = manualAssignments?.[slotId];
                        
                        let status = currentWorkerName ? 'filled' : 'vacancy';
                        if (manual) status = manual.type === 'vacancy' ? 'vacancy' : 'manual';

                        tasksForLine.push({
                            status,
                            roleTitle: pos.role,
                            slotId,
                            currentWorkerName,
                            assigned: manual || (status === 'filled' ? { name: currentWorkerName } : null)
                        });
                    }
                });

                if (tasksForLine.length > 0) {
                    lineTasks.push({ slots: tasksForLine, displayName: templateName || activeLineName });
                }
            });

            if (lineTasks.length > 0) {
                shifts.push({
                    id: brigade.id,
                    name: brigade.name,
                    type: brigade.type,
                    lineTasks
                });
            }
        });

        return shifts;
    };

    // useMemo для агрегации данных сотрудников со статистикой
    const employeesWithStats = useMemo(() => {
        const operationalPlan = savedPlans?.find(p => p.type === 'Operational');
        if (!operationalPlan?.data) {
            // Если нет оперативного плана, возвращаем базовую информацию с данными из factData
            const employeesMap = new Map();
            
            Object.values(workerRegistry || {}).forEach(worker => {
                if (!worker || !worker.name) return;
                const normName = normalizeName(worker.name);
                employeesMap.set(normName, {
                    name: worker.name,
                    role: worker.role || 'Не указано',
                    department: allEmployees[normName]?.department || '',
                    shiftsCount: 0,
                    rvCount: 0,
                    errorCount: 0,
                    hoursTotal: 0,
                    events: []
                });
            });

            if (factData && typeof factData === 'object' && Object.keys(factData).length > 0) {
                Object.values(factData).forEach(dateData => {
                    if (!dateData || typeof dateData !== 'object') return;
                    Object.values(dateData).forEach(entry => {
                        if (entry && entry.rawName) {
                            const normName = normalizeName(entry.rawName);
                            if (!employeesMap.has(normName)) {
                                employeesMap.set(normName, {
                                    name: entry.rawName,
                                    role: 'Не указано',
                                    department: allEmployees[normName]?.department || '',
                                    shiftsCount: 0,
                                    rvCount: 0,
                                    errorCount: 0,
                                    hoursTotal: 0,
                                    events: []
                                });
                            }
                        }
                    });
                });

                // Добавляем события из factData
                employeesMap.forEach((employee, normName) => {
                    const events = [];
                    let errorCount = 0;
                    let totalMinutes = 0;

                    Object.keys(factData).sort().forEach(date => {
                        let factEntry = factData[date]?.[normName];
                        if (!factEntry && factData[date]) {
                            Object.values(factData[date]).forEach(entry => {
                                if (entry && entry.rawName && matchNames(entry.rawName, employee.name)) {
                                    factEntry = entry;
                                }
                            });
                        }

                        const factStatus = validateFactEntry(factEntry);
                        if (factStatus === 'incomplete') {
                            errorCount++;
                        }

                        let duration = null;
                        if (factEntry) {
                            const exitTime = factEntry.nextDayExit || factEntry.exitTime;
                            if (factEntry.entryTime && exitTime) {
                                duration = calculateHours(factEntry.entryTime, exitTime);
                                if (duration) {
                                    totalMinutes += duration.totalMinutes;
                                }
                            }
                        }

                        events.push({
                            date,
                            planInfo: null,
                            factInfo: factEntry || null,
                            duration,
                            status: factStatus
                        });
                    });

                    employee.errorCount = errorCount;
                    employee.hoursTotal = totalMinutes;
                    employee.events = events;
                });
            }

            return Array.from(employeesMap.values());
        }

        const scheduleDates = operationalPlan.data.scheduleDates || [];
        const employeesMap = new Map();

        // Собираем уникальный список сотрудников
        Object.values(workerRegistry || {}).forEach(worker => {
            if (!worker || !worker.name) return;
            const normName = normalizeName(worker.name);
            employeesMap.set(normName, {
                name: worker.name,
                role: worker.role || 'Не указано',
                department: allEmployees[normName]?.department || '',
                shiftsCount: 0,
                rvCount: 0,
                errorCount: 0,
                hoursTotal: 0,
                events: []
            });
        });

        if (factData && typeof factData === 'object' && Object.keys(factData).length > 0) {
            Object.values(factData).forEach(dateData => {
                if (!dateData || typeof dateData !== 'object') return;
                Object.values(dateData).forEach(entry => {
                    if (entry && entry.rawName) {
                        const normName = normalizeName(entry.rawName);
                        if (!employeesMap.has(normName)) {
                            employeesMap.set(normName, {
                                name: entry.rawName,
                                role: 'Не указано',
                                department: allEmployees[normName]?.department || '',
                                shiftsCount: 0,
                                rvCount: 0,
                                errorCount: 0,
                                hoursTotal: 0,
                                events: []
                            });
                        }
                    }
                });
            });
        }

        // Для каждого сотрудника вычисляем статистику
        employeesMap.forEach((employee, normName) => {
            const events = [];
            let shiftsCount = 0;
            let rvCount = 0;
            let errorCount = 0;
            let totalMinutes = 0;

            scheduleDates.forEach(date => {
                const shifts = getShiftsFromSavedPlan(operationalPlan, date);
                let hasPlanAssignment = false;
                let planInfo = null;

                // Ищем назначения в плане
                shifts.forEach(shift => {
                    shift.lineTasks.forEach(task => {
                        task.slots.forEach(slot => {
                            if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                                const assignedName = slot.assigned.name;
                                if (normalizeName(assignedName) === normName || matchNames(assignedName, employee.name)) {
                                    hasPlanAssignment = true;
                                    const isRv = slot.assigned.type === 'external';
                                    if (isRv) {
                                        rvCount++;
                                    } else {
                                        shiftsCount++;
                                    }
                                    planInfo = {
                                        shiftId: shift.id,
                                        shiftName: shift.name,
                                        lineName: task.displayName,
                                        role: slot.roleTitle,
                                        isRv
                                    };
                                }
                            }
                        });
                    });
                });

                // Получаем данные СКУД (ищем по нормализованному имени или по совпадению)
                let factEntry = factData?.[date]?.[normName];
                if (!factEntry && factData?.[date]) {
                    // Пробуем найти по совпадению имен
                    const dateData = factData[date];
                    Object.values(dateData).forEach(entry => {
                        if (entry && entry.rawName && matchNames(entry.rawName, employee.name)) {
                            factEntry = entry;
                        }
                    });
                }
                const factStatus = validateFactEntry(factEntry);
                
                if (factStatus === 'incomplete') {
                    errorCount++;
                }

                // Вычисляем длительность
                let duration = null;
                if (factEntry) {
                    const exitTime = factEntry.nextDayExit || factEntry.exitTime;
                    if (factEntry.entryTime && exitTime) {
                        duration = calculateHours(factEntry.entryTime, exitTime);
                        if (duration) {
                            totalMinutes += duration.totalMinutes;
                        }
                    }
                }

                events.push({
                    date,
                    planInfo: hasPlanAssignment ? planInfo : null,
                    factInfo: factEntry || null,
                    duration,
                    status: factStatus
                });
            });

            employee.shiftsCount = shiftsCount;
            employee.rvCount = rvCount;
            employee.errorCount = errorCount;
            employee.hoursTotal = totalMinutes;
            employee.events = events.sort((a, b) => {
                const [dA, mA] = a.date.split('.');
                const [dB, mB] = b.date.split('.');
                return new Date(2024, parseInt(mA) - 1, parseInt(dA)) - new Date(2024, parseInt(mB) - 1, parseInt(dB));
            });
        });

        return Array.from(employeesMap.values());
    }, [savedPlans, workerRegistry, factData, allEmployees]);

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

    const toggleEmployee = (normName) => {
        setExpandedEmployees(prev => {
            const newSet = new Set(prev);
            if (newSet.has(normName)) {
                newSet.delete(normName);
            } else {
                newSet.add(normName);
            }
            return newSet;
        });
    };

    // Собираем уникальные роли для фильтра
    const allRoles = useMemo(() => {
        const rolesSet = new Set();
        employeesWithStats.forEach(emp => {
            if (emp.role && emp.role !== 'Не указано') {
                rolesSet.add(emp.role);
            }
        });
        return Array.from(rolesSet).sort();
    }, [employeesWithStats]);

    // Проверка принадлежности к бригаде
    const hasBrigadeAssignment = (employee, brigadeId) => {
        if (!employee.events || employee.events.length === 0) return false;
        return employee.events.some(event => 
            event.planInfo && event.planInfo.shiftId === brigadeId
        );
    };

    // Проверка наличия факта
    const hasFact = (employee) => {
        if (!employee.events || employee.events.length === 0) return false;
        return employee.events.some(event => event.factInfo !== null);
    };

    const matchesSearch = (employee, query) => {
        if (!query) return true;
        const searchLower = query.toLowerCase();
        return (
            employee.name.toLowerCase().includes(searchLower) ||
            employee.role.toLowerCase().includes(searchLower) ||
            employee.department.toLowerCase().includes(searchLower)
        );
    };

    const matchesRole = (employee, role) => {
        if (role === 'all') return true;
        return employee.role === role;
    };

    const matchesBrigade = (employee, brigadeId) => {
        if (brigadeId === 'all') return true;
        return hasBrigadeAssignment(employee, brigadeId);
    };

    const matchesStatus = (employee, status) => {
        if (status === 'all') return true;
        switch (status) {
            case 'errors':
                return employee.errorCount > 0;
            case 'rv':
                return employee.rvCount > 0;
            case 'working':
                return employee.shiftsCount > 0;
            case 'idle':
                return employee.shiftsCount === 0 && !hasFact(employee);
            default:
                return true;
        }
    };

    const filterCounts = useMemo(() => {
        const roles = {};
        const brigades = { '1': 0, '2': 0, '3': 0, '4': 0 };
        const statuses = { errors: 0, rv: 0, working: 0, idle: 0 };

        const baseList = employeesWithStats.filter(emp => matchesSearch(emp, search));

        const listForRoles = baseList.filter(emp => (
            matchesBrigade(emp, filterBrigade) && matchesStatus(emp, filterStatus)
        ));

        listForRoles.forEach(emp => {
            if (emp.role && emp.role !== 'Не указано') {
                roles[emp.role] = (roles[emp.role] || 0) + 1;
            }
        });

        const listForBrigades = baseList.filter(emp => (
            matchesRole(emp, filterRole) && matchesStatus(emp, filterStatus)
        ));

        ['1', '2', '3', '4'].forEach(brigadeId => {
            brigades[brigadeId] = listForBrigades.filter(emp => matchesBrigade(emp, brigadeId)).length;
        });

        const listForStatuses = baseList.filter(emp => (
            matchesRole(emp, filterRole) && matchesBrigade(emp, filterBrigade)
        ));

        statuses.errors = listForStatuses.filter(emp => matchesStatus(emp, 'errors')).length;
        statuses.rv = listForStatuses.filter(emp => matchesStatus(emp, 'rv')).length;
        statuses.working = listForStatuses.filter(emp => matchesStatus(emp, 'working')).length;
        statuses.idle = listForStatuses.filter(emp => matchesStatus(emp, 'idle')).length;

        const total = baseList.filter(emp => (
            matchesRole(emp, filterRole) &&
            matchesBrigade(emp, filterBrigade) &&
            matchesStatus(emp, filterStatus)
        )).length;

        return {
            roles,
            brigades,
            statuses,
            total
        };
    }, [employeesWithStats, search, filterRole, filterBrigade, filterStatus]);

    const filteredEmployees = useMemo(() => {
        return employeesWithStats.filter(emp => (
            matchesSearch(emp, search) &&
            matchesRole(emp, filterRole) &&
            matchesBrigade(emp, filterBrigade) &&
            matchesStatus(emp, filterStatus)
        ));
    }, [employeesWithStats, search, filterRole, filterBrigade, filterStatus]);

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

            <div className="flex-1 overflow-auto p-6">
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
                    </div>
                </div>

                <div className="space-y-3">
                    {filteredEmployees.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center text-slate-400">
                            {employeesWithStats.length === 0 
                                ? 'Загрузите данные из Плана или СКУД для отображения сотрудников'
                                : hasActiveFilters
                                    ? 'Нет сотрудников с выбранными критериями'
                                    : 'Ничего не найдено'}
                        </div>
                    ) : (
                        filteredEmployees.map(emp => {
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
                </div>
            </div>
        </div>
    );
};

export default React.memo(AllEmployeesView);

import React, { useState, useEffect, useMemo } from 'react';
import { Users, Search, Edit3, Check, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { STORAGE_KEYS, saveToLocalStorage, loadFromLocalStorage, normalizeName, matchNames } from '../../utils';

const AllEmployeesView = () => {
    const {
        workerRegistry,
        factData
    } = useData();

    const [allEmployees, setAllEmployees] = useState({});
    const [search, setSearch] = useState('');
    const [editingDepartment, setEditingDepartment] = useState(null);
    const [departmentInput, setDepartmentInput] = useState('');
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
            Object.values(workerRegistry).forEach(worker => {
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
            if (factData) {
                Object.values(factData).forEach(dateData => {
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
                                // Если сотрудник уже есть, но источник был только План, добавляем СКУД
                                if (updated[normName].source === 'План') {
                                    updated[normName].source = 'План/СКУД';
                                    changed = true;
                                }
                                // Обновляем роль из реестра, если есть
                                const regEntry = Object.values(workerRegistry).find(w => 
                                    normalizeName(w.name) === normName || matchNames(w.name, entry.rawName)
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

    const filteredEmployees = useMemo(() => {
        const employees = Object.values(allEmployees);
        if (!search) return employees;
        const searchLower = search.toLowerCase();
        return employees.filter(emp => 
            emp.name.toLowerCase().includes(searchLower) ||
            emp.role.toLowerCase().includes(searchLower) ||
            emp.department.toLowerCase().includes(searchLower)
        );
    }, [allEmployees, search]);

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                        <Users size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Все сотрудники</h2>
                        <p className="text-xs text-slate-500 mt-1">База данных всех сотрудников из Плана и СКУД</p>
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-3 border-b">ФИО</th>
                                    <th className="px-6 py-3 border-b">Текущая должность</th>
                                    <th className="px-6 py-3 border-b">Отделение</th>
                                    <th className="px-6 py-3 border-b">Источник</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="text-center py-10 text-slate-400">
                                            {Object.keys(allEmployees).length === 0 
                                                ? 'Загрузите данные из Плана или СКУД для отображения сотрудников'
                                                : 'Ничего не найдено'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEmployees.map(emp => {
                                        const normName = normalizeName(emp.name);
                                        const isEditing = editingDepartment === normName;
                                        
                                        return (
                                            <tr key={normName} className="hover:bg-slate-50 group">
                                                <td className="px-6 py-3 font-medium text-slate-800">{emp.name}</td>
                                                <td className="px-6 py-3 text-slate-600">{emp.role}</td>
                                                <td className="px-6 py-3">
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
                                                                className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
                                                                onClick={() => startEditing(normName, emp.department)}
                                                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                                title="Редактировать отделение"
                                                            >
                                                                <Edit3 size={14} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                                                        emp.source === 'План' ? 'bg-blue-100 text-blue-700' :
                                                        emp.source === 'СКУД' ? 'bg-orange-100 text-orange-700' :
                                                        'bg-purple-100 text-purple-700'
                                                    }`}>
                                                        {emp.source}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AllEmployeesView;

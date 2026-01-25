// src/VerificationView.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
    FileCheck, Calendar, Trash2, Search, Filter, 
    CheckCircle2, AlertCircle, UserPlus, XCircle, Plus, Clock, AlertTriangle
} from 'lucide-react';
import { 
    STORAGE_KEYS, loadFromLocalStorage, saveToLocalStorage, 
    normalizeName, parseCellStrict, matchNames 
} from './utils';

export const VerificationView = ({ getShiftsForDate, workerRegistry, factData, setFactData, factDates, setFactDates }) => {
    const [selectedDate, setSelectedDate] = useState(factDates && factDates.length > 0 ? factDates[0] : '');
    const [isLoading, setIsLoading] = useState(false);
    const fileRef = useRef(null);
    const isMountedRef = useRef(true);

    const [statusFilter, setStatusFilter] = useState('all'); 
    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [allEmployeesData, setAllEmployeesData] = useState({});
    const [visibleCount, setVisibleCount] = useState(50);

    useEffect(() => {
        isMountedRef.current = true;
        const saved = loadFromLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, {});
        setAllEmployeesData(saved);
        
        const handleFocus = () => {
            if (!isMountedRef.current || document.hidden) return;
            const updated = loadFromLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, {});
            setAllEmployeesData(updated);
        };
        
        window.addEventListener('focus', handleFocus);
        return () => {
            isMountedRef.current = false;
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsLoading(true);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                let dateRowIndex = -1;
                let foundDates = [];
                for (let i = 0; i < Math.min(10, data.length); i++) {
                    const row = data[i];
                    const datesInRow = [];
                    row.forEach((cell, colIdx) => {
                        if (typeof cell === 'string' && cell.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                            datesInRow.push({ date: cell, colIdx });
                        }
                    });
                    if (datesInRow.length > 0) {
                        dateRowIndex = i;
                        foundDates = datesInRow;
                        break;
                    }
                }

                if (dateRowIndex === -1) {
                    alert('Не удалось найти даты в файле (формат ДД.ММ.ГГГГ)');
                    setIsLoading(false);
                    return;
                }

                const parsedFact = {};
                foundDates.forEach(d => parsedFact[d.date] = {});
                const timelineData = {};

                for (let i = dateRowIndex + 1; i < data.length; i++) {
                    const row = data[i];
                    let name = row[3] || row[2];
                    if (name && typeof name === 'string' && name.length > 3) {
                        const normName = normalizeName(name);
                        if (!timelineData[normName]) timelineData[normName] = { rawName: name, events: [] };
                        foundDates.forEach(({ date, colIdx }) => {
                            timelineData[normName].events.push({ date, val: row[colIdx] });
                        });
                    }
                }

                Object.values(timelineData).forEach(({ rawName, events }) => {
                    const normName = normalizeName(rawName);
                    let pendingShift = null;
                    events.forEach((event) => {
                        const { date, val } = event;
                        const { inTime, outTime } = parseCellStrict(val);
                        if (!parsedFact[date]) parsedFact[date] = {};

                        if (pendingShift) {
                            if (outTime) {
                                parsedFact[pendingShift.date][normName] = {
                                    rawName,
                                    time: `${pendingShift.time} → ${outTime} (+1)`,
                                    cleanTime: `${pendingShift.time} → ${outTime} (+1)`,
                                    entryTime: pendingShift.time,
                                    exitTime: null,
                                    hasOvernightShift: true,
                                    nextDayExit: outTime,
                                    nextDayDate: date,
                                    primaryDate: pendingShift.date
                                };
                                pendingShift = null;
                            }
                            if (inTime) pendingShift = { time: inTime, date: date };
                            return;
                        }

                        if (inTime && outTime) {
                            parsedFact[date][normName] = { rawName, time: `${inTime} → ${outTime}`, cleanTime: `${inTime} → ${outTime}`, entryTime: inTime, exitTime: outTime, hasOvernightShift: false };
                        } else if (inTime) {
                            pendingShift = { time: inTime, date: date };
                            parsedFact[date][normName] = { rawName, time: `Вход: ${inTime}...`, cleanTime: `Вход: ${inTime}`, entryTime: inTime, exitTime: null, hasOvernightShift: true };
                        }
                    });
                });

                setFactData(parsedFact);
                const datesArr = foundDates.map(d => d.date);
                setFactDates(datesArr);
                saveToLocalStorage(STORAGE_KEYS.FACT_DATA, parsedFact);
                saveToLocalStorage(STORAGE_KEYS.FACT_DATES, datesArr);
                if (datesArr.length > 0) setSelectedDate(datesArr[0]);
            } catch (err) {
                console.error(err);
                alert('Ошибка чтения файла');
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const departmentIndex = useMemo(() => {
        const index = new Map();
        const fuzzyIndex = [];
        Object.values(allEmployeesData).forEach(emp => {
            const normName = normalizeName(emp.name);
            if (emp.department) {
                index.set(normName, emp.department);
                fuzzyIndex.push({ normName, name: emp.name, department: emp.department });
            }
        });
        return { exact: index, fuzzy: fuzzyIndex };
    }, [allEmployeesData]);

    const getDepartment = useCallback((name) => {
        const normName = normalizeName(name);
        const exactDept = departmentIndex.exact.get(normName);
        if (exactDept) return exactDept;
        for (const emp of departmentIndex.fuzzy) {
            if (matchNames(emp.name, name)) return emp.department;
        }
        return '';
    }, [departmentIndex]);

    const factMap = useMemo(() => {
        if (!selectedDate || !factData || !factData[selectedDate]) return null;
        const dayFact = factData[selectedDate];
        const byNormKey = new Map();
        const byNormRawName = new Map();
        const allEntries = [];
        Object.entries(dayFact).forEach(([key, value]) => {
            if (!value) return;
            const normKey = normalizeName(key);
            byNormKey.set(normKey, value);
            if (value.rawName) {
                const normRawName = normalizeName(value.rawName);
                byNormRawName.set(normRawName, value);
                allEntries.push({ key, value, normKey, normRawName });
            }
        });
        return { byNormKey, byNormRawName, allEntries };
    }, [selectedDate, factData]);

    const workerRegistryMap = useMemo(() => {
        const map = new Map();
        Object.values(workerRegistry).forEach(worker => {
            if (worker?.name) map.set(normalizeName(worker.name), worker);
        });
        return map;
    }, [workerRegistry]);

    const comparisonResult = useMemo(() => {
        if (!selectedDate || !factData || !factData[selectedDate] || !factMap) return [];
        const shifts = getShiftsForDate(selectedDate);
        const dayFact = factData[selectedDate];
        const result = [];
        const processedFactNames = new Set();

        shifts.forEach(shift => {
            shift.lineTasks.forEach(task => {
                task.slots.forEach(slot => {
                    if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                        const planName = slot.assigned.name;
                        const normName = normalizeName(planName);
                        let factEntry = factMap.byNormKey.get(normName) || factMap.byNormRawName.get(normName);
                        if (!factEntry) {
                            for (const { value } of factMap.allEntries) {
                                if (value.rawName && matchNames(planName, value.rawName)) {
                                    factEntry = value; break;
                                }
                            }
                        }
                        if (factEntry?.rawName) processedFactNames.add(normalizeName(factEntry.rawName));
                        
                        let status = !factEntry?.cleanTime ? 'missing' : 'ok';
                        let timeDisplay = factEntry ? (factEntry.hasOvernightShift && factEntry.nextDayExit ? `${factEntry.entryTime} → ${factEntry.nextDayExit} (+1)` : (factEntry.entryTime && !factEntry.exitTime ? `Вход: ${factEntry.entryTime}${factEntry.hasOvernightShift ? ' (ночная)' : ''}` : factEntry.time)) : '-';

                        result.push({
                            name: planName, role: slot.roleTitle, shift: shift.name, line: task.displayName,
                            plan: true, fact: !!factEntry?.cleanTime, time: timeDisplay, status,
                            details: slot.assigned, timeInfo: factEntry, department: getDepartment(planName)
                        });
                    }
                });
            });
        });

        Object.values(dayFact).forEach(entry => {
            if (!entry?.rawName) return;
            const normName = normalizeName(entry.rawName);
            let wasProcessed = processedFactNames.has(normName);
            if (!wasProcessed) {
                for (const pName of processedFactNames) {
                    if (matchNames(entry.rawName, factMap.byNormRawName.get(pName)?.rawName)) { wasProcessed = true; break; }
                }
            }

            if (!wasProcessed && entry.cleanTime) {
                let regEntry = workerRegistryMap.get(normName);
                if (!regEntry) {
                    for (const worker of workerRegistryMap.values()) {
                        if (matchNames(worker.name, entry.rawName)) { regEntry = worker; break; }
                    }
                }
                result.push({
                    name: entry.rawName, role: regEntry ? regEntry.role : 'Неизвестно', shift: '-', line: '-',
                    plan: false, fact: true, time: entry.time, status: 'unexpected', details: regEntry, department: getDepartment(entry.rawName), timeInfo: entry
                });
            }
        });
        return result;
    }, [selectedDate, factData, getShiftsForDate, factMap, workerRegistryMap, getDepartment]);

    const stats = {
        total: comparisonResult.length,
        ok: comparisonResult.filter(r => r.status === 'ok').length,
        missing: comparisonResult.filter(r => r.status === 'missing').length,
        unexpected: comparisonResult.filter(r => r.status === 'unexpected').length
    };

    const filteredResult = useMemo(() => {
        return comparisonResult.filter(r => {
            if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (departmentFilter !== 'all') {
                const rDept = r.department || 'Нераспределенные';
                if (departmentFilter === 'Нераспределенные') return !r.department;
                if (rDept !== departmentFilter) return false;
            }
            return true;
        });
    }, [comparisonResult, search, statusFilter, departmentFilter]);

    const visibleData = useMemo(() => {
        if (departmentFilter !== 'all') return { type: 'flat', data: filteredResult.slice(0, visibleCount), total: filteredResult.length };
        const grouped = {};
        filteredResult.forEach(r => {
            const d = r.department || 'Нераспределенные';
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push(r);
        });
        const allRows = [];
        Object.entries(grouped).sort(([a], [b]) => a === 'Нераспределенные' ? 1 : b === 'Нераспределенные' ? -1 : a.localeCompare(b))
            .forEach(([dept, rows]) => {
                allRows.push({ type: 'header', department: dept, count: rows.length });
                rows.forEach((row, i) => allRows.push({ type: 'row', row, department: dept, index: i }));
            });
        return { type: 'grouped', data: allRows.slice(0, visibleCount), total: allRows.length };
    }, [filteredResult, departmentFilter, visibleCount]);

    if (!factData) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-10">
                <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all text-slate-500">
                    <div className="bg-blue-100 p-4 rounded-full text-blue-600 mb-4"><FileCheck size={40} /></div>
                    <h3 className="text-xl font-bold text-slate-700 mb-2">Загрузить отчет СКУД</h3>
                    <p className="text-sm max-w-xs text-center mb-6">Загрузите файл .xls/.csv (выгрузка ЭНТ) для сверки фактических выходов с планом</p>
                    <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Выбрать файл</button>
                    <input type="file" ref={fileRef} onChange={handleFileUpload} className="hidden" accept=".csv, .xls, .xlsx" />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-700"><FileCheck size={24} /></div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Сверка факта</h2>
                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                            <span className="text-green-600 font-bold">Пришли: {stats.ok}</span>
                            <span className="text-red-500 font-bold">Прогулы: {stats.missing}</span>
                            <span className="text-orange-500 font-bold">Лишние: {stats.unexpected}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="pl-9 pr-8 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                            {factDates.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <button onClick={() => { setFactData(null); setFactDates([]); saveToLocalStorage(STORAGE_KEYS.FACT_DATA, null); saveToLocalStorage(STORAGE_KEYS.FACT_DATES, []); }} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={20} /></button>
                </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden p-6 max-w-[1400px] mx-auto w-full">
                <div className="mb-4 flex gap-4 flex-wrap">
                    <div className="relative flex-1 max-w-sm min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Поиск сотрудника..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
                    </div>
                    <div className="relative">
                        <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[180px]">
                            <option value="all">Все отделения</option>
                            {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            <option value="Нераспределенные">Нераспределенные</option>
                        </select>
                    </div>
                    <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                        {[{ id: 'all', l: 'Все' }, { id: 'ok', l: 'Совпадения' }, { id: 'missing', l: 'Прогулы' }, { id: 'unexpected', l: 'Вне плана' }].map(tab => (
                            <button key={tab.id} onClick={() => setStatusFilter(tab.id)} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${statusFilter === tab.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>{tab.l}</button>
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
                    <div className="overflow-auto h-full">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 z-10 shadow-sm">
                                <tr><th className="px-6 py-3 border-b">Сотрудник</th><th className="px-6 py-3 border-b">План (Смена)</th><th className="px-6 py-3 border-b">Факт (Время)</th><th className="px-6 py-3 border-b text-center">Статус</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleData.data.map((item, idx) => {
                                    if (item.type === 'header') return <tr key={`h-${item.department}`} className="bg-slate-100 sticky top-0 z-20"><td colSpan={4} className="px-6 py-2 font-bold text-slate-700 text-sm">{item.department} ({item.count})</td></tr>;
                                    const { row } = item;
                                    const statusBadge = row.status === 'ok' ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> Пришел</span> : row.status === 'missing' ? <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><XCircle size={12} /> Не пришел</span> : <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><AlertTriangle size={12} /> Не в смену</span>;
                                    return (
                                        <tr key={idx} className={`hover:bg-slate-50 transition-colors ${row.status === 'missing' ? 'bg-red-50/30' : row.status === 'unexpected' ? 'bg-orange-50/30' : ''}`}>
                                            <td className="px-6 py-3"><div className="font-bold text-slate-700">{row.name}</div><div className="text-xs text-slate-500">{row.role}</div></td>
                                            <td className="px-6 py-3">{row.plan ? <div><div className="font-semibold">{row.line}</div><div className="text-xs">Бригада {row.shift}</div></div> : <span className="text-slate-400 italic">Вне плана</span>}</td>
                                            <td className="px-6 py-3"><div className={`font-mono text-sm px-2 py-1 rounded inline-block border ${row.timeInfo?.hasOvernightShift ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{row.time}</div></td>
                                            <td className="px-6 py-3 text-center">{statusBadge}</td>
                                        </tr>
                                    );
                                })}
                                {visibleData.total > visibleCount && (
                                    <tr><td colSpan={4} className="px-6 py-4 text-center bg-slate-50"><button onClick={() => setVisibleCount(v => v + 50)} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2 mx-auto"><Plus size={16} /> Загрузить еще (+50)</button></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
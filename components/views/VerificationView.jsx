import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FileCheck, Upload, Loader2, Search, Filter, X, CheckCircle2, XCircle, Clock, AlertTriangle, Download, Calendar, Plus, Trash2, UserPlus, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useData } from '../../context/DataContext';
import { STORAGE_KEYS, saveToLocalStorage, loadFromLocalStorage, normalizeName, matchNames, parseCellStrict } from '../../utils';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';

const VerificationView = () => {
    const {
        getShiftsForDate,
        workerRegistry,
        factData,
        setFactData,
        factDates,
        setFactDates,
        viewMode
    } = useData();

    useRenderTime('verification', logPerformanceMetric, viewMode === 'verification');

    const [selectedDate, setSelectedDate] = useState(factDates && factDates.length > 0 ? factDates[0] : '');
    const [isLoading, setIsLoading] = useState(false);
    const fileRef = useRef(null);
    const isMountedRef = useRef(true);

    // Filter states
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [allEmployeesData, setAllEmployeesData] = useState({});
    const [visibleCount, setVisibleCount] = useState(50);
    const USE_VERIFICATION_WORKER = true;
    const [verificationWorkerResult, setVerificationWorkerResult] = useState(null);
    const [verificationWorkerStatus, setVerificationWorkerStatus] = useState({ status: 'idle', error: null, requestId: 0 });
    const verificationWorkerRef = useRef(null);
    const verificationWorkerReqIdRef = useRef(0);
    const ROW_HEIGHT_PX = 44;
    const OVERSCAN_ROWS = 10;
    const scrollRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(600);

    // Загружаем данные об отделениях из localStorage
    useEffect(() => {
        isMountedRef.current = true;
        const saved = loadFromLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, {});
        setAllEmployeesData(saved);
        
        const handleStorageChange = (e) => {
            if (e.key === STORAGE_KEYS.ALL_EMPLOYEES && isMountedRef.current) {
                const updated = loadFromLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, {});
                setAllEmployeesData(updated);
            }
        };
        
        window.addEventListener('storage', handleStorageChange);
        
        let focusTimeout;
        const handleFocus = () => {
            if (!isMountedRef.current || document.hidden) return;
            clearTimeout(focusTimeout);
            focusTimeout = setTimeout(() => {
                if (isMountedRef.current) {
                    const updated = loadFromLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, {});
                    setAllEmployeesData(updated);
                }
            }, 300);
        };
        
        const handleVisibilityChange = () => {
            if (!document.hidden && isMountedRef.current) {
                const updated = loadFromLocalStorage(STORAGE_KEYS.ALL_EMPLOYEES, {});
                setAllEmployeesData(updated);
            }
        };
        
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            isMountedRef.current = false;
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearTimeout(focusTimeout);
        };
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        if (typeof ResizeObserver === 'undefined') {
            setViewportHeight(el.clientHeight || 600);
            return;
        }

        const ro = new ResizeObserver(() => {
            setViewportHeight(el.clientHeight || 600);
        });
        ro.observe(el);
        setViewportHeight(el.clientHeight || 600);

        return () => ro.disconnect();
    }, []);

    const getSurnameNorm = useCallback((fullName) => {
        const first = String(fullName || '').trim().split(/\s+/)[0] || '';
        return normalizeName(first);
    }, []);

    const departmentCacheRef = useRef(new Map());

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsLoading(true);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
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
                    let name = row[3];
                    if (!name || name.length < 5) name = row[2];

                    if (name && typeof name === 'string' && name.length > 3) {
                        const normName = normalizeName(name);

                        if (!timelineData[normName]) {
                            timelineData[normName] = { rawName: name, events: [] };
                        }

                        foundDates.forEach(({ date, colIdx }) => {
                            const timeVal = row[colIdx];
                            timelineData[normName].events.push({ date, val: timeVal });
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
                            let exitForNightShift = outTime;

                            if (exitForNightShift) {
                                const shiftDate = pendingShift.date;
                                if (!parsedFact[shiftDate]) parsedFact[shiftDate] = {};

                                parsedFact[shiftDate][normName] = {
                                    rawName,
                                    time: `${pendingShift.time} → ${exitForNightShift} (+1)`,
                                    cleanTime: `${pendingShift.time} → ${exitForNightShift} (+1)`,
                                    entryTime: pendingShift.time,
                                    exitTime: null,
                                    hasOvernightShift: true,
                                    nextDayExit: exitForNightShift,
                                    nextDayDate: date,
                                    primaryDate: shiftDate
                                };

                                pendingShift = null;
                            }

                            if (inTime) {
                                pendingShift = { time: inTime, date: date };
                            }
                            return;
                        }

                        if (inTime && outTime) {
                            parsedFact[date][normName] = {
                                rawName,
                                time: `${inTime} → ${outTime}`,
                                cleanTime: `${inTime} → ${outTime}`,
                                entryTime: inTime,
                                exitTime: outTime,
                                hasOvernightShift: false
                            };
                            pendingShift = null;
                        } else if (inTime && !outTime) {
                            pendingShift = { time: inTime, date: date };

                            parsedFact[date][normName] = {
                                rawName,
                                time: `Вход: ${inTime}...`,
                                cleanTime: `Вход: ${inTime}`,
                                entryTime: inTime,
                                exitTime: null,
                                hasOvernightShift: true
                            };
                        }
                    });
                });

                setFactData(parsedFact);
                const dates = foundDates.map(d => d.date);
                setFactDates(dates);

                saveToLocalStorage(STORAGE_KEYS.FACT_DATA, parsedFact);
                saveToLocalStorage(STORAGE_KEYS.FACT_DATES, dates);

                if (dates.length > 0) setSelectedDate(dates[0]);

            } catch (err) {
                console.error(err);
                alert('Ошибка чтения файла');
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const employeesMap = useMemo(() => {
        const map = new Map();
        Object.values(allEmployeesData).forEach(emp => {
            const normName = normalizeName(emp.name);
            map.set(normName, emp);
            if (emp.name !== normName) {
                map.set(emp.name.toLowerCase(), emp);
            }
        });
        return map;
    }, [allEmployeesData]);

    const departmentIndex = useMemo(() => {
        const index = new Map();
        const fuzzyIndex = [];
        const bySurname = new Map();
        
        Object.values(allEmployeesData).forEach(emp => {
            const normName = normalizeName(emp.name);
            if (emp.department) {
                index.set(normName, emp.department);
                fuzzyIndex.push({ normName, name: emp.name, department: emp.department });
                const surname = getSurnameNorm(emp.name);
                if (!bySurname.has(surname)) bySurname.set(surname, []);
                bySurname.get(surname).push({ normName, name: emp.name, department: emp.department });
            }
        });
        
        return { exact: index, fuzzy: fuzzyIndex, bySurname };
    }, [allEmployeesData, getSurnameNorm]);

    useEffect(() => {
        departmentCacheRef.current = new Map();
    }, [departmentIndex]);

    const getDepartment = useCallback((name) => {
        const cacheKey = String(name || '');
        if (departmentCacheRef.current.has(cacheKey)) {
            return departmentCacheRef.current.get(cacheKey);
        }

        const normName = normalizeName(name);
        const exactDept = departmentIndex.exact.get(normName);
        if (exactDept) {
            departmentCacheRef.current.set(cacheKey, exactDept);
            return exactDept;
        }

        const surname = getSurnameNorm(name);
        const surnameCandidates = departmentIndex.bySurname.get(surname) || departmentIndex.fuzzy;
        for (const emp of surnameCandidates) {
            if (matchNames(emp.name, name)) {
                departmentCacheRef.current.set(cacheKey, emp.department);
                return emp.department;
            }
        }

        departmentCacheRef.current.set(cacheKey, '');
        return '';
    }, [departmentIndex, getSurnameNorm]);

    const factMap = useMemo(() => {
        if (!selectedDate || !factData || !factData[selectedDate]) return null;
        
        const dayFact = factData[selectedDate];
        const byNormKey = new Map();
        const byNormRawName = new Map();
        const bySurname = new Map();
        
        Object.entries(dayFact).forEach(([key, value]) => {
            if (!value) return;
            const normKey = normalizeName(key);
            byNormKey.set(normKey, value);
            
            if (value.rawName) {
                const normRawName = normalizeName(value.rawName);
                byNormRawName.set(normRawName, value);

                const surname = getSurnameNorm(value.rawName);
                if (!bySurname.has(surname)) bySurname.set(surname, []);
                bySurname.get(surname).push(value);
            }
        });
        
        return { byNormKey, byNormRawName, bySurname };
    }, [selectedDate, factData, getSurnameNorm]);

    const workerRegistryMap = useMemo(() => {
        const map = new Map();
        const bySurname = new Map();
        Object.values(workerRegistry).forEach(worker => {
            if (worker && worker.name) {
                const normName = normalizeName(worker.name);
                map.set(normName, worker);
                const surname = getSurnameNorm(worker.name);
                if (!bySurname.has(surname)) bySurname.set(surname, []);
                bySurname.get(surname).push(worker);
            }
        });
        return { byNorm: map, bySurname };
    }, [workerRegistry, getSurnameNorm]);

    const planEntries = useMemo(() => {
        if (!selectedDate || !factData || !factData[selectedDate]) return [];
        const shifts = getShiftsForDate(selectedDate);
        const rows = [];
        shifts.forEach(shift => {
            shift.lineTasks.forEach(task => {
                task.slots.forEach(slot => {
                    if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                        rows.push({
                            name: slot.assigned.name,
                            role: slot.roleTitle,
                            shift: shift.name,
                            line: task.displayName,
                            details: slot.assigned
                        });
                    }
                });
            });
        });
        return rows;
    }, [selectedDate, factData, getShiftsForDate]);

    useEffect(() => {
        if (!USE_VERIFICATION_WORKER) return;
        if (verificationWorkerRef.current) return;

        const worker = new Worker(new URL('../../verification.worker.js', import.meta.url), { type: 'module' });
        verificationWorkerRef.current = worker;

        worker.onmessage = (e) => {
            const { requestId, result, error } = e.data || {};
            if (!requestId || requestId !== verificationWorkerReqIdRef.current) return;
            if (error) {
                setVerificationWorkerStatus({ status: 'error', error: String(error), requestId });
                return;
            }
            setVerificationWorkerResult(result || null);
            setVerificationWorkerStatus({ status: 'ready', error: null, requestId });
        };

        worker.onerror = (err) => {
            setVerificationWorkerStatus((prev) => ({ ...prev, status: 'error', error: err?.message || 'Worker error' }));
        };

        return () => {
            try { worker.terminate(); } catch (_) {}
            verificationWorkerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!USE_VERIFICATION_WORKER) return;
        if (viewMode !== 'verification') return;
        const worker = verificationWorkerRef.current;
        if (!worker) return;
        if (!selectedDate || !factData || !factData[selectedDate]) return;

        const requestId = ++verificationWorkerReqIdRef.current;
        setVerificationWorkerStatus({ status: 'calculating', error: null, requestId });

        const workerRegistryForWorker = {};
        Object.entries(workerRegistry || {}).forEach(([key, value]) => {
            workerRegistryForWorker[key] = { name: value?.name || key, role: value?.role || '' };
        });

        worker.postMessage({
            requestId,
            payload: {
                selectedDate,
                planEntries,
                dayFact: factData[selectedDate],
                allEmployeesData,
                workerRegistry: workerRegistryForWorker
            }
        });
    }, [USE_VERIFICATION_WORKER, viewMode, selectedDate, factData, planEntries, allEmployeesData, workerRegistry]);

    const comparisonResult = useMemo(() => {
        if (USE_VERIFICATION_WORKER) return verificationWorkerResult?.comparisonResult || [];
        if (!selectedDate || !factData || !factData[selectedDate] || !factMap) return [];

        const shifts = getShiftsForDate(selectedDate);
        const dayFact = factData[selectedDate];
        const result = [];
        const processedFactNames = new Set();
        const processedBySurname = new Map();

        const markProcessed = (rawName) => {
            if (!rawName) return;
            const norm = normalizeName(rawName);
            processedFactNames.add(norm);
            const surname = getSurnameNorm(rawName);
            if (!processedBySurname.has(surname)) processedBySurname.set(surname, []);
            processedBySurname.get(surname).push(rawName);
        };

        const resolveFactEntry = (planName) => {
            const normNameForMatch = normalizeName(planName);
            let factEntry = factMap.byNormKey.get(normNameForMatch) ||
                            factMap.byNormRawName.get(normNameForMatch);
            if (factEntry) return factEntry;

            const surname = getSurnameNorm(planName);
            const candidates = factMap.bySurname.get(surname) || [];
            for (const candidate of candidates) {
                if (candidate?.rawName && matchNames(planName, candidate.rawName)) {
                    return candidate;
                }
            }

            return null;
        };

        shifts.forEach(shift => {
            shift.lineTasks.forEach(task => {
                task.slots.forEach(slot => {
                    if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                        const planName = slot.assigned.name;
                        const factEntry = resolveFactEntry(planName);
                        if (factEntry?.rawName) markProcessed(factEntry.rawName);

                        let status = 'ok';
                        let timeDisplay = factEntry ? factEntry.time : '-';

                        if (!factEntry || !factEntry.cleanTime) {
                            status = 'missing';
                        } else if (factEntry.hasOvernightShift && factEntry.nextDayExit) {
                            status = 'ok';
                            timeDisplay = `${factEntry.entryTime} → ${factEntry.nextDayExit} (+1)`;
                        } else if (factEntry.hasOvernightShift) {
                            status = 'ok';
                            timeDisplay = `Вход: ${factEntry.entryTime} (ночная)`;
                        } else if (factEntry.entryTime && !factEntry.exitTime) {
                            status = 'ok';
                            timeDisplay = `Вход: ${factEntry.entryTime}`;
                        } else if (factEntry.entryTime && factEntry.exitTime) {
                            status = 'ok';
                            timeDisplay = `${factEntry.entryTime} → ${factEntry.exitTime}`;
                        } else {
                            status = 'ok';
                            timeDisplay = factEntry.time;
                        }

                        const department = getDepartment(planName);

                        result.push({
                            name: planName,
                            role: slot.roleTitle,
                            shift: shift.name,
                            line: task.displayName,
                            plan: true,
                            fact: !!(factEntry && factEntry.cleanTime),
                            time: timeDisplay,
                            status,
                            details: slot.assigned,
                            timeInfo: factEntry,
                            department
                        });
                    }
                });
            });
        });

        Object.values(dayFact).forEach(entry => {
            if (!entry || !entry.rawName) return;

            const normName = normalizeName(entry.rawName);
            
            let wasProcessed = processedFactNames.has(normName);
            
            if (!wasProcessed) {
                const surname = getSurnameNorm(entry.rawName);
                const processedCandidates = processedBySurname.get(surname) || [];
                for (const processedName of processedCandidates) {
                    if (matchNames(entry.rawName, processedName)) {
                        wasProcessed = true;
                        break;
                    }
                }
            }

            if (!wasProcessed && entry.cleanTime) {
                let regEntry = workerRegistryMap.byNorm.get(normName);
                
                if (!regEntry) {
                    const surname = getSurnameNorm(entry.rawName);
                    const candidates = workerRegistryMap.bySurname.get(surname) || [];
                    for (const worker of candidates) {
                        if (matchNames(worker.name, entry.rawName)) {
                            regEntry = worker;
                            break;
                        }
                    }
                }

                let timeDisplay = entry.time;
                if (entry.hasOvernightShift && entry.nextDayExit) {
                    timeDisplay = `${entry.entryTime} → ${entry.nextDayExit} (+1)`;
                } else if (entry.hasOvernightShift) {
                    timeDisplay = `Вход: ${entry.entryTime} (ночная)`;
                } else if (entry.entryTime && entry.exitTime) {
                    timeDisplay = `${entry.entryTime} → ${entry.exitTime}`;
                } else if (entry.entryTime && !entry.exitTime) {
                    timeDisplay = `Вход: ${entry.entryTime}`;
                }

                const department = getDepartment(entry.rawName);

                result.push({
                    name: entry.rawName,
                    role: regEntry ? regEntry.role : 'Неизвестно',
                    shift: '-',
                    line: '-',
                    plan: false,
                    fact: true,
                    time: timeDisplay,
                    status: 'unexpected',
                    details: regEntry,
                    timeInfo: entry,
                    department
                });
            }
        });

        return result;
    }, [USE_VERIFICATION_WORKER, verificationWorkerResult, selectedDate, factData, getShiftsForDate, factMap, workerRegistryMap, getDepartment]);

    useEffect(() => {
        setVisibleCount(50);
    }, [search, statusFilter, selectedDate, departmentFilter]);

    const filteredResult = useMemo(() => {
        let result = comparisonResult.filter(r => {
            if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
            if (statusFilter === 'ok' && r.status !== 'ok') return false;
            if (statusFilter === 'missing' && r.status !== 'missing') return false;
            if (statusFilter === 'unexpected' && r.status !== 'unexpected') return false;
            if (departmentFilter !== 'all') {
                if (departmentFilter === 'Нераспределенные') {
                    if (r.department) return false;
                } else {
                    if (r.department !== departmentFilter) return false;
                }
            }
            return true;
        });

        if (departmentFilter !== 'all') {
            return result;
        }

        const grouped = {};
        result.forEach(r => {
            const dept = r.department || 'Нераспределенные';
            if (!grouped[dept]) {
                grouped[dept] = [];
            }
            grouped[dept].push(r);
        });
        return grouped;
    }, [comparisonResult, search, statusFilter, departmentFilter]);

    const visibleData = useMemo(() => {
        if (departmentFilter === 'all') {
            const allRows = [];
            Object.entries(filteredResult).sort(([deptA], [deptB]) => {
                if (deptA === 'Нераспределенные') return 1;
                if (deptB === 'Нераспределенные') return -1;
                return deptA.localeCompare(deptB);
            }).forEach(([department, rows]) => {
                allRows.push({ type: 'header', department, count: rows.length });
                rows.forEach((row, i) => {
                    allRows.push({ type: 'row', row, department, index: i });
                });
            });
            return { type: 'grouped', data: allRows.slice(0, visibleCount), total: allRows.length };
        } else {
            return { type: 'flat', data: filteredResult.slice(0, visibleCount), total: filteredResult.length };
        }
    }, [filteredResult, departmentFilter, visibleCount]);

    const windowedData = useMemo(() => {
        const total = visibleData.data.length;
        const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS);
        const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT_PX) + OVERSCAN_ROWS);
        const paddingTop = start * ROW_HEIGHT_PX;
        const paddingBottom = Math.max(0, (total - end) * ROW_HEIGHT_PX);
        return { start, end, paddingTop, paddingBottom, items: visibleData.data.slice(start, end) };
    }, [visibleData.data, scrollTop, viewportHeight]);

    const departments = useMemo(() => {
        const deptSet = new Set();
        comparisonResult.forEach(r => {
            if (r.department) {
                deptSet.add(r.department);
            }
        });
        return Array.from(deptSet).sort();
    }, [comparisonResult]);

    const stats = {
        total: comparisonResult.length,
        ok: comparisonResult.filter(r => r.status === 'ok').length,
        missing: comparisonResult.filter(r => r.status === 'missing').length,
        unexpected: comparisonResult.filter(r => r.status === 'unexpected').length
    };

    if (!factData) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-10">
                <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all text-slate-500"
                >
                    <div className="bg-blue-100 p-4 rounded-full text-blue-600 mb-4">
                        <FileCheck size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 mb-2">Загрузить отчет СКУД</h3>
                    <p className="text-sm max-w-xs text-center mb-6">Загрузите файл .xls/.csv (выгрузка ЭНТ) для сверки фактических выходов с планом</p>
                    <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Выбрать файл'}
                    </button>
                    <input type="file" ref={fileRef} onChange={handleFileUpload} className="hidden" accept=".csv, .xls, .xlsx" />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                        <FileCheck size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Сверка факта</h2>
                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                            <span className="flex items-center gap-1 text-green-600 font-bold"><CheckCircle2 size={12} /> Пришли: {stats.ok}</span>
                            <span className="flex items-center gap-1 text-red-500 font-bold"><AlertCircle size={12} /> Прогулы: {stats.missing}</span>
                            <span className="flex items-center gap-1 text-orange-500 font-bold"><UserPlus size={12} /> Лишние: {stats.unexpected}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="pl-9 pr-8 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {factDates.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    {USE_VERIFICATION_WORKER && verificationWorkerStatus.status === 'calculating' && (
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin" />
                            Идёт расчёт…
                        </div>
                    )}
                    {USE_VERIFICATION_WORKER && verificationWorkerStatus.status === 'error' && (
                        <div className="text-xs text-red-500">
                            Ошибка расчёта: {verificationWorkerStatus.error || 'неизвестная ошибка'}
                        </div>
                    )}
                    <div className="h-8 w-px bg-slate-200"></div>
                    <button onClick={() => {
                        setFactData(null);
                        setFactDates([]);
                        saveToLocalStorage(STORAGE_KEYS.FACT_DATA, null);
                        saveToLocalStorage(STORAGE_KEYS.FACT_DATES, []);
                    }} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Сбросить файл">
                        <Trash2 size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden p-6 max-w-[1400px] mx-auto w-full">
                <div className="mb-4 flex gap-4 flex-wrap">
                    <div className="relative flex-1 max-w-sm min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск сотрудника..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                        />
                    </div>
                    <div className="relative">
                        <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                            value={departmentFilter}
                            onChange={e => setDepartmentFilter(e.target.value)}
                            className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[180px]"
                        >
                            <option value="all">Все отделения</option>
                            {departments.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                            <option value="Нераспределенные">Нераспределенные</option>
                        </select>
                    </div>
                    <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                        {[{ id: 'all', l: 'Все' }, { id: 'ok', l: 'Совпадения' }, { id: 'missing', l: 'Прогулы' }, { id: 'unexpected', l: 'Вне плана' }].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setStatusFilter(tab.id)}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${statusFilter === tab.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                            >
                                {tab.l}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
                    <div
                        ref={scrollRef}
                        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                        className="overflow-auto h-full"
                    >
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-3 border-b">Сотрудник</th>
                                    <th className="px-6 py-3 border-b">План (Смена)</th>
                                    <th className="px-6 py-3 border-b">Факт (Время)</th>
                                    <th className="px-6 py-3 border-b text-center">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {windowedData.paddingTop > 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ height: windowedData.paddingTop, padding: 0, border: 0 }} />
                                    </tr>
                                )}
                                {visibleData.type === 'grouped' ? (
                                    windowedData.items.map((item, idx) => {
                                        if (item.type === 'header') {
                                            return (
                                                <tr key={`header-${item.department}`} className="bg-slate-100 sticky top-0 z-20">
                                                    <td colSpan={4} className="px-6 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-slate-700 text-sm">
                                                                {item.department === 'Нераспределенные' ? '⚠️ Нераспределенные' : `📁 ${item.department}`}
                                                            </span>
                                                            <span className="text-xs text-slate-500">({item.count} {item.count === 1 ? 'человек' : 'человек'})</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }
                                        
                                        const { row, department, index } = item;
                                        let statusBadge;
                                        let rowClass = '';

                                        if (row.status === 'ok') {
                                            statusBadge = <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> Пришел</span>;
                                        } else if (row.status === 'missing') {
                                            statusBadge = <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><XCircle size={12} /> Не пришел</span>;
                                            rowClass = 'bg-red-50/30';
                                        } else if (row.status === 'unexpected') {
                                            statusBadge = <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><AlertCircle size={12} /> Не в смену</span>;
                                            rowClass = 'bg-orange-50/30';
                                        }

                                        return (
                                            <tr key={`${department}-${index}`} className={`hover:bg-slate-50 transition-colors ${rowClass}`}>
                                                <td className="px-6 py-3">
                                                    <div className="font-bold text-slate-700">{row.name}</div>
                                                    <div className="text-xs text-slate-500">{row.role}</div>
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">
                                                    {row.plan ? (
                                                        <div>
                                                            <div className="font-semibold">{row.line}</div>
                                                            <div className="text-xs">Бригада {row.shift}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Не запланирован</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3">
                                                    {row.fact ? (
                                                        <div className="space-y-1">
                                                            <div className={`font-mono text-sm px-2 py-1 rounded inline-block border text-center ${row.timeInfo?.hasOvernightShift
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                                                }`}>
                                                                {row.time}
                                                            </div>
                                                            {row.timeInfo?.hasOvernightShift && (
                                                                <div className="text-xs text-blue-600 font-medium">
                                                                    {row.timeInfo?.nextDayExit
                                                                        ? `Ночная смена (выход ${row.timeInfo.nextDayExit} на след. день)`
                                                                        : 'Ночная смена'
                                                                    }
                                                                </div>
                                                            )}
                                                            {row.timeInfo?.entryTime && row.timeInfo?.exitTime && !row.timeInfo?.hasOvernightShift && (
                                                                <div className="text-xs text-slate-500">
                                                                    Вход: {row.timeInfo.entryTime}, Выход: {row.timeInfo.exitTime}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Нет данных</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-center">{statusBadge}</td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    windowedData.items.map((row, i) => {
                                        let statusBadge;
                                        let rowClass = '';

                                        if (row.status === 'ok') {
                                            statusBadge = <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> Пришел</span>;
                                        } else if (row.status === 'missing') {
                                            statusBadge = <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><XCircle size={12} /> Не пришел</span>;
                                            rowClass = 'bg-red-50/30';
                                        } else if (row.status === 'unexpected') {
                                            statusBadge = <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><AlertCircle size={12} /> Не в смену</span>;
                                            rowClass = 'bg-orange-50/30';
                                        }

                                        return (
                                            <tr key={i} className={`hover:bg-slate-50 transition-colors ${rowClass}`}>
                                                <td className="px-6 py-3">
                                                    <div className="font-bold text-slate-700">{row.name}</div>
                                                    <div className="text-xs text-slate-500">{row.role}</div>
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">
                                                    {row.plan ? (
                                                        <div>
                                                            <div className="font-semibold">{row.line}</div>
                                                            <div className="text-xs">Бригада {row.shift}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Не запланирован</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3">
                                                    {row.fact ? (
                                                        <div className="space-y-1">
                                                            <div className={`font-mono text-sm px-2 py-1 rounded inline-block border text-center ${row.timeInfo?.hasOvernightShift
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                                                }`}>
                                                                {row.time}
                                                            </div>
                                                            {row.timeInfo?.hasOvernightShift && (
                                                                <div className="text-xs text-blue-600 font-medium">
                                                                    {row.timeInfo?.nextDayExit
                                                                        ? `Ночная смена (выход ${row.timeInfo.nextDayExit} на след. день)`
                                                                        : 'Ночная смена'
                                                                    }
                                                                </div>
                                                            )}
                                                            {row.timeInfo?.entryTime && row.timeInfo?.exitTime && !row.timeInfo?.hasOvernightShift && (
                                                                <div className="text-xs text-slate-500">
                                                                    Вход: {row.timeInfo.entryTime} | Выход: {row.timeInfo.exitTime}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    {statusBadge}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                                {windowedData.paddingBottom > 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ height: windowedData.paddingBottom, padding: 0, border: 0 }} />
                                    </tr>
                                )}
                                {visibleData.data.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="text-center py-10 text-slate-400">
                                            Ничего не найдено
                                        </td>
                                    </tr>
                                )}
                                {visibleData.total > visibleCount && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-4 text-center bg-slate-50">
                                            <button
                                                onClick={() => setVisibleCount(prev => prev + 50)}
                                                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                                            >
                                                <Plus size={16} />
                                                Загрузить еще (+50)
                                            </button>
                                            <div className="text-xs text-slate-500 mt-2">
                                                Показано {visibleCount} из {visibleData.total}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(VerificationView);

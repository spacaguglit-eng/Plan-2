import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useData } from '../context/DataContext';
import { STORAGE_KEYS, normalizeName, matchNames } from '../utils';
import { getSurnameNorm, parseSheetDataToFact, buildFactMap, computeComparisonResult } from '../components/views/verification/verificationViewUtils';
import { ROW_HEIGHT_PX, OVERSCAN_ROWS } from '../components/views/verification/verificationViewConstants';

const USE_VERIFICATION_WORKER = true;

export function useVerificationData() {
    const {
        getShiftsForDate,
        workerRegistry,
        factData,
        setFactData,
        factDates,
        setFactDates,
        viewMode,
        persistStateKey,
        allEmployees: contextAllEmployees,
        setAllEmployees: setContextAllEmployees,
        departmentMasterList: contextDepartmentMasterList,
        setDepartmentMasterList: setContextDepartmentMasterList
    } = useData();

    const [selectedDate, setSelectedDate] = useState(factDates && factDates.length > 0 ? factDates[0] : '');
    const [isLoading, setIsLoading] = useState(false);
    const fileRef = useRef(null);
    const isMountedRef = useRef(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [allEmployeesData, setAllEmployeesData] = useState({});
    const [visibleCount, setVisibleCount] = useState(50);
    const [verificationWorkerResult, setVerificationWorkerResult] = useState(null);
    const [verificationWorkerStatus, setVerificationWorkerStatus] = useState({ status: 'idle', error: null, requestId: 0 });
    const verificationWorkerRef = useRef(null);
    const verificationWorkerReqIdRef = useRef(0);
    const scrollRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(600);
    const [editingDepartment, setEditingDepartment] = useState(null);
    const [departmentInput, setDepartmentInput] = useState('');
    const originalDepartmentRef = useRef(null);
    const [departmentMasterList, setDepartmentMasterList] = useState([]);
    const departmentCacheRef = useRef(new Map());

    useEffect(() => {
        isMountedRef.current = true;
        const saved = contextAllEmployees && typeof contextAllEmployees === 'object' ? contextAllEmployees : {};
        setAllEmployeesData(saved);
        const masterList = Array.isArray(contextDepartmentMasterList) ? contextDepartmentMasterList : null;
        if (masterList && masterList.length > 0) setDepartmentMasterList(masterList);
        return () => { isMountedRef.current = false; };
    }, [contextAllEmployees, contextDepartmentMasterList]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (typeof ResizeObserver === 'undefined') {
            setViewportHeight(el.clientHeight || 600);
            return;
        }
        const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight || 600));
        ro.observe(el);
        setViewportHeight(el.clientHeight || 600);
        return () => ro.disconnect();
    }, []);

    const getSurnameNormFn = useCallback(getSurnameNorm, []);

    const handleFileUpload = useCallback((e) => {
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
                const { parsedFact, allDates } = parseSheetDataToFact(data);

                setFactData(parsedFact);
                setFactDates(allDates);
                persistStateKey(STORAGE_KEYS.FACT_DATA, parsedFact);
                persistStateKey(STORAGE_KEYS.FACT_DATES, allDates);

                const currentEmployees = contextAllEmployees && typeof contextAllEmployees === 'object' ? { ...contextAllEmployees } : {};
                let employeesUpdated = false;
                Object.values(parsedFact).forEach(dateData => {
                    if (!dateData || typeof dateData !== 'object') return;
                    Object.values(dateData).forEach(entry => {
                        if (entry && entry.rawName) {
                            const normName = normalizeName(entry.rawName);
                            if (!currentEmployees[normName]) {
                                currentEmployees[normName] = { name: entry.rawName, role: 'Не указано', department: '', source: 'СКУД' };
                                employeesUpdated = true;
                            }
                        }
                    });
                });
                if (employeesUpdated) {
                    persistStateKey(STORAGE_KEYS.ALL_EMPLOYEES, currentEmployees);
                    setContextAllEmployees(currentEmployees);
                    setAllEmployeesData(currentEmployees);
                }
                if (allDates.length > 0) setSelectedDate(allDates[0]);
            } catch (err) {
                console.error(err);
                alert(err.message || 'Ошибка чтения файла');
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    }, [setFactData, setFactDates, persistStateKey, contextAllEmployees, setContextAllEmployees]);

    const handleResetFact = useCallback(() => {
        setFactData(null);
        setFactDates([]);
        persistStateKey(STORAGE_KEYS.FACT_DATA, null);
        persistStateKey(STORAGE_KEYS.FACT_DATES, []);
    }, [setFactData, setFactDates, persistStateKey]);

    const departmentIndex = useMemo(() => {
        const index = new Map();
        const fuzzyIndex = [];
        const bySurname = new Map();
        Object.values(allEmployeesData).forEach(emp => {
            const normName = normalizeName(emp.name);
            if (emp.department) {
                index.set(normName, emp.department);
                fuzzyIndex.push({ normName, name: emp.name, department: emp.department });
                const surname = getSurnameNormFn(emp.name);
                if (!bySurname.has(surname)) bySurname.set(surname, []);
                bySurname.get(surname).push({ normName, name: emp.name, department: emp.department });
            }
        });
        return { exact: index, fuzzy: fuzzyIndex, bySurname };
    }, [allEmployeesData, getSurnameNormFn]);

    useEffect(() => { departmentCacheRef.current = new Map(); }, [departmentIndex]);

    const getDepartment = useCallback((name) => {
        const cacheKey = String(name || '');
        if (departmentCacheRef.current.has(cacheKey)) return departmentCacheRef.current.get(cacheKey);
        const normName = normalizeName(name);
        const exactDept = departmentIndex.exact.get(normName);
        if (exactDept) {
            departmentCacheRef.current.set(cacheKey, exactDept);
            return exactDept;
        }
        const surname = getSurnameNormFn(name);
        const surnameCandidates = departmentIndex.bySurname.get(surname) || departmentIndex.fuzzy;
        for (const emp of surnameCandidates) {
            if (matchNames(emp.name, name)) {
                departmentCacheRef.current.set(cacheKey, emp.department);
                return emp.department;
            }
        }
        departmentCacheRef.current.set(cacheKey, '');
        return '';
    }, [departmentIndex, getSurnameNormFn]);

    const factMap = useMemo(() => {
        if (!selectedDate || !factData || !factData[selectedDate]) return null;
        return buildFactMap(factData[selectedDate], getSurnameNormFn);
    }, [selectedDate, factData, getSurnameNormFn]);

    const workerRegistryMap = useMemo(() => {
        const map = new Map();
        const bySurname = new Map();
        Object.values(workerRegistry || {}).forEach(worker => {
            if (worker && worker.name) {
                const normName = normalizeName(worker.name);
                map.set(normName, worker);
                const surname = getSurnameNormFn(worker.name);
                if (!bySurname.has(surname)) bySurname.set(surname, []);
                bySurname.get(surname).push(worker);
            }
        });
        return { byNorm: map, bySurname };
    }, [workerRegistry, getSurnameNormFn]);

    useEffect(() => {
        if (!USE_VERIFICATION_WORKER || verificationWorkerRef.current) return;
        const worker = new Worker(new URL('../verification.worker.js', import.meta.url), { type: 'module' });
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
        worker.onerror = (err) => setVerificationWorkerStatus(prev => ({ ...prev, status: 'error', error: err?.message || 'Worker error' }));
        return () => {
            try { worker.terminate(); } catch (_) {}
            verificationWorkerRef.current = null;
        };
    }, []);

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
        if (!USE_VERIFICATION_WORKER || viewMode !== 'verification') return;
        const worker = verificationWorkerRef.current;
        if (!worker || !selectedDate || !factData || !factData[selectedDate]) return;
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
    }, [viewMode, selectedDate, factData, planEntries, allEmployeesData, workerRegistry]);

    const comparisonResult = useMemo(() => {
        if (USE_VERIFICATION_WORKER) return verificationWorkerResult?.comparisonResult || [];
        const dayFact = selectedDate && factData ? factData[selectedDate] : null;
        if (!dayFact || !factMap) return [];
        return computeComparisonResult({
            getShiftsForDate,
            selectedDate,
            dayFact,
            factMap,
            getDepartment,
            workerRegistryMap,
            getSurnameNormFn
        });
    }, [USE_VERIFICATION_WORKER, verificationWorkerResult, selectedDate, factData, factMap, getShiftsForDate, getDepartment, workerRegistryMap]);

    useEffect(() => setVisibleCount(50), [search, statusFilter, selectedDate, departmentFilter]);

    const filteredResult = useMemo(() => {
        let result = comparisonResult.filter(r => {
            if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
            if (statusFilter === 'ok' && r.status !== 'ok') return false;
            if (statusFilter === 'missing' && r.status !== 'missing') return false;
            if (statusFilter === 'unexpected' && r.status !== 'unexpected') return false;
            if (departmentFilter !== 'all') {
                if (departmentFilter === 'Нераспределенные') { if (r.department) return false; }
                else { if (r.department !== departmentFilter) return false; }
            }
            return true;
        });
        if (departmentFilter !== 'all') return result;
        const grouped = {};
        result.forEach(r => {
            const dept = r.department || 'Нераспределенные';
            if (!grouped[dept]) grouped[dept] = [];
            grouped[dept].push(r);
        });
        return grouped;
    }, [comparisonResult, search, statusFilter, departmentFilter]);

    const visibleData = useMemo(() => {
        if (departmentFilter === 'all') {
            const allRows = [];
            let rowKey = 0;
            Object.entries(filteredResult).sort(([deptA], [deptB]) => {
                if (deptA === 'Нераспределенные') return 1;
                if (deptB === 'Нераспределенные') return -1;
                return deptA.localeCompare(deptB);
            }).forEach(([department, rows]) => {
                allRows.push({ type: 'header', department, count: rows.length, rowKey: rowKey++ });
                rows.forEach((row, i) => allRows.push({ type: 'row', row, department, index: i, rowKey: rowKey++ }));
            });
            return { type: 'grouped', data: allRows.slice(0, visibleCount), total: allRows.length };
        }
        const flatData = filteredResult.slice(0, visibleCount);
        const withKeys = flatData.map((row, i) => ({ row, rowKey: `flat-${i}` }));
        return { type: 'flat', data: withKeys, total: filteredResult.length };
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
        comparisonResult.forEach(r => { if (r.department) deptSet.add(r.department); });
        Object.values(allEmployeesData).forEach(emp => { if (emp.department) deptSet.add(emp.department); });
        return Array.from(deptSet).sort();
    }, [comparisonResult, allEmployeesData]);

    const departmentSuggestions = useMemo(() => {
        const defaults = [
            'Бухгалтерия', 'Склад', 'Линия 1', 'Линия 2', 'Линия 3', 'Линия 4',
            'Администрация', 'ОТК', 'Ремонт', 'Энергетика', 'Транспорт', 'Охрана'
        ];
        const suggestions = [...(departmentMasterList.length > 0 ? departmentMasterList : defaults)];
        departments.forEach(dept => { if (!suggestions.includes(dept)) suggestions.push(dept); });
        return suggestions.sort();
    }, [departments, departmentMasterList]);

    const handleDepartmentChange = useCallback((employeeName, newDepartment) => {
        const normName = normalizeName(employeeName);
        const finalDepartment = newDepartment.trim() || (originalDepartmentRef.current || '');
        setAllEmployeesData(prev => {
            const updated = {
                ...prev,
                [normName]: { ...(prev[normName] || { name: employeeName }), department: finalDepartment }
            };
            persistStateKey(STORAGE_KEYS.ALL_EMPLOYEES, updated);
            setContextAllEmployees(updated);
            return updated;
        });
        setEditingDepartment(null);
        setDepartmentInput('');
        originalDepartmentRef.current = null;
    }, [persistStateKey, setContextAllEmployees]);

    const startEditingDepartment = useCallback((employeeName, currentDepartment) => {
        setEditingDepartment(employeeName);
        originalDepartmentRef.current = currentDepartment || '';
        setDepartmentInput('');
    }, []);

    const stats = useMemo(() => ({
        total: comparisonResult.length,
        ok: comparisonResult.filter(r => r.status === 'ok').length,
        missing: comparisonResult.filter(r => r.status === 'missing').length,
        unexpected: comparisonResult.filter(r => r.status === 'unexpected').length
    }), [comparisonResult]);

    return {
        viewMode,
        fileRef,
        factData,
        factDates,
        selectedDate,
        setSelectedDate,
        isLoading,
        handleFileUpload,
        handleResetFact,
        statusFilter,
        setStatusFilter,
        search,
        setSearch,
        departmentFilter,
        setDepartmentFilter,
        visibleCount,
        setVisibleCount,
        scrollRef,
        scrollTop,
        setScrollTop,
        verificationWorkerStatus,
        USE_VERIFICATION_WORKER,
        departments,
        departmentSuggestions,
        stats,
        visibleData,
        windowedData,
        editingDepartment,
        departmentInput,
        setDepartmentInput,
        setEditingDepartment,
        originalDepartmentRef,
        handleDepartmentChange,
        startEditingDepartment
    };
}

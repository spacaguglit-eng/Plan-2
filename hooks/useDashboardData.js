import { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useRenderTime } from '../PerformanceMonitor';
import { logPerformanceMetric } from '../performanceStore';
import { normalizeName } from '../utils';
import { INITIAL_MANUAL_LINE_FORM } from '../components/views/dashboard/dashboardViewConstants';
import {
    addDaysToDate,
    buildAbsMinutes,
    formatDayIndexToDate,
    parseDateToDayIndex,
    buildArrangementHtml
} from '../components/views/dashboard/dashboardViewUtils';

export function useDashboardData() {
    const {
        getShiftsForDate,
        calculateDailyStats,
        selectedDate,
        lineTemplates,
        workerRegistry,
        scheduleDates,
        handleRemoveAssignment,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDrop,
        handleAutoFillFloaters,
        cloneAssignedWorker,
        removeCloneEntry,
        exportScheduleByLinesToExcel,
        isGlobalFill,
        setIsGlobalFill,
        autoReassignEnabled,
        setAutoReassignEnabled,
        backupAssignments,
        restoreAssignments,
        draggedWorker,
        viewMode,
        updateAssignments,
        manualAssignments,
        manualLines,
        addManualLine,
        removeManualLine,
        file,
        savedPlans,
        currentPlanId,
        setViewMode
    } = useData();

    useRenderTime('dashboard', logPerformanceMetric, viewMode === 'dashboard');

    const [contextMenu, setContextMenu] = useState(null);
    const [contextMenuSearch, setContextMenuSearch] = useState('');
    const [manualLineForm, setManualLineForm] = useState(INITIAL_MANUAL_LINE_FORM);

    const normalizedRegistry = useMemo(() => {
        const map = new Map();
        if (!workerRegistry) return map;
        Object.entries(workerRegistry).forEach(([key, value]) => {
            const normalizedKey = normalizeName(key);
            if (!map.has(normalizedKey)) {
                map.set(normalizedKey, { originalKey: key, worker: value });
            }
        });
        return map;
    }, [workerRegistry]);

    const findWorkerInRegistry = useMemo(() => {
        return (workerName) => {
            if (!workerName || !workerRegistry) return null;
            if (workerRegistry[workerName]) return workerRegistry[workerName];
            const normalizedName = normalizeName(workerName);
            const found = normalizedRegistry.get(normalizedName);
            if (found) return found.worker;
            return null;
        };
    }, [workerRegistry, normalizedRegistry]);

    const shiftsData = getShiftsForDate(selectedDate);
    const dayStats = calculateDailyStats ? calculateDailyStats[selectedDate] : null;

    const openArrangementInNewTab = useCallback(() => {
        if (!shiftsData || shiftsData.length === 0) return;
        const html = buildArrangementHtml(shiftsData, selectedDate);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank', 'noopener');
        if (w) w.focus();
        else location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, [selectedDate, shiftsData]);

    const handleAssignFromContextMenu = useCallback((worker, slotId) => {
        const assignmentEntry = {
            ...worker,
            originalId: worker.id,
            id: `assigned_${slotId}_${Date.now()}`
        };
        updateAssignments({ ...manualAssignments, [slotId]: assignmentEntry });
        setContextMenu(null);
        setContextMenuSearch('');
    }, [manualAssignments, updateAssignments]);

    const handleMarkOutsource = useCallback((slotId, roleTitle) => {
        const outsourceEntry = {
            name: 'Аутсорс',
            role: roleTitle,
            homeLine: 'Аутсорс',
            type: 'outsourced',
            originalId: `outsourced_${slotId}`,
            id: `outsourced_${slotId}_${Date.now()}`
        };
        updateAssignments({ ...manualAssignments, [slotId]: outsourceEntry });
        setContextMenu(null);
    }, [manualAssignments, updateAssignments]);

    const filteredContextMenuEmployees = useMemo(() => {
        const employees = contextMenu?.availableEmployees;
        if (!employees) return [];
        if (!contextMenuSearch) return employees;
        const searchLower = contextMenuSearch.toLowerCase();
        return employees.filter(emp =>
            emp.name.toLowerCase().includes(searchLower) ||
            (emp.role && emp.role.toLowerCase().includes(searchLower)) ||
            (emp.homeLine && emp.homeLine.toLowerCase().includes(searchLower))
        );
    }, [contextMenu?.availableEmployees, contextMenuSearch]);

    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu) {
                setContextMenu(null);
                setContextMenuSearch('');
            }
        };
        if (contextMenu) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [contextMenu]);

    const getManualTemplateOptionsForShift = useCallback((shiftId) => {
        if (!shiftId || !selectedDate) return [];
        const templates = Object.keys(lineTemplates);
        if (templates.length === 0) return [];
        const key = `${selectedDate}_${shiftId}`;
        const existing = manualLines[key] || [];
        const used = new Set(existing.map(line => line.templateName));
        return templates.filter(template => !used.has(template));
    }, [lineTemplates, manualLines, selectedDate]);

    const closeManualLineForm = useCallback(() => {
        setManualLineForm(INITIAL_MANUAL_LINE_FORM);
    }, []);

    const openManualLineForm = useCallback((shift) => {
        const options = getManualTemplateOptionsForShift(shift.id);
        if (options.length === 0) return;
        const defaultTemplate = options[0];
        const isNight = String(shift.type || '').toLowerCase().includes('ночь');
        const startDate = selectedDate;
        const startTime = isNight ? '20:00' : '08:00';
        const endTime = isNight ? '08:00' : '20:00';
        const endDate = isNight ? addDaysToDate(startDate, 1) : startDate;
        setManualLineForm({
            shiftId: shift.id,
            templateName: defaultTemplate,
            displayName: defaultTemplate,
            templateOptions: options,
            startDate,
            startTime,
            endDate,
            endTime
        });
    }, [getManualTemplateOptionsForShift, selectedDate]);

    const handleManualLineTemplateChange = useCallback((e) => {
        const nextTemplate = e.target.value;
        setManualLineForm(prev => {
            const shouldSyncDisplayName = !prev.displayName || prev.displayName === prev.templateName;
            return {
                ...prev,
                templateName: nextTemplate,
                displayName: shouldSyncDisplayName ? nextTemplate : prev.displayName
            };
        });
    }, []);

    const handleManualLineDisplayNameChange = useCallback((e) => {
        setManualLineForm(prev => ({ ...prev, displayName: e.target.value }));
    }, []);

    const handleManualLineSubmit = useCallback((event, shift) => {
        event.preventDefault();
        if (!manualLineForm.templateName) return;
        const displayName = manualLineForm.displayName.trim() || manualLineForm.templateName;
        const templatePositions = lineTemplates[manualLineForm.templateName] || [];
        const positions = templatePositions.length > 0
            ? templatePositions.map(pos => ({
                roleTitle: pos?.role || pos?.roleTitle || displayName,
                count: Math.max(1, parseInt(pos?.count, 10) || 1)
            }))
            : [{ roleTitle: displayName, count: 1 }];
        const shiftTypeLower = String(shift?.type || '').toLowerCase();
        const fallbackStart = shiftTypeLower.includes('ночь') ? '20:00' : '08:00';
        const fallbackEnd = shiftTypeLower.includes('ночь') ? '08:00' : '20:00';
        const startDate = manualLineForm.startDate || selectedDate;
        const endDate = manualLineForm.endDate || manualLineForm.startDate || selectedDate;
        const startTime = manualLineForm.startTime || fallbackStart;
        const endTime = manualLineForm.endTime || fallbackEnd;
        let startAbs = buildAbsMinutes(startDate, startTime);
        let endAbs = buildAbsMinutes(endDate, endTime);
        if (startAbs == null || endAbs == null) {
            addManualLine({
                date: selectedDate,
                shiftId: shift.id,
                displayName,
                templateName: manualLineForm.templateName,
                positions
            });
            setManualLineForm(INITIAL_MANUAL_LINE_FORM);
            return;
        }
        if (endAbs <= startAbs) endAbs += 1440;
        const candidateDates = scheduleDates && scheduleDates.length > 0
            ? scheduleDates
            : (() => {
                const startDay = Math.floor(startAbs / 1440);
                const endDay = Math.floor((endAbs - 1) / 1440);
                const dates = [];
                for (let day = startDay; day <= endDay; day += 1) {
                    dates.push(formatDayIndexToDate(day));
                }
                return dates;
            })();
        candidateDates.forEach(dateStr => {
            const shiftsForDate = getShiftsForDate(dateStr);
            const dayIdx = parseDateToDayIndex(dateStr);
            if (dayIdx == null) return;
            shiftsForDate.forEach(targetShift => {
                const isNight = String(targetShift.type || '').toLowerCase().includes('ночь');
                const shiftStart = dayIdx * 1440 + (isNight ? 20 * 60 : 8 * 60);
                const shiftEnd = (dayIdx + (isNight ? 1 : 0)) * 1440 + (isNight ? 8 * 60 : 20 * 60);
                const overlap = Math.min(endAbs, shiftEnd) - Math.max(startAbs, shiftStart);
                if (overlap <= 0) return;
                const key = `${dateStr}_${targetShift.id}`;
                const existing = manualLines[key] || [];
                if (existing.some(line => line.templateName === manualLineForm.templateName)) return;
                addManualLine({
                    date: dateStr,
                    shiftId: targetShift.id,
                    displayName,
                    templateName: manualLineForm.templateName,
                    positions
                });
            });
        });
        setManualLineForm(INITIAL_MANUAL_LINE_FORM);
    }, [manualLineForm, lineTemplates, selectedDate, scheduleDates, getShiftsForDate, manualLines, addManualLine]);

    return {
        shiftsData,
        dayStats,
        selectedDate,
        manualLineForm,
        setManualLineForm,
        contextMenu,
        setContextMenu,
        contextMenuSearch,
        setContextMenuSearch,
        lineTemplates,
        workerRegistry,
        manualAssignments,
        manualLines,
        getShiftsForDate,
        findWorkerInRegistry,
        getManualTemplateOptionsForShift,
        openManualLineForm,
        closeManualLineForm,
        handleManualLineTemplateChange,
        handleManualLineDisplayNameChange,
        handleManualLineSubmit,
        openArrangementInNewTab,
        handleAssignFromContextMenu,
        handleMarkOutsource,
        filteredContextMenuEmployees,
        handleRemoveAssignment,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDrop,
        handleAutoFillFloaters,
        cloneAssignedWorker,
        removeCloneEntry,
        exportScheduleByLinesToExcel,
        isGlobalFill,
        setIsGlobalFill,
        autoReassignEnabled,
        setAutoReassignEnabled,
        backupAssignments,
        restoreAssignments,
        draggedWorker,
        updateAssignments,
        removeManualLine,
        setViewMode
    };
}

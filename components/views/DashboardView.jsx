import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sun, Moon, ArrowRightLeft, UserPlus, GripVertical, X, Wand2, CheckSquare, Square, GraduationCap, Ban, Users, Search, Plus, Copy, Briefcase, ChevronDown, RotateCcw, CalendarClock } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { RvPickerModal } from '../modals/RvPickerModal';
import { LineEventsRawModal } from '../modals/LineEventsRawModal';
import { DayStatusHeader } from '../common/DayStatusHeader';
import { CustomDateSelector } from '../common/CustomDateSelector';
import { normalizeName } from '../../utils';
import { shiftLineCompositionSignature } from '../../context/modules/copyShiftUtils';

const parseTimeToMinutes = (value) => {
    if (!value || !String(value).includes(':')) return null;
    const [h, m] = String(value).split(':').map(v => parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return Math.max(0, Math.min(1439, h * 60 + m));
};

const parseDateToDayIndex = (value) => {
    if (!value || !String(value).includes('.')) return null;
    const parts = String(value).split('.');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    const utc = Date.UTC(year, month - 1, day);
    return Number.isFinite(utc) ? Math.floor(utc / 86400000) : null;
};

const formatDayIndexToDate = (dayIndex) => {
    if (!Number.isFinite(dayIndex)) return '01.01.1970';
    const date = new Date(dayIndex * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}.${month}.${year}`;
};

const dateToInputValue = (dateStr) => {
    if (!dateStr || !String(dateStr).includes('.')) return '';
    const parts = String(dateStr).split('.');
    const [dRaw, mRaw, yRaw] = parts;
    const dNum = parseInt(dRaw, 10);
    const mNum = parseInt(mRaw, 10);
    const yNum = parseInt(yRaw, 10);
    if (!Number.isFinite(dNum) || !Number.isFinite(mNum) || !Number.isFinite(yNum)) return '';
    const d = String(dNum).padStart(2, '0');
    const m = String(mNum).padStart(2, '0');
    const y = String(yNum);
    // HTML date input requires YYYY-MM-DD with zero-padded month/day
    return `${y}-${m}-${d}`;
};

const normalizeInputDate = (value) => {
    if (!value || !String(value).includes('-')) return value;
    const [yRaw, mRaw, dRaw] = String(value).split('-');
    const dNum = parseInt(dRaw, 10);
    const mNum = parseInt(mRaw, 10);
    const yNum = parseInt(yRaw, 10);
    if (!Number.isFinite(dNum) || !Number.isFinite(mNum) || !Number.isFinite(yNum)) return value;
    const d = String(dNum).padStart(2, '0');
    const m = String(mNum).padStart(2, '0');
    const y = String(yNum);
    return `${d}.${m}.${y}`;
};

const buildAbsMinutes = (dateStr, timeStr) => {
    const dayIdx = parseDateToDayIndex(dateStr);
    if (dayIdx == null) return null;
    const minutes = parseTimeToMinutes(timeStr);
    return minutes == null ? null : dayIdx * 1440 + minutes;
};

const parseDateLocal = (value) => {
    if (!value || !String(value).includes('.')) return null;
    const [dRaw, mRaw, yRaw] = String(value).split('.');
    const d = parseInt(dRaw, 10);
    const m = parseInt(mRaw, 10);
    const y = parseInt(yRaw, 10);
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return null;
    dt.setHours(0, 0, 0, 0);
    return dt;
};

const buildDateTimeLocal = (dateStr, timeStr) => {
    const base = parseDateLocal(dateStr);
    if (!base) return null;
    const minutes = parseTimeToMinutes(timeStr);
    if (minutes == null) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const dt = new Date(base);
    dt.setHours(h, m, 0, 0);
    return dt;
};

const formatLocalDateToDdMmYyyy = (date) => {
    if (!date || isNaN(date.getTime())) return '';
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = String(date.getFullYear());
    return `${d}.${m}.${y}`;
};

const addDaysToDate = (dateStr, days) => {
    const dayIdx = parseDateToDayIndex(dateStr);
    if (dayIdx == null || !Number.isFinite(days)) return dateStr;
    return formatDayIndexToDate(dayIdx + days);
};

const formatShiftTimeRange = (shift) => {
    const s = shift?.startTime;
    const e = shift?.endTime;
    if (!(s instanceof Date) || !(e instanceof Date) || isNaN(s.getTime()) || isNaN(e.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(e.getHours())}:${pad(e.getMinutes())}`;
};

const sanitizeCopyCell = (v) => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');

/** Совпадает с max-w меню выбора сотрудника; для clamp по горизонтали/вертикали. */
const FREE_EMPLOYEE_MENU_W = 400;
const FREE_EMPLOYEE_MENU_EST_H = 380;

/**
 * Держит popover «из свободных» в viewport: сдвиг влево у правого края, при необходимости — над кнопкой.
 * @param anchorRect — getBoundingClientRect элемента-якоря (кнопка); иначе позиция от курсора.
 */
const clampFreeEmployeeMenuPosition = (rawLeft, rawTop, anchorRect = null) => {
    if (typeof window === 'undefined') return { x: rawLeft, y: rawTop };
    const pad = 8;
    const w = FREE_EMPLOYEE_MENU_W;
    const h = FREE_EMPLOYEE_MENU_EST_H;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rawLeft;
    if (left + w > vw - pad) left = vw - w - pad;
    if (left < pad) left = pad;

    let top;
    if (anchorRect) {
        const below = anchorRect.bottom + 4;
        const above = anchorRect.top - h - 4;
        if (below + h <= vh - pad) {
            top = below;
        } else if (above >= pad) {
            top = above;
        } else {
            top = Math.max(pad, vh - h - pad);
        }
    } else {
        top = rawTop;
        if (top + h > vh - pad) top = vh - h - pad;
        if (top < pad) top = pad;
    }

    return { x: left, y: top };
};

const formatShiftSlotLabel = (slot) => {
    const role = sanitizeCopyCell(slot.roleTitle || '—');
    if (slot.status === 'outsourced') return `${role}: аутсорс`;
    if (slot.status === 'vacancy' || slot.status === 'unknown') return `${role}: вакансия`;
    const name = slot.assigned?.name || slot.currentWorkerName;
    if (name) return `${role}: ${sanitizeCopyCell(name)}`;
    return `${role}: вакансия`;
};

/** Состав смены: линии со слотами (роль — ФИО) и резерв подсобников. */
const formatShiftComposition = (shift, { singleLine = false } = {}) => {
    const lineParts = [];
    (shift.lineTasks || []).forEach((lt) => {
        const lineName = sanitizeCopyCell(
            (lt.displayName && String(lt.displayName).trim()) || lt.templateName || '—'
        );
        const slots = (lt.slots || []).map(formatShiftSlotLabel).filter(Boolean);
        const slotStr = slots.length ? slots.join('; ') : '—';
        lineParts.push(`${lineName}: ${slotStr}`);
    });
    const floaterNames = (shift.floaters || []).map((f) => f?.name).filter(Boolean);
    if (floaterNames.length) {
        lineParts.push(`Резерв: ${floaterNames.map(sanitizeCopyCell).join(', ')}`);
    }
    const sep = singleLine ? ' | ' : '\n';
    return lineParts.join(sep);
};

const getCompetenciesList = (competencies) => {
    if (!competencies) return [];
    return Array.isArray(competencies) ? competencies : Array.from(competencies);
};

const hasCompetencyForRole = (worker, roleTitle) => {
    if (!worker?.competencies || !roleTitle) return false;
    const comps = worker.competencies;
    return (comps instanceof Set && comps.has(roleTitle)) || (Array.isArray(comps) && comps.includes(roleTitle));
};

const hasAnyCompetencies = (competencies) => {
    if (!competencies) return false;
    return Array.isArray(competencies) ? competencies.length > 0 : competencies.size > 0;
};

/** Роль места слота; в скобках — штатная роль человека, если отличается. */
const formatSlotRoleLine = (slotRoleTitle, ownRolePrimary, ownRoleFallback) => {
    const slotRole = (slotRoleTitle && String(slotRoleTitle).trim()) || 'Не указано';
    const ownRaw = ownRolePrimary || ownRoleFallback || '';
    const ownRole = typeof ownRaw === 'string' ? ownRaw.trim() : '';
    return ownRole && normalizeName(ownRole) !== normalizeName(slotRole) ? `${slotRole} (${ownRole})` : slotRole;
};

const FilledSlotCard = React.memo(({
    slot,
    shift,
    statusConfig,
    selectedDate,
    draggedWorker,
    setRvModalData,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleMarkOutsource,
    cloneAssignedWorker,
    handleRemoveAssignment,
    findWorkerInRegistry
}) => {
    const { statusColor, borderColor, iconBg, iconColor, isManual = false } = statusConfig;
    const assignedWorker = slot.assigned;
    const workerName = assignedWorker?.name;
    const registryWorker = workerName ? findWorkerInRegistry(workerName) : null;
    const displayRole = formatSlotRoleLine(slot.roleTitle, registryWorker?.role, assignedWorker?.role);
    const competenciesList = getCompetenciesList(registryWorker?.competencies);
    const hasCompetencies = competenciesList.length > 0;
    const isCompFill = hasCompetencyForRole(registryWorker, slot.roleTitle);

    return (
        <div
            draggable
            onDragStart={(e) => {
                const workerForDrag = { ...assignedWorker, sourceSlotId: slot.slotId };
                handleDragStart(e, workerForDrag);
            }}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, slot.slotId, slot.currentWorkerName)}
            className={`flex items-center gap-3 p-2 pr-16 rounded-lg ${statusColor} border ${borderColor} relative group cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggedWorker ? 'ring-2 ring-blue-400' : ''}`}
        >
            <GripVertical size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity absolute left-1" />
            <div className="absolute bottom-1 right-1 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                    onClick={() => setRvModalData({ date: selectedDate, roleTitle: slot.roleTitle, slotId: slot.slotId, currentShiftId: shift.id, currentShiftType: shift.type })}
                    className="w-6 h-6 bg-orange-500 text-white rounded-md shadow-sm cursor-pointer hover:bg-orange-600 active:translate-y-[1px] flex items-center justify-center"
                    title="Назначить РВ"
                >
                    <UserPlus size={12} />
                </button>
                {slot.status !== 'outsourced' && (
                    <button
                        onClick={() => handleMarkOutsource(slot.slotId, slot.roleTitle)}
                        className="w-6 h-6 bg-amber-100 text-amber-800 rounded-md shadow-sm cursor-pointer hover:bg-amber-200 border border-amber-200 active:translate-y-[1px] flex items-center justify-center"
                        title="Закрыть аутсорсом"
                    >
                        <Briefcase size={12} />
                    </button>
                )}
                <button
                    onClick={() => cloneAssignedWorker({ date: selectedDate, shiftId: shift.id, slotId: slot.slotId, worker: assignedWorker, roleTitle: slot.roleTitle })}
                    className="w-6 h-6 bg-slate-100 text-slate-700 rounded-md shadow-sm cursor-pointer hover:bg-slate-200 border border-slate-200 active:translate-y-[1px] flex items-center justify-center"
                    title="Создать дубликат сотрудника"
                >
                    <Copy size={12} />
                </button>
                {(slot.status === 'filled' || isManual || slot.status === 'reassigned' || slot.status === 'outsourced') && (
                    <button onClick={() => handleRemoveAssignment(slot.slotId)} className="w-6 h-6 bg-red-500 text-white rounded-md shadow-sm cursor-pointer hover:bg-red-600 active:translate-y-[1px] flex items-center justify-center">
                        <X size={12} />
                    </button>
                )}
            </div>
            <div className={`w-8 h-8 rounded-full ${iconBg} ${iconColor} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                {typeof assignedWorker.name === 'string' ? assignedWorker.name.substring(0, 1) : '?'}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-700 truncate">{typeof assignedWorker.name === 'string' ? assignedWorker.name : 'Error'}</div>
                <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                    {displayRole} {isManual && <span className="text-blue-600 font-bold ml-1">★</span>}
                    {isCompFill && <span title="По компетенции"><GraduationCap size={10} className="text-blue-500 ml-1 inline" /></span>}
                </div>
                {hasCompetencies && (
                    <div className="text-[9px] text-slate-500 mt-0.5 truncate" title={competenciesList.join(', ')}>
                        {competenciesList.join(', ')}
                    </div>
                )}
            </div>
        </div>
    );
});

FilledSlotCard.displayName = 'FilledSlotCard';

const FILLED_SLOT_CONFIGS = {
    filled: { statusColor: 'bg-green-50', borderColor: 'border-green-100', iconBg: 'bg-green-200', iconColor: 'text-green-700', isManual: false },
    reassigned: { statusColor: 'bg-blue-50', borderColor: 'border-blue-100', iconBg: 'bg-blue-200', iconColor: 'text-blue-700', isManual: false },
    manual: { statusColor: 'bg-indigo-50', borderColor: 'border-indigo-200', iconBg: 'bg-indigo-200', iconColor: 'text-indigo-700', isManual: true },
    outsourced: { statusColor: 'bg-amber-50', borderColor: 'border-amber-200', iconBg: 'bg-amber-200', iconColor: 'text-amber-800', isManual: false }
};

const DashboardView = () => {
    const {
        getShiftsForDate,
        calculateDailyStats,
        rvModalData,
        setRvModalData,
        lineTemplates,
        workerRegistry,
        globalWorkSchedule,
        scheduleDates,
        selectedDate,
        setSelectedDate,
        handleAssignRv,
        handleRemoveAssignment,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDrop,
        handleAutoFillFloaters,
        cloneAssignedWorker,
        removeCloneEntry,
        exportScheduleByLinesToExcel,
        getLineTimelineRawData,
        isGlobalFill,
        setIsGlobalFill,
        autoReassignEnabled,
        setAutoReassignEnabled,
        rosterFillEnabled,
        setRosterFillEnabled,
        applyAutoReassignForDate,
        draggedWorker,
        updateAssignments,
        manualAssignments,
        manualLines,
        addManualLine,
        removeManualLine,
        savedPlans,
        currentPlanId,
        setCurrentPlanId,
        loadPlan,
        resetAssignmentsForShift,
        resetAssignmentsForDay,
        resetAssignmentsAll,
        copyShiftCompositionToTargets
    } = useData();

    const [lineShiftsModalOpen, setLineShiftsModalOpen] = useState(false);
    const [lineShiftsCopyMode, setLineShiftsCopyMode] = useState('tsv');
    const [lineShiftsCopied, setLineShiftsCopied] = useState(false);
    const lineShiftsTextareaRef = useRef(null);
    const [copyShiftModalOpen, setCopyShiftModalOpen] = useState(false);
    const [copyShiftSelectedTargets, setCopyShiftSelectedTargets] = useState([]);
    const [contextMenu, setContextMenu] = useState(null);
    const [contextMenuSearch, setContextMenuSearch] = useState('');
    const [selectedShiftId, setSelectedShiftId] = useState('');
    const [manualLineForm, setManualLineForm] = useState({
        shiftId: null,
        templateName: '',
        displayName: '',
        templateOptions: [],
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: ''
    });
    const [showLineEventsRawModal, setShowLineEventsRawModal] = useState(false);
    const [exportMode, setExportMode] = useState(() => {
        if (typeof window === 'undefined') return 'full';
        try {
            const stored = window.localStorage.getItem('plan_export_mode_lines');
            return stored === 'vacancies' ? 'vacancies' : 'full';
        } catch {
            return 'full';
        }
    }); // 'full' | 'vacancies'

    useEffect(() => {
        try {
            window.localStorage.setItem('plan_export_mode_lines', exportMode);
        } catch {
            // ignore
        }
    }, [exportMode]);
    // Create normalized registry map for robust lookup
    const normalizedRegistry = useMemo(() => {
        const map = new Map();
        if (!workerRegistry) return map;
        
        Object.entries(workerRegistry).forEach(([key, value]) => {
            const normalizedKey = normalizeName(key);
            // Store both the original key and normalized key for lookup
            if (!map.has(normalizedKey)) {
                map.set(normalizedKey, { originalKey: key, worker: value });
            }
        });
        
        return map;
    }, [workerRegistry]);

    // Robust worker lookup function
    const findWorkerInRegistry = useMemo(() => {
        return (workerName) => {
            if (!workerName || !workerRegistry) return null;
            
            // First, try direct lookup
            if (workerRegistry[workerName]) {
                return workerRegistry[workerName];
            }
            
            // Then, try normalized lookup
            const normalizedName = normalizeName(workerName);
            const found = normalizedRegistry.get(normalizedName);
            if (found) {
                return found.worker;
            }

            return null;
        };
    }, [workerRegistry, normalizedRegistry]);

    const datesForSelector = useMemo(() => {
        if (!scheduleDates || scheduleDates.length === 0) return [];
        if (!selectedShiftId) return scheduleDates;
        return scheduleDates.filter((dateStr) => {
            const shifts = getShiftsForDate(dateStr);
            return shifts && shifts.some((s) => String(s.id) === selectedShiftId);
        });
    }, [scheduleDates, selectedShiftId, getShiftsForDate]);

    useEffect(() => {
        if (!selectedShiftId || !datesForSelector.length) return;
        if (selectedDate && !datesForSelector.includes(selectedDate)) {
            setSelectedDate(datesForSelector[0]);
        }
    }, [selectedShiftId, datesForSelector, selectedDate, setSelectedDate]);

    const shiftsData = getShiftsForDate(selectedDate);
    const copyShiftSource = useMemo(
        () => (shiftsData || []).find((s) => String(s.id) === String(selectedShiftId)),
        [shiftsData, selectedShiftId]
    );
    const copyShiftTargetsGrouped = useMemo(() => {
        const all = (shiftsData || []).filter((s) => String(s.id) !== String(selectedShiftId));
        if (!copyShiftSource) {
            return { sameComposition: [], other: all };
        }
        const srcSig = shiftLineCompositionSignature(copyShiftSource);
        const sameComposition = [];
        const other = [];
        all.forEach((s) => {
            if (shiftLineCompositionSignature(s) === srcSig) {
                sameComposition.push(s);
            } else {
                other.push(s);
            }
        });
        return { sameComposition, other };
    }, [shiftsData, selectedShiftId, copyShiftSource]);
    const copyShiftTargetsTotal = copyShiftTargetsGrouped.sameComposition.length + copyShiftTargetsGrouped.other.length;
    const copyShiftOtherDates = useMemo(
        () => datesForSelector.filter((d) => d !== selectedDate),
        [datesForSelector, selectedDate]
    );
    const copyShiftSelectableTotal = copyShiftTargetsTotal + copyShiftOtherDates.length;
    const toggleCopyShiftTargetKey = useCallback((key) => {
        setCopyShiftSelectedTargets((prev) =>
            prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
        );
    }, []);
    const displayShifts = useMemo(() => {
        if (!shiftsData || shiftsData.length === 0) return [];
        if (!selectedShiftId) return shiftsData;
        return shiftsData.filter(s => String(s.id) === selectedShiftId);
    }, [shiftsData, selectedShiftId]);

    const dayStats = calculateDailyStats ? calculateDailyStats[selectedDate] : null;

    const handleAssignFromContextMenu = (worker, slotId) => {
        const assignmentEntry = {
            ...worker,
            originalId: worker.id,
            id: `assigned_${slotId}_${Date.now()}`
        };
        updateAssignments({ ...manualAssignments, [slotId]: assignmentEntry });
        setContextMenu(null);
        setContextMenuSearch('');
    };

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

    // Close context menu on click outside (mousedown чтобы клик по кнопке «Добавить из свободных» не закрывал меню сразу)
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (contextMenu) {
                setContextMenu(null);
                setContextMenuSearch('');
            }
        };
        if (contextMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
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

    const hasManualAssignmentsForShift = useCallback((shiftId) => {
        if (!selectedDate || !shiftId) return false;
        const prefix = `${selectedDate}_${shiftId}_`;
        return Object.keys(manualAssignments || {}).some((key) => key.startsWith(prefix));
    }, [selectedDate, manualAssignments]);

    const lineShiftsScheduleRows = useMemo(() => {
        if (!scheduleDates || scheduleDates.length === 0) return [];
        const byLine = new Map();
        scheduleDates.forEach((dateStr) => {
            const shifts = getShiftsForDate(dateStr) || [];
            shifts.forEach((shift) => {
                const timeRange = formatShiftTimeRange(shift);
                const shiftCompositionLine = formatShiftComposition(shift, { singleLine: true });
                (shift.lineTasks || []).forEach((lt) => {
                    const name = (lt.displayName && String(lt.displayName).trim()) || lt.templateName || '—';
                    const dedupe = `${dateStr}_${shift.id}_${name}`;
                    if (!byLine.has(name)) byLine.set(name, []);
                    const arr = byLine.get(name);
                    if (!arr.some((x) => x.dedupe === dedupe)) {
                        arr.push({
                            dedupe,
                            dateStr,
                            dayIndex: parseDateToDayIndex(dateStr) ?? 0,
                            shiftName: shift.name,
                            shiftType: shift.type,
                            timeRange,
                            shiftComposition: shiftCompositionLine
                        });
                    }
                });
            });
        });
        const keys = [...byLine.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
        return keys.map((lineName) => {
            const entries = byLine.get(lineName).sort((a, b) => {
                if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
                return String(a.shiftName).localeCompare(String(b.shiftName), 'ru');
            });
            return { lineName, entries };
        });
    }, [scheduleDates, getShiftsForDate]);

    const lineShiftsByShiftEntries = useMemo(() => {
        if (!scheduleDates || scheduleDates.length === 0) return [];
        const map = new Map();
        scheduleDates.forEach((dateStr) => {
            const shifts = getShiftsForDate(dateStr) || [];
            shifts.forEach((shift) => {
                const key = `${dateStr}::${shift.id}`;
                if (map.has(key)) return;
                map.set(key, {
                    key,
                    dateStr,
                    dayIndex: parseDateToDayIndex(dateStr) ?? 0,
                    shiftName: shift.name,
                    shiftType: shift.type,
                    timeRange: formatShiftTimeRange(shift),
                    composition: formatShiftComposition(shift, { singleLine: false }),
                    compositionOneLine: formatShiftComposition(shift, { singleLine: true })
                });
            });
        });
        return [...map.values()].sort((a, b) => {
            if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
            return String(a.shiftName).localeCompare(String(b.shiftName), 'ru');
        });
    }, [scheduleDates, getShiftsForDate]);

    const lineShiftsCopyTsv = useMemo(() => {
        const row = (cells) => cells.map(sanitizeCopyCell).join('\t');
        if (lineShiftsScheduleRows.length > 0) {
            const lines = [row(['Линия', 'Дата', 'Бригада', 'Тип смены', 'Время', 'Состав смены'])];
            lineShiftsScheduleRows.forEach(({ lineName, entries }) => {
                entries.forEach((e) => {
                    lines.push(
                        row([
                            lineName,
                            e.dateStr,
                            e.shiftName,
                            e.shiftType,
                            e.timeRange || '',
                            e.shiftComposition || ''
                        ])
                    );
                });
            });
            return lines.join('\n');
        }
        if (lineShiftsByShiftEntries.length > 0) {
            const lines = [row(['Дата', 'Бригада', 'Тип смены', 'Время', 'Состав смены'])];
            lineShiftsByShiftEntries.forEach((e) => {
                lines.push(
                    row([
                        e.dateStr,
                        e.shiftName,
                        e.shiftType,
                        e.timeRange || '',
                        e.compositionOneLine || ''
                    ])
                );
            });
            return lines.join('\n');
        }
        return '';
    }, [lineShiftsScheduleRows, lineShiftsByShiftEntries]);

    const lineShiftsCopyPlain = useMemo(() => {
        const byLine = lineShiftsScheduleRows.length
            ? lineShiftsScheduleRows
                  .map(({ lineName, entries }) => {
                      const body = entries
                          .map((e) => {
                              const t = e.timeRange ? ` · ${e.timeRange}` : '';
                              const comp = e.shiftComposition ? `\n     ${e.shiftComposition}` : '';
                              return `  ${e.dateStr} — ${e.shiftName} (${e.shiftType})${t}${comp}`;
                          })
                          .join('\n');
                      return `${lineName}\n${body}`;
                  })
                  .join('\n\n')
            : '';
        if (!lineShiftsByShiftEntries.length) return byLine;
        const block = lineShiftsByShiftEntries
            .map((e) => {
                const t = e.timeRange ? ` · ${e.timeRange}` : '';
                const head = `${e.dateStr} · ${e.shiftName} (${e.shiftType})${t}`;
                return `${head}\n${e.composition}`;
            })
            .join('\n\n');
        if (!byLine) return `--- Состав по сменам ---\n\n${block}`;
        return `${byLine}\n\n--- Состав по сменам (без дублей по строкам линий) ---\n\n${block}`;
    }, [lineShiftsScheduleRows, lineShiftsByShiftEntries]);

    const lineShiftsCopyCompositionOnly = useMemo(() => {
        if (!lineShiftsByShiftEntries.length) return '';
        return lineShiftsByShiftEntries
            .map((e) => {
                const t = e.timeRange ? ` · ${e.timeRange}` : '';
                const head = `${e.dateStr} · ${e.shiftName} (${e.shiftType})${t}`;
                return `${head}\n${e.composition}`;
            })
            .join('\n\n');
    }, [lineShiftsByShiftEntries]);

    const lineShiftsTextareaValue =
        lineShiftsCopyMode === 'tsv'
            ? lineShiftsCopyTsv
            : lineShiftsCopyMode === 'plain'
                ? lineShiftsCopyPlain
                : lineShiftsCopyCompositionOnly;

    const copyLineShiftsBuffer = useCallback(async () => {
        const text =
            lineShiftsCopyMode === 'tsv'
                ? lineShiftsCopyTsv
                : lineShiftsCopyMode === 'plain'
                    ? lineShiftsCopyPlain
                    : lineShiftsCopyCompositionOnly;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setLineShiftsCopied(true);
            window.setTimeout(() => setLineShiftsCopied(false), 2000);
        } catch {
            const el = lineShiftsTextareaRef.current;
            if (el) {
                el.focus();
                el.select();
                try {
                    document.execCommand('copy');
                    setLineShiftsCopied(true);
                    window.setTimeout(() => setLineShiftsCopied(false), 2000);
                } catch {
                    // остаётся выделение — пользователь копирует вручную
                }
            }
        }
    }, [lineShiftsCopyMode, lineShiftsCopyTsv, lineShiftsCopyPlain, lineShiftsCopyCompositionOnly]);

    const selectLineShiftsText = useCallback(() => {
        const el = lineShiftsTextareaRef.current;
        if (!el) return;
        el.focus();
        el.select();
    }, []);

    useEffect(() => {
        if (!lineShiftsModalOpen) setLineShiftsCopied(false);
    }, [lineShiftsModalOpen]);

    const shiftFilterOptions = [
        { value: '', label: 'Все смены' },
        { value: '1', label: 'Смена 1' },
        { value: '2', label: 'Смена 2' },
        { value: '3', label: 'Смена 3' },
        { value: '4', label: 'Смена 4' }
    ];

    const openManualLineForm = (shift) => {
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
    };

    const closeManualLineForm = () => {
        setManualLineForm({
            shiftId: null,
            templateName: '',
            displayName: '',
            templateOptions: [],
            startDate: '',
            startTime: '',
            endDate: '',
            endTime: ''
        });
    };

    const handleManualLineTemplateChange = (e) => {
        const nextTemplate = e.target.value;
        setManualLineForm(prev => {
            const shouldSyncDisplayName = !prev.displayName || prev.displayName === prev.templateName;
            return {
                ...prev,
                templateName: nextTemplate,
                displayName: shouldSyncDisplayName ? nextTemplate : prev.displayName
            };
        });
    };

    const handleManualLineDisplayNameChange = (e) => {
        const nextName = e.target.value;
        setManualLineForm(prev => ({ ...prev, displayName: nextName }));
    };

    const handleManualLineSubmit = (event, shift) => {
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
        const startDt = buildDateTimeLocal(startDate, startTime);
        let endDt = buildDateTimeLocal(endDate, endTime);
        if (!startDt || !endDt) {
            addManualLine({
                date: selectedDate,
                shiftId: shift.id,
                displayName,
                templateName: manualLineForm.templateName,
                positions
            });
            closeManualLineForm();
            return;
        }
        // If user selected an end that is not after start, treat it as next day(s) until it becomes valid.
        while (endDt.getTime() <= startDt.getTime()) {
            endDt = new Date(endDt.getTime() + 86400000);
        }

        const startDayDt = new Date(startDt);
        startDayDt.setHours(0, 0, 0, 0);
        // inclusive end day: use endDt - 1ms
        const endInclusive = new Date(endDt.getTime() - 1);
        endInclusive.setHours(0, 0, 0, 0);
        const startDayMs = startDayDt.getTime();
        const endDayMs = endInclusive.getTime();

        const candidateDates = scheduleDates && scheduleDates.length > 0
            ? scheduleDates.filter(d => {
                const dt = parseDateLocal(d);
                if (!dt) return false;
                const ms = dt.getTime();
                return ms >= startDayMs && ms <= endDayMs;
            })
            : (() => {
                const dates = [];
                const cur = new Date(startDayDt);
                while (cur.getTime() <= endDayMs) {
                    dates.push(formatLocalDateToDdMmYyyy(cur));
                    cur.setDate(cur.getDate() + 1);
                }
                return dates;
            })();
        candidateDates.forEach(dateStr => {
            const shiftsForDate = getShiftsForDate(dateStr);
            shiftsForDate.forEach(targetShift => {
                const shiftStartMs = targetShift?.startTime instanceof Date
                    ? targetShift.startTime.getTime()
                    : (buildDateTimeLocal(dateStr, String(targetShift?.type || '').toLowerCase().includes('ночь') ? '20:00' : '08:00')?.getTime() ?? null);
                let shiftEndMs = targetShift?.endTime instanceof Date
                    ? targetShift.endTime.getTime()
                    : null;
                if (shiftEndMs == null) {
                    const isNight = String(targetShift?.type || '').toLowerCase().includes('ночь');
                    const endBase = buildDateTimeLocal(dateStr, isNight ? '08:00' : '20:00');
                    if (endBase) {
                        if (isNight) endBase.setDate(endBase.getDate() + 1);
                        shiftEndMs = endBase.getTime();
                    }
                }
                if (shiftStartMs == null || shiftEndMs == null) return;
                const overlap = Math.min(endDt.getTime(), shiftEndMs) - Math.max(startDt.getTime(), shiftStartMs);
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
        closeManualLineForm();
    };

    return (
        <div className="pb-20">
            <DayStatusHeader 
                stats={dayStats} 
                date={selectedDate}
                shiftsData={shiftsData}
                manualAssignments={manualAssignments}
                onRunAutoReassign={() => applyAutoReassignForDate(selectedDate)}
                onExportLines={exportScheduleByLinesToExcel}
                onShowRawLineEvents={getLineTimelineRawData ? () => setShowLineEventsRawModal(true) : undefined}
                onResetDay={() => resetAssignmentsForDay(selectedDate)}
                onResetAll={resetAssignmentsAll}
                exportMode={exportMode}
                onChangeExportMode={setExportMode}
                dateSelector={
                    <div className="flex items-center gap-3 flex-wrap">
                        <CustomDateSelector
                            dates={datesForSelector}
                            selectedDate={selectedDate}
                            onSelect={setSelectedDate}
                            dayStats={calculateDailyStats}
                        />
                        <div className="relative">
                            <label className="sr-only">Смена</label>
                            <select
                                value={selectedShiftId}
                                onChange={(e) => setSelectedShiftId(e.target.value)}
                                className="bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-semibold py-2 pl-3 pr-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all appearance-none cursor-pointer shadow-sm min-w-[140px]"
                            >
                                {shiftFilterOptions.map((opt) => (
                                    <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                        </div>
                        <label
                            className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-white px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 select-none shrink-0"
                            title="Вкл: свободные из пула автоматически закрывают вакансии — карточки синие (автоподстановка). Выкл: вакансии красные, пока не назначите вручную. Зелёные карточки — штат из матрицы, этим переключателем не отключаются. Настройка сохраняется."
                        >
                            {autoReassignEnabled ? (
                                <CheckSquare size={18} className="text-blue-600 flex-shrink-0" />
                            ) : (
                                <Square size={18} className="text-slate-400 flex-shrink-0" />
                            )}
                            <span className="whitespace-nowrap">Авто из свободных</span>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={autoReassignEnabled}
                                onChange={(e) => setAutoReassignEnabled(e.target.checked)}
                            />
                        </label>
                        <label
                            className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-white px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 select-none shrink-0"
                            title="Вкл: ФИО из штатной матрицы подставляются в слоты (зелёные карточки). Выкл: слоты по штату пустые; ручные назначения и «Авто из свободных» не отключаются. Настройка сохраняется."
                        >
                            {rosterFillEnabled ? (
                                <CheckSquare size={18} className="text-emerald-600 flex-shrink-0" />
                            ) : (
                                <Square size={18} className="text-slate-400 flex-shrink-0" />
                            )}
                            <span className="whitespace-nowrap">Штат из матрицы</span>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={rosterFillEnabled}
                                onChange={(e) => setRosterFillEnabled(e.target.checked)}
                            />
                        </label>
                        <button
                            type="button"
                            disabled={!selectedShiftId || copyShiftSelectableTotal === 0}
                            onClick={() => {
                                setCopyShiftSelectedTargets([]);
                                setCopyShiftModalOpen(true);
                            }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-200 bg-violet-50 text-violet-900 text-sm font-semibold hover:bg-violet-100 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
                            title="Текущая смена — из фильтра выше. Дальше выберите целевые смены в окне."
                        >
                            <Copy size={16} /> Копировать смену
                        </button>
                        <button
                            type="button"
                            disabled={!scheduleDates?.length}
                            onClick={() => setLineShiftsModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-900 text-sm font-semibold hover:bg-sky-100 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
                            title="По всем дням календаря: когда и в каких сменах работает каждая линия"
                        >
                            <CalendarClock size={16} /> Линии по сменам
                        </button>
                        <div className="relative w-64">
                            <select
                                value={currentPlanId || ''}
                                onChange={(e) => {
                                    const id = e.target.value || null;
                                    if (id) loadPlan?.(id, { switchToDashboard: false });
                                    else setCurrentPlanId?.(null);
                                }}
                                className="w-full bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-semibold py-2 pl-3 pr-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all appearance-none cursor-pointer shadow-sm"
                            >
                                <option value="">— не выбран —</option>
                                {(savedPlans || []).map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name || plan.id}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                        </div>
                    </div>
                }
            />
            {rvModalData && (
                <RvPickerModal
                    isOpen={!!rvModalData}
                    onClose={() => setRvModalData(null)}
                    slotData={rvModalData}
                    lineTemplates={lineTemplates}
                    workerRegistry={workerRegistry}
                    globalSchedule={globalWorkSchedule}
                    scheduleDates={scheduleDates}
                    onAssign={handleAssignRv}
                />
            )}
            {showLineEventsRawModal && getLineTimelineRawData && (() => {
                const { rawIntervals, lineTimelines } = getLineTimelineRawData();
                return (
                    <LineEventsRawModal
                        rawIntervals={rawIntervals}
                        lineTimelines={lineTimelines}
                        onClose={() => setShowLineEventsRawModal(false)}
                    />
                );
            })()}
            {lineShiftsModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="line-shifts-modal-title"
                    onClick={() => setLineShiftsModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full border border-slate-200 overflow-hidden max-h-[min(90vh,800px)] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 flex-shrink-0">
                            <div className="min-w-0 flex-1">
                                <h3 id="line-shifts-modal-title" className="text-lg font-bold text-slate-800">
                                    Линии по сменам
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Колонка «Состав смены» — все линии смены и резерв. «Текст» дублирует состав внизу.
                                    «Только состав» — одна секция на смену, удобно копировать.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {(lineShiftsScheduleRows.length > 0 || lineShiftsByShiftEntries.length > 0) && (
                                    <button
                                        type="button"
                                        onClick={copyLineShiftsBuffer}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                                    >
                                        <Copy size={16} />
                                        {lineShiftsCopied ? 'Скопировано' : 'Копировать'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setLineShiftsModalOpen(false)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                    aria-label="Закрыть"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="px-5 py-3 flex flex-col flex-1 min-h-0 gap-3">
                            {lineShiftsScheduleRows.length === 0 && lineShiftsByShiftEntries.length === 0 ? (
                                <p className="text-sm text-slate-500 py-4">Нет данных по линиям в календаре.</p>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 text-xs overflow-hidden flex-wrap">
                                            <button
                                                type="button"
                                                onClick={() => setLineShiftsCopyMode('tsv')}
                                                className={`px-3 py-1.5 font-semibold transition-colors ${
                                                    lineShiftsCopyMode === 'tsv'
                                                        ? 'bg-slate-800 text-white'
                                                        : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                Таблица (Excel)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLineShiftsCopyMode('plain')}
                                                className={`px-3 py-1.5 font-semibold transition-colors border-l border-slate-200 ${
                                                    lineShiftsCopyMode === 'plain'
                                                        ? 'bg-slate-800 text-white'
                                                        : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                Текст
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLineShiftsCopyMode('composition')}
                                                className={`px-3 py-1.5 font-semibold transition-colors border-l border-slate-200 ${
                                                    lineShiftsCopyMode === 'composition'
                                                        ? 'bg-slate-800 text-white'
                                                        : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                Только состав
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={selectLineShiftsText}
                                            className="text-xs font-semibold text-slate-600 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                                        >
                                            Выделить всё
                                        </button>
                                    </div>
                                    <textarea
                                        ref={lineShiftsTextareaRef}
                                        readOnly
                                        value={lineShiftsTextareaValue}
                                        className="w-full flex-1 min-h-[240px] max-h-[min(50vh,420px)] font-mono text-xs leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                        spellCheck={false}
                                    />
                                </>
                            )}
                        </div>
                        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setLineShiftsModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {copyShiftModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="copy-shift-modal-title"
                    onClick={() => setCopyShiftModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
                            <div>
                                <h3 id="copy-shift-modal-title" className="text-lg font-bold text-slate-800">
                                    Копировать состав смены
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Источник:{' '}
                                    <span className="font-semibold text-slate-700">
                                        {copyShiftSource ? `${copyShiftSource.name} (${copyShiftSource.type})` : '—'}
                                    </span>
                                    {selectedDate ? ` · ${selectedDate}` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCopyShiftModalOpen(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Закрыть"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="px-5 py-3 max-h-[min(60vh,420px)] overflow-y-auto">
                            <p className="text-xs text-slate-500 mb-3">
                                Доступны все дни, где эта смена есть в календаре, плюс другие бригады на текущую дату.
                                Копируются только совпадающие линии и роли; человек переносится, если доступен в целевой
                                день/смену.
                            </p>
                            {copyShiftSelectableTotal === 0 ? (
                                <p className="text-sm text-slate-500 py-2">Нет целей для копирования.</p>
                            ) : (
                                <div className="space-y-4">
                                    {copyShiftOtherDates.length > 0 && (
                                        <div>
                                            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-2">
                                                Та же смена на других днях
                                            </div>
                                            <ul className="space-y-1">
                                                {copyShiftOtherDates.map((d) => {
                                                    const k = `${d}::${selectedShiftId}`;
                                                    return (
                                                        <li key={k}>
                                                            <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={copyShiftSelectedTargets.includes(k)}
                                                                    onChange={() => toggleCopyShiftTargetKey(k)}
                                                                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                                                />
                                                                <span className="font-medium text-slate-800">{d}</span>
                                                                <span className="text-sm text-slate-500">
                                                                    ({copyShiftSource?.name || 'смена'} · {copyShiftSource?.type || ''})
                                                                </span>
                                                            </label>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}
                                    {copyShiftTargetsGrouped.sameComposition.length > 0 && (
                                        <div>
                                            <div className="text-[11px] font-bold uppercase tracking-wide text-violet-700 mb-2">
                                                На эту дату — тот же состав линий, что у источника
                                            </div>
                                            <ul className="space-y-1">
                                                {copyShiftTargetsGrouped.sameComposition.map((s) => {
                                                    const k = `${selectedDate}::${s.id}`;
                                                    return (
                                                        <li key={k}>
                                                            <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={copyShiftSelectedTargets.includes(k)}
                                                                    onChange={() => toggleCopyShiftTargetKey(k)}
                                                                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                                                />
                                                                <span className="font-medium text-slate-800">{s.name}</span>
                                                                <span className="text-sm text-slate-500">({s.type})</span>
                                                            </label>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}
                                    {copyShiftTargetsGrouped.other.length > 0 && (
                                        <div>
                                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                                                На эту дату — остальные смены
                                            </div>
                                            <ul className="space-y-1">
                                                {copyShiftTargetsGrouped.other.map((s) => {
                                                    const k = `${selectedDate}::${s.id}`;
                                                    return (
                                                        <li key={k}>
                                                            <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={copyShiftSelectedTargets.includes(k)}
                                                                    onChange={() => toggleCopyShiftTargetKey(k)}
                                                                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                                                />
                                                                <span className="font-medium text-slate-800">{s.name}</span>
                                                                <span className="text-sm text-slate-500">({s.type})</span>
                                                            </label>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setCopyShiftModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-200/80"
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                disabled={copyShiftSelectedTargets.length === 0}
                                onClick={() => {
                                    const specs = copyShiftSelectedTargets
                                        .map((key) => {
                                            const i = key.indexOf('::');
                                            if (i < 0) return null;
                                            return {
                                                dateStr: key.slice(0, i),
                                                shiftId: key.slice(i + 2)
                                            };
                                        })
                                        .filter(Boolean);
                                    copyShiftCompositionToTargets(selectedDate, selectedShiftId, specs);
                                    setCopyShiftModalOpen(false);
                                }}
                                className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-45 disabled:cursor-not-allowed"
                            >
                                Копировать
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {(!shiftsData || shiftsData.length === 0) && (
                <div className="text-center py-20 text-slate-400">Нет смен на выбранную дату</div>
            )}
            {(selectedShiftId && displayShifts.length === 0 && shiftsData?.length > 0) && (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    На выбранную дату эта смена не выходит.
                </div>
            )}
            <div className="space-y-12">
                {displayShifts.map((shift) => {
                    const isDayShift = shift.type?.toLowerCase().includes('день');
                    const hasFloaters = shift.floaters.length > 0;
                    const hasVacanciesHere = shift.filledSlots < shift.totalRequired;
                    const isActive = hasFloaters && (isGlobalFill || hasVacanciesHere);
                    const availableTemplates = getManualTemplateOptionsForShift(shift.id);
                    const isDisabled = availableTemplates.length === 0;
                    const hasManualForShift = hasManualAssignmentsForShift(shift.id);
                    return (
                        <div id={`brigade-${shift.id}`} key={shift.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 bg-slate-50">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-blue-600 text-white font-bold text-xl">{shift.name}</div>
                                <div>
                                    <div className="font-semibold text-slate-700 text-lg flex items-center gap-2">{shift.type}</div>
                                    <div className="text-sm text-slate-500">Мест: <b>{shift.totalRequired}</b> | Занято: <b>{shift.filledSlots}</b></div>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                                    {isGlobalFill ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-slate-400" />} <span>Заполнить глобально</span> <input type="checkbox" className="hidden" checked={isGlobalFill} onChange={(e) => setIsGlobalFill(e.target.checked)} />
                                </label>
                                <button
                                    onClick={() => handleAutoFillFloaters(shift, isGlobalFill)}
                                    disabled={!isActive}
                                    title={!hasFloaters ? 'Нет подсобников в резерве' : isGlobalFill ? 'Заполнить вакансии подсобниками по всем сменам' : 'Заполнить вакансии подсобниками на этой смене'}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors shadow-sm active:transform active:scale-95 ${isActive ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    <Wand2 size={18} /> Заполнить подсобниками
                                </button>
                                <button
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => openManualLineForm(shift)}
                                    title={isDisabled ? 'Нет доступных шаблонов для этой смены' : 'Добавить ручную линию'}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-semibold text-sm transition-colors ${isDisabled ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                                >
                                    <Plus size={16} /> Добавить линию
                                </button>
                                <button
                                    type="button"
                                    disabled={!hasManualForShift}
                                    onClick={() => resetAssignmentsForShift(selectedDate, shift.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-semibold text-sm transition-colors ${hasManualForShift ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'}`}
                                    title="Откатить назначения на этой смене к базовым значениям"
                                >
                                    <RotateCcw size={16} /> Откат смены
                                </button>
                            </div>
                        </div>
                        {manualLineForm.shiftId === shift.id && (
                            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                                <form onSubmit={(e) => handleManualLineSubmit(e, shift)} className="grid gap-3 md:grid-cols-[220px_1fr_1fr_1fr_auto] md:items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Шаблон</label>
                                        <select
                                            value={manualLineForm.templateName}
                                            onChange={handleManualLineTemplateChange}
                                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                        >
                                            {manualLineForm.templateOptions.map(template => (
                                                <option key={template} value={template}>{template}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Название</label>
                                        <input
                                            value={manualLineForm.displayName}
                                            onChange={handleManualLineDisplayNameChange}
                                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            placeholder="Например, «Линия 3»"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Старт</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="date"
                                                value={dateToInputValue(manualLineForm.startDate)}
                                                onChange={(e) => setManualLineForm(prev => ({ ...prev, startDate: normalizeInputDate(e.target.value) }))}
                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            />
                                            <input
                                                type="time"
                                                value={manualLineForm.startTime}
                                                onChange={(e) => setManualLineForm(prev => ({ ...prev, startTime: e.target.value }))}
                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Конец</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="date"
                                                value={dateToInputValue(manualLineForm.endDate)}
                                                onChange={(e) => setManualLineForm(prev => ({ ...prev, endDate: normalizeInputDate(e.target.value) }))}
                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            />
                                            <input
                                                type="time"
                                                value={manualLineForm.endTime}
                                                onChange={(e) => setManualLineForm(prev => ({ ...prev, endTime: e.target.value }))}
                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="submit"
                                            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                                        >
                                            Сохранить
                                        </button>
                                        <button
                                            type="button"
                                            onClick={closeManualLineForm}
                                            className="flex-1 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-semibold hover:border-slate-300 hover:text-slate-800 transition-colors"
                                        >
                                            Отмена
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                        <div className="p-6 bg-slate-100/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {shift.lineTasks.map((task, idx) => (
                                    <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden transition-shadow hover:shadow-md">
                                        <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`w-2 h-2 rounded-full ${task.isManualLine ? 'bg-amber-500' : 'bg-slate-300'}`} />
                                                <h3 className="font-bold text-slate-700 text-sm truncate" title={task.displayName}>{task.displayName}</h3>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-500">{task.slots.length} мест</span>
                                                {task.isManualLine && (
                                                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">Ручная</span>
                                                )}
                                                {task.isManualLine && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeManualLine({ date: selectedDate, shiftId: shift.id, lineId: task.manualLineId })}
                                                        className="text-slate-400 hover:text-slate-700 p-1 rounded-full transition-colors"
                                                        title="Удалить линию"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-3 space-y-2 flex-1">
                                            {task.slots.map((slot, sIdx) => {
                                                if (slot.assigned?.type === 'external') {
                                                    // For external workers, also look up competencies from registry
                                                    const extWorkerName = slot.assigned?.name;
                                                    const extRegistryWorker = extWorkerName ? findWorkerInRegistry(extWorkerName) : null;
                                                    const extCompetenciesList = getCompetenciesList(extRegistryWorker?.competencies);
                                                    const extHasCompetencies = extCompetenciesList.length > 0;
                                                    
                                                    return (
                                                        <div 
                                                            key={sIdx} 
                                                            draggable
                                                            onDragStart={(e) => {
                                                                const workerForDrag = {
                                                                    ...slot.assigned,
                                                                    sourceSlotId: slot.slotId
                                                                };
                                                                handleDragStart(e, workerForDrag);
                                                            }}
                                                            onDragEnd={handleDragEnd}
                                                            onDragOver={handleDragOver}
                                                            onDrop={(e) => handleDrop(e, slot.slotId, slot.currentWorkerName)}
                                                            className={`bg-orange-50 border-orange-200 border-2 p-2 pr-16 rounded-lg relative group cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggedWorker ? 'ring-2 ring-blue-400' : ''}`}
                                                        >
                                                            <GripVertical size={14} className="text-orange-300 opacity-0 group-hover:opacity-100 transition-opacity absolute left-1 top-2" />
                                                            <button onClick={() => handleRemoveAssignment(slot.slotId)} className="absolute bottom-2 right-2 w-6 h-6 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 cursor-pointer flex items-center justify-center active:translate-y-[1px]">
                                                                <X size={14} />
                                                            </button>
                                                            <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-bl font-bold pointer-events-none">РВ • Бр.{slot.assigned.sourceShift}</div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center font-bold text-xs">{slot.assigned.name[0]}</div>
                                                                <div className="min-w-0">
                                                                    <div className="font-semibold text-slate-700 text-sm truncate">{slot.assigned.name}</div>
                                                                    <div className="text-xs text-slate-500 truncate">
                                                                        {formatSlotRoleLine(slot.roleTitle, extRegistryWorker?.role, slot.assigned?.role)}
                                                                    </div>
                                                                    {extHasCompetencies && (
                                                                        <div className="text-[9px] text-slate-500 mt-0.5 truncate" title={extCompetenciesList.join(', ')}>
                                                                            {extCompetenciesList.join(', ')}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                const filledCardProps = {
                                                    slot,
                                                    shift,
                                                    selectedDate,
                                                    draggedWorker,
                                                    setRvModalData,
                                                    handleDragStart,
                                                    handleDragEnd,
                                                    handleDragOver,
                                                    handleDrop,
                                                    handleMarkOutsource,
                                                    cloneAssignedWorker,
                                                    handleRemoveAssignment,
                                                    findWorkerInRegistry
                                                };

                                                if (slot.status === 'filled') {
                                                    return (
                                                        <div key={sIdx}>
                                                            <FilledSlotCard {...filledCardProps} statusConfig={FILLED_SLOT_CONFIGS.filled} />
                                                        </div>
                                                    );
                                                }
                                                if (slot.status === 'reassigned') {
                                                    return (
                                                        <div key={sIdx} className="relative">
                                                            <FilledSlotCard {...filledCardProps} statusConfig={FILLED_SLOT_CONFIGS.reassigned} />
                                                            <div className="absolute top-0 right-0 bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded-bl text-[9px] font-bold pointer-events-none">
                                                                <ArrowRightLeft size={8} className="inline mr-0.5" />
                                                                {slot.assigned.homeLine}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (slot.status === 'manual') {
                                                    return (
                                                        <div key={sIdx}>
                                                            <FilledSlotCard {...filledCardProps} statusConfig={FILLED_SLOT_CONFIGS.manual} />
                                                        </div>
                                                    );
                                                }
                                                if (slot.status === 'outsourced') {
                                                    return (
                                                        <div key={sIdx} className="relative">
                                                            <FilledSlotCard {...filledCardProps} statusConfig={FILLED_SLOT_CONFIGS.outsourced} />
                                                            <div className="absolute top-0 right-0 bg-amber-300 text-amber-900 px-1.5 py-0.5 rounded-bl text-[9px] font-bold pointer-events-none">
                                                                Аутсорс
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                        <div 
                                                            key={sIdx} 
                                                            onDragOver={handleDragOver} 
                                                            onDrop={(e) => handleDrop(e, slot.slotId)}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                if (slot.status === 'vacancy') {
                                                                    const availableEmployees = [
                                                                        ...(shift?.unassignedPeople || []).filter(p => p.isAvailable),
                                                                        ...(shift?.floaters || [])
                                                                    ];
                                                                    const { x, y } = clampFreeEmployeeMenuPosition(
                                                                        e.clientX - 6,
                                                                        e.clientY - 6,
                                                                        null
                                                                    );
                                                                    setContextMenu({
                                                                        x,
                                                                        y,
                                                                        slotId: slot.slotId,
                                                                        roleTitle: slot.roleTitle,
                                                                        availableEmployees
                                                                    });
                                                                    setContextMenuSearch('');
                                                                }
                                                            }}
                                                            className={`flex items-center gap-3 p-2 rounded-lg border-2 border-dashed ${draggedWorker ? 'border-blue-400 bg-blue-50' : 'border-red-200 bg-red-50/30'} transition-colors relative group`}
                                                        >
                                                            {slot.assigned?.type === 'vacancy' && (
                                                                <button onClick={() => handleRemoveAssignment(slot.slotId)} className="absolute bottom-1 right-1 w-5 h-5 bg-gray-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 flex items-center justify-center">
                                                                    <X size={10} />
                                                                </button>
                                                            )}
                                                            <div className={`w-8 h-8 rounded-full ${draggedWorker ? 'bg-blue-100 text-blue-500' : 'bg-red-100 text-red-400'} flex items-center justify-center flex-shrink-0`}>
                                                                <UserPlus size={16} />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className={`text-sm font-bold ${draggedWorker ? 'text-blue-500' : 'text-red-400'}`}>
                                                                    {draggedWorker ? 'Поставить' : 'Требуется'}
                                                                </div>
                                                                <div className={`text-xs font-bold ${draggedWorker ? 'text-blue-400' : 'text-slate-600'}`}>{slot.roleTitle}</div>
                                                            </div>
                                                            {!draggedWorker && (
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            e.preventDefault();
                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                            const availableEmployees = [
                                                                                ...(shift?.unassignedPeople || []).filter(p => p.isAvailable),
                                                                                ...(shift?.floaters || [])
                                                                            ];
                                                                            setTimeout(() => {
                                                                                const { x, y } = clampFreeEmployeeMenuPosition(
                                                                                    rect.left,
                                                                                    rect.bottom + 4,
                                                                                    rect
                                                                                );
                                                                                setContextMenu({
                                                                                    x,
                                                                                    y,
                                                                                    slotId: slot.slotId,
                                                                                    roleTitle: slot.roleTitle,
                                                                                    availableEmployees
                                                                                });
                                                                                setContextMenuSearch('');
                                                                            }, 0);
                                                                        }}
                                                                        className="w-6 h-6 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-md border border-emerald-200 transition-colors flex items-center justify-center shadow-sm"
                                                                        title="Добавить из свободных сотрудников"
                                                                    >
                                                                        <Users size={12} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleMarkOutsource(slot.slotId, slot.roleTitle)}
                                                                        className="w-6 h-6 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-md border border-amber-200 transition-colors flex items-center justify-center shadow-sm"
                                                                        title="Закрыть аутсорсом"
                                                                    >
                                                                        <Briefcase size={12} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setRvModalData({ date: selectedDate, roleTitle: slot.roleTitle, slotId: slot.slotId, currentShiftId: shift.id, currentShiftType: shift.type })}
                                                                        className="w-6 h-6 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-md transition-colors flex items-center justify-center shadow-sm"
                                                                        title="Назначить РВ"
                                                                    >
                                                                        <UserPlus size={12} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white rounded-xl border border-yellow-200 shadow-sm p-4 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-yellow-400"></div>
                                    <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        {isDayShift ? <Sun size={18} className="text-yellow-500" /> : <Moon size={18} className="text-slate-600" />}
                                        Резерв ({shift.floaters.length})
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {shift.floaters.length > 0 ? (
                                            shift.floaters.map(p => (
                                                <div key={p.id} draggable onDragStart={(e) => handleDragStart(e, p)} onDragEnd={handleDragEnd} className="flex items-center gap-2 p-2 bg-yellow-50 rounded border border-yellow-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group">
                                                    <GripVertical size={14} className="text-yellow-400" />
                                                    <div className="text-xs font-semibold text-slate-700">{p.name}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-xs text-slate-400 italic">Пусто</div>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-slate-300"></div>
                                    <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <Users size={18} className="text-slate-500" />
                                        Свободные сотрудники ({shift.unassignedPeople.length})
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2">
                                        {shift.unassignedPeople.map(p => (
                                            <div
                                                key={p.id}
                                                draggable={p.isAvailable}
                                                onDragStart={(e) => handleDragStart(e, p)}
                                                onDragEnd={handleDragEnd}
                                                className={`flex items-center gap-2 p-2 rounded border transition-shadow ${p.isAvailable ? 'bg-slate-50 border-slate-100 cursor-grab active:cursor-grabbing hover:shadow-md' : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'} ${p.isClone ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}
                                                title={p.isClone ? 'Совмещение сотрудника, уже занятое на линии' : (!p.isAvailable ? p.statusReason : (() => {
                                                    const regWorker = findWorkerInRegistry(p.name);
                                                    const compsList = getCompetenciesList(regWorker?.competencies);
                                                    return hasAnyCompetencies(regWorker?.competencies) ? `Компетенции: ${compsList.join(', ')}` : '';
                                                })())}
                                            >
                                                {p.isAvailable ? <GripVertical size={14} className="text-slate-300" /> : <Ban size={14} className="text-red-400" />}
                                                <div className="min-w-0">
                                                    <div className="text-xs font-semibold text-slate-700 truncate flex items-center gap-1">
                                                        <span className="truncate">{p.name}</span>
                                                        {p.isClone && (
                                                            <>
                                                                <Copy size={12} className="text-blue-500" title="Совмещение уже на линии" />
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        if (!p.cloneId) return;
                                                                        removeCloneEntry({ date: selectedDate, shiftId: shift.id, cloneId: p.cloneId });
                                                                    }}
                                                                    className="text-slate-400 hover:text-slate-800 p-0.5"
                                                                    title="Удалить клон"
                                                                >
                                                                    <X size={10} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {hasAnyCompetencies(findWorkerInRegistry(p.name)?.competencies) && <GraduationCap size={10} className="text-blue-400" />}
                                                    </div>
                                                    <div className="text-[9px] text-slate-400 truncate">
                                                        {!p.isAvailable ? <span className="text-red-500 font-bold">{p.statusReason}</span> : `${p.role} (${p.homeLine})`}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    );
                })}
            </div>
            {contextMenu && (
                <div 
                    className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-[200] min-w-[280px] max-w-[400px]"
                    style={{ 
                        left: `${contextMenu.x}px`, 
                        top: `${contextMenu.y}px`
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="p-3 border-b border-slate-200 bg-slate-50">
                        <div className="text-xs font-semibold text-slate-600 mb-2">Назначить на: {contextMenu.roleTitle}</div>
                        <div className="relative">
                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Поиск сотрудника..."
                                value={contextMenuSearch}
                                onChange={(e) => setContextMenuSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                        {filteredContextMenuEmployees.length === 0 ? (
                            <div className="p-4 text-center text-sm text-slate-400">
                                {contextMenuSearch ? 'Ничего не найдено' : 'Нет доступных сотрудников'}
                            </div>
                        ) : (
                            filteredContextMenuEmployees.map(emp => {
                                const hasComps = hasAnyCompetencies(findWorkerInRegistry(emp.name)?.competencies);
                                return (
                                    <button
                                        key={emp.id || emp.name}
                                        onClick={() => handleAssignFromContextMenu(emp, contextMenu.slotId)}
                                        className="w-full px-4 py-2 text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-b-0"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-700 truncate flex items-center gap-1">
                                                    {emp.name}
                                                    {hasComps && <GraduationCap size={12} className="text-blue-400" />}
                                                </div>
                                                <div className="text-xs text-slate-500 truncate">
                                                    {emp.role} {emp.homeLine && `(${emp.homeLine})`}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(DashboardView);

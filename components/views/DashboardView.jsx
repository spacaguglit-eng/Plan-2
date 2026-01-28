import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sun, Moon, ArrowRightLeft, UserPlus, GripVertical, X, Wand2, CheckSquare, Square, GraduationCap, Ban, Users, Search, Plus, Copy } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { RvPickerModal, DayStatusHeader } from '../../UIComponents';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';
import { normalizeName } from '../../utils';

const DashboardView = () => {
    const {
        getShiftsForDate,
        calculateDailyStats,
        selectedDate,
        rvModalData,
        setRvModalData,
        lineTemplates,
        workerRegistry,
        globalWorkSchedule,
        scheduleDates,
        handleAssignRv,
        handleRemoveAssignment,
        handleDragStart,
        handleDragOver,
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
        removeManualLine
    } = useData();

    useRenderTime('dashboard', logPerformanceMetric, viewMode === 'dashboard');

    const [contextMenu, setContextMenu] = useState(null);
    const [contextMenuSearch, setContextMenuSearch] = useState('');
    const [manualLineForm, setManualLineForm] = useState({ shiftId: null, templateName: '', displayName: '', templateOptions: [] });

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
            
            // Fallback: iterate through registry to find match
            for (const [key, value] of Object.entries(workerRegistry)) {
                if (normalizeName(key) === normalizedName) {
                    return value;
                }
            }
            
            return null;
        };
    }, [workerRegistry, normalizedRegistry]);

    const shiftsData = getShiftsForDate(selectedDate);
    const dayStats = calculateDailyStats ? calculateDailyStats[selectedDate] : null;
    
    if (!shiftsData || shiftsData.length === 0) {
        return <div className="text-center py-20 text-slate-400">Нет смен на выбранную дату</div>;
    }

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

    const filteredContextMenuEmployees = contextMenu?.availableEmployees?.filter(emp => {
        if (!contextMenuSearch) return true;
        const searchLower = contextMenuSearch.toLowerCase();
        return emp.name.toLowerCase().includes(searchLower) || 
               (emp.role && emp.role.toLowerCase().includes(searchLower)) ||
               (emp.homeLine && emp.homeLine.toLowerCase().includes(searchLower));
    }) || [];

    // Close context menu on click outside
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

    const openManualLineForm = (shiftId) => {
        const options = getManualTemplateOptionsForShift(shiftId);
        if (options.length === 0) return;
        const defaultTemplate = options[0];
        setManualLineForm({
            shiftId,
            templateName: defaultTemplate,
            displayName: defaultTemplate,
            templateOptions: options
        });
    };

    const closeManualLineForm = () => {
        setManualLineForm({ shiftId: null, templateName: '', displayName: '', templateOptions: [] });
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

    const handleManualLineSubmit = (event, shiftId) => {
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
        addManualLine({
            date: selectedDate,
            shiftId,
            displayName,
            templateName: manualLineForm.templateName,
            positions
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
                autoReassignEnabled={autoReassignEnabled}
                onToggleAutoReassign={setAutoReassignEnabled}
                onBackup={backupAssignments}
                onRestore={restoreAssignments}
                onExportLines={exportScheduleByLinesToExcel}
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
                    currentShiftId={rvModalData.currentShiftId}
                    onAssign={handleAssignRv}
                />
            )}
            <div className="space-y-12">
                {shiftsData.map((shift) => (
                    <div id={`brigade-${shift.id}`} key={shift.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-blue-600 text-white font-bold text-xl">{shift.name}</div>
                                <div>
                                    <div className="font-semibold text-slate-700 text-lg flex items-center gap-2">{shift.type}</div>
                                    <div className="text-sm text-slate-500">Мест: <b>{shift.totalRequired}</b> | Занято: <b>{shift.filledSlots}</b></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                                    {isGlobalFill ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-slate-400" />} <span>Заполнить глобально</span> <input type="checkbox" className="hidden" checked={isGlobalFill} onChange={(e) => setIsGlobalFill(e.target.checked)} />
                                </label>
                                {shift.floaters.length > 0 && shift.filledSlots < shift.totalRequired && (
                                    <button onClick={() => handleAutoFillFloaters(shift, isGlobalFill)} className="flex items-center gap-2 bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg font-bold hover:bg-yellow-200 transition-colors shadow-sm active:transform active:scale-95">
                                        <Wand2 size={18} /> Заполнить подсобниками
                                    </button>
                                )}
                                {(() => {
                                    const availableTemplates = getManualTemplateOptionsForShift(shift.id);
                                    const isDisabled = availableTemplates.length === 0;
                                    return (
                                        <button
                                            type="button"
                                            disabled={isDisabled}
                                            onClick={() => openManualLineForm(shift.id)}
                                            title={isDisabled ? 'Нет доступных шаблонов для этой смены' : 'Добавить ручную линию'}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-semibold text-sm transition-colors ${isDisabled ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                                        >
                                            <Plus size={16} /> Добавить линию
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>
                        {manualLineForm.shiftId === shift.id && (
                            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                                <form onSubmit={(e) => handleManualLineSubmit(e, shift.id)} className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
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
                                    <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-slate-700 text-sm truncate" title={task.displayName}>{task.displayName}</h3>
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
                                            <span className="text-xs font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-500">{task.slots.length} мест</span>
                                        </div>
                                        <div className="p-3 space-y-2 flex-1">
                                            {task.slots.map((slot, sIdx) => {
                                                const wName = slot.assigned?.name;
                                                const reg = wName ? findWorkerInRegistry(wName) : null;
                                                const isCompFill = reg && reg.competencies && (
                                                    (reg.competencies instanceof Set && reg.competencies.has(slot.roleTitle)) ||
                                                    (Array.isArray(reg.competencies) && reg.competencies.includes(slot.roleTitle))
                                                );

                                                if (slot.assigned?.type === 'external') {
                                                    // For external workers, also look up competencies from registry
                                                    const extWorkerName = slot.assigned?.name;
                                                    const extRegistryWorker = extWorkerName ? findWorkerInRegistry(extWorkerName) : null;
                                                    const extCompetencies = extRegistryWorker?.competencies;
                                                    const extCompetenciesList = extCompetencies 
                                                        ? (Array.isArray(extCompetencies) ? extCompetencies : Array.from(extCompetencies || []))
                                                        : [];
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
                                                            onDragOver={handleDragOver}
                                                            onDrop={(e) => handleDrop(e, slot.slotId, slot.currentWorkerName)}
                                                            className={`bg-orange-50 border-orange-200 border-2 p-2 rounded-lg relative group cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggedWorker ? 'ring-2 ring-blue-400' : ''}`}
                                                        >
                                                            <GripVertical size={14} className="text-orange-300 opacity-0 group-hover:opacity-100 transition-opacity absolute left-1 top-2" />
                                                            <button onClick={() => handleRemoveAssignment(slot.slotId)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 cursor-pointer">
                                                                <X size={12} />
                                                            </button>
                                                            <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-bl font-bold pointer-events-none">РВ • Бр.{slot.assigned.sourceShift}</div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center font-bold text-xs">{slot.assigned.name[0]}</div>
                                                                <div className="min-w-0">
                                                                    <div className="font-semibold text-slate-700 text-sm truncate">{slot.assigned.name}</div>
                                                                    <div className="text-xs text-slate-500 truncate">{slot.assigned.role || extRegistryWorker?.role || 'Не указано'}</div>
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

                                                const renderFilled = (statusColor, borderColor, iconBg, iconColor, assignedWorker, isManual = false) => {
                                                    // Get worker data from registry using robust lookup
                                                    const workerName = assignedWorker?.name;
                                                    const registryWorker = workerName ? findWorkerInRegistry(workerName) : null;
                                                    
                                                    // Use role from registry if available, otherwise fall back to assignedWorker.role
                                                    // This ensures roster workers (which only have { name }) get their role from registry
                                                    const displayRole = registryWorker?.role || assignedWorker?.role || 'Не указано';
                                                    
                                                    // Safe competency handling (works with both Set and Array)
                                                    const competencies = registryWorker?.competencies;
                                                    const competenciesList = competencies 
                                                        ? (Array.isArray(competencies) ? competencies : Array.from(competencies || []))
                                                        : [];
                                                    const hasCompetencies = competenciesList.length > 0;
                                                    
                                                    // Check if worker has competency for this role
                                                    const isCompFill = registryWorker && competencies && (
                                                        (competencies instanceof Set && competencies.has(slot.roleTitle)) ||
                                                        (Array.isArray(competencies) && competencies.includes(slot.roleTitle))
                                                    );
                                                    
                                                    return (
                                                        <div 
                                                            draggable 
                                                            onDragStart={(e) => {
                                                                // Создаем worker объект из слота для перетаскивания
                                                                const workerForDrag = {
                                                                    ...assignedWorker,
                                                                    sourceSlotId: slot.slotId // Запоминаем откуда тащим
                                                                };
                                                                handleDragStart(e, workerForDrag);
                                                            }}
                                                            onDragOver={handleDragOver}
                                                            onDrop={(e) => {
                                                                // Если тащат на занятый слот - меняем местами
                                                                handleDrop(e, slot.slotId, slot.currentWorkerName);
                                                            }}
                                                            className={`flex items-center gap-3 p-2 rounded-lg ${statusColor} border ${borderColor} relative group cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggedWorker ? 'ring-2 ring-blue-400' : ''}`}
                                                        >
                                                            <GripVertical size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity absolute left-1" />
                                                            <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                                <button
                                                                    onClick={() => setRvModalData({ date: selectedDate, roleTitle: slot.roleTitle, slotId: slot.slotId, currentShiftId: shift.id, currentShiftType: shift.type })}
                                                                    className="bg-orange-500 text-white rounded-full p-0.5 shadow-sm cursor-pointer hover:bg-orange-600"
                                                                    title="Назначить РВ"
                                                                >
                                                                    <UserPlus size={12} />
                                                                </button>
                                                                <button
                                                                    onClick={() => cloneAssignedWorker({ date: selectedDate, shiftId: shift.id, slotId: slot.slotId, worker: assignedWorker, roleTitle: slot.roleTitle })}
                                                                    className="bg-slate-100 text-slate-600 rounded-full p-0.5 shadow-sm cursor-pointer hover:bg-slate-200"
                                                                    title="Создать дубликат сотрудника"
                                                                >
                                                                    <Copy size={12} />
                                                                </button>
                                                                {(slot.status === 'filled' || isManual || slot.status === 'reassigned') && (
                                                                    <button onClick={() => handleRemoveAssignment(slot.slotId)} className="bg-red-500 text-white rounded-full p-0.5 shadow-sm cursor-pointer hover:bg-red-600">
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
                                                };

                                                if (slot.status === 'filled') {
                                                    return <div key={sIdx}>{renderFilled('bg-green-50', 'border-green-100', 'bg-green-200', 'text-green-700', slot.assigned)}</div>;
                                                } else if (slot.status === 'reassigned') {
                                                    return (
                                                        <div key={sIdx} className="relative">
                                                            {renderFilled('bg-blue-50', 'border-blue-100', 'bg-blue-200', 'text-blue-700', slot.assigned)}
                                                            <div className="absolute top-0 right-0 bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded-bl text-[9px] font-bold pointer-events-none">
                                                                <ArrowRightLeft size={8} className="inline mr-0.5" />
                                                                {slot.assigned.homeLine}
                                                            </div>
                                                        </div>
                                                    );
                                                } else if (slot.status === 'manual') {
                                                    return <div key={sIdx}>{renderFilled('bg-indigo-50', 'border-indigo-200', 'bg-indigo-200', 'text-indigo-700', slot.assigned, true)}</div>;
                                                } else {
                                                    return (
                                                        <div 
                                                            key={sIdx} 
                                                            onDragOver={handleDragOver} 
                                                            onDrop={(e) => handleDrop(e, slot.slotId)}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                if (slot.status === 'vacancy' && !slot.isManualVacancy) {
                                                                    const currentShift = shiftsData.find(s => s.id === shift.id);
                                                                    const availableEmployees = [
                                                                        ...(currentShift?.unassignedPeople || []).filter(p => p.isAvailable),
                                                                        ...(currentShift?.floaters || [])
                                                                    ];
                                                                    setContextMenu({
                                                                        x: e.clientX,
                                                                        y: e.clientY,
                                                                        slotId: slot.slotId,
                                                                        roleTitle: slot.roleTitle,
                                                                        availableEmployees
                                                                    });
                                                                    setContextMenuSearch('');
                                                                }
                                                            }}
                                                            className={`flex items-center gap-3 p-2 rounded-lg border-2 border-dashed ${draggedWorker ? 'border-blue-400 bg-blue-50' : 'border-red-200 bg-red-50/30'} transition-colors relative group`}
                                                        >
                                                            {slot.isManualVacancy && (
                                                                <button onClick={() => handleRemoveAssignment(slot.slotId)} className="absolute -top-2 -right-2 bg-gray-400 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10">
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                            <div className={`w-8 h-8 rounded-full ${draggedWorker ? 'bg-blue-100 text-blue-500' : 'bg-red-100 text-red-400'} flex items-center justify-center flex-shrink-0`}>
                                                                <UserPlus size={16} />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className={`text-sm font-bold ${draggedWorker ? 'text-blue-500' : 'text-red-400'}`}>
                                                                    {draggedWorker ? 'Поставить' : (slot.isManualVacancy ? 'Закрыто' : 'Требуется')}
                                                                </div>
                                                                <div className={`text-xs font-bold ${draggedWorker ? 'text-blue-400' : 'text-slate-600'}`}>{slot.roleTitle}</div>
                                                            </div>
                                                            {!draggedWorker && !slot.isManualVacancy && (
                                                                <button
                                                                    onClick={() => setRvModalData({ date: selectedDate, roleTitle: slot.roleTitle, slotId: slot.slotId, currentShiftId: shift.id, currentShiftType: shift.type })}
                                                                    className="bg-orange-100 hover:bg-orange-200 text-orange-600 p-1.5 rounded-lg transition-colors"
                                                                    title="Назначить РВ"
                                                                >
                                                                    <UserPlus size={16} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white rounded-xl border border-yellow-200 shadow-sm p-4 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-yellow-400"></div>
                                    <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        {shift.type.toLowerCase().includes('день') ? <Sun size={18} className="text-yellow-500" /> : <Moon size={18} className="text-slate-600" />}
                                        Резерв ({shift.floaters.length})
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {shift.floaters.length > 0 ? (
                                            shift.floaters.map(p => (
                                                <div key={p.id} draggable onDragStart={(e) => handleDragStart(e, p)} className="flex items-center gap-2 p-2 bg-yellow-50 rounded border border-yellow-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group">
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
                                                className={`flex items-center gap-2 p-2 rounded border transition-shadow ${p.isAvailable ? 'bg-slate-50 border-slate-100 cursor-grab active:cursor-grabbing hover:shadow-md' : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'} ${p.isClone ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}
                                                title={p.isClone ? 'Совмещение сотрудника, уже занятое на линии' : (!p.isAvailable ? p.statusReason : (() => {
                                                    const regWorker = findWorkerInRegistry(p.name);
                                                    const comps = regWorker?.competencies;
                                                    return comps && (Array.isArray(comps) ? comps.length > 0 : comps.size > 0) 
                                                        ? `Компетенции: ${Array.isArray(comps) ? comps.join(', ') : Array.from(comps).join(', ')}` 
                                                        : '';
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
                                                        {(() => {
                                                            const regWorker = findWorkerInRegistry(p.name);
                                                            const comps = regWorker?.competencies;
                                                            return comps && (Array.isArray(comps) ? comps.length > 0 : comps.size > 0) && <GraduationCap size={10} className="text-blue-400" />;
                                                        })()}
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
                ))}
            </div>
            {contextMenu && (
                <div 
                    className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-50 min-w-[280px] max-w-[400px]"
                    style={{ 
                        left: `${contextMenu.x}px`, 
                        top: `${contextMenu.y}px`,
                        transform: 'translate(-10px, -10px)'
                    }}
                    onClick={(e) => e.stopPropagation()}
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
                                                const regWorker = findWorkerInRegistry(emp.name);
                                                const comps = regWorker?.competencies;
                                                const hasComps = comps && (Array.isArray(comps) ? comps.length > 0 : comps.size > 0);
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

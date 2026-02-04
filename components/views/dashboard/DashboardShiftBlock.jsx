import React from 'react';
import { Sun, Moon, ArrowRightLeft, UserPlus, GripVertical, X, Wand2, CheckSquare, Square, GraduationCap, Ban, Users, Copy, Briefcase, Plus } from 'lucide-react';
import FilledSlotCard from './FilledSlotCard';
import { FILLED_SLOT_CONFIGS } from './dashboardViewConstants';
import { getCompetenciesList, hasAnyCompetencies, dateToInputValue, normalizeInputDate } from './dashboardViewUtils';

export default function DashboardShiftBlock({
    shift,
    selectedDate,
    manualLineForm,
    setManualLineForm,
    getManualTemplateOptionsForShift,
    openManualLineForm,
    closeManualLineForm,
    handleManualLineTemplateChange,
    handleManualLineDisplayNameChange,
    handleManualLineSubmit,
    isGlobalFill,
    setIsGlobalFill,
    handleAutoFillFloaters,
    removeManualLine,
    findWorkerInRegistry,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleMarkOutsource,
    cloneAssignedWorker,
    handleRemoveAssignment,
    draggedWorker,
    removeCloneEntry,
    setContextMenu,
    setContextMenuSearch
}) {
    const isDayShift = shift.type?.toLowerCase().includes('день');
    const hasFloaters = shift.floaters.length > 0;
    const hasVacanciesHere = shift.filledSlots < shift.totalRequired;
    const isActive = hasFloaters && (isGlobalFill || hasVacanciesHere);
    const availableTemplates = getManualTemplateOptionsForShift(shift.id);
    const isDisabled = availableTemplates.length === 0;

    return (
        <div id={`brigade-${shift.id}`} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
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
                                        const extWorkerName = slot.assigned?.name;
                                        const extRegistryWorker = extWorkerName ? findWorkerInRegistry(extWorkerName) : null;
                                        const extCompetenciesList = getCompetenciesList(extRegistryWorker?.competencies);
                                        const extHasCompetencies = extCompetenciesList.length > 0;
                                        return (
                                            <div
                                                key={sIdx}
                                                draggable
                                                onDragStart={(e) => {
                                                    handleDragStart(e, { ...slot.assigned, sourceSlotId: slot.slotId });
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

                                    const filledCardProps = {
                                        slot,
                                        shift,
                                        selectedDate,
                                        draggedWorker,
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
                                                if (slot.status === 'vacancy' && !slot.isManualVacancy) {
                                                    const availableEmployees = [
                                                        ...(shift?.unassignedPeople || []).filter(p => p.isAvailable),
                                                        ...(shift?.floaters || [])
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
                                                <button onClick={() => handleRemoveAssignment(slot.slotId)} className="absolute bottom-1 right-1 w-5 h-5 bg-gray-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 flex items-center justify-center">
                                                    <X size={10} />
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
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleMarkOutsource(slot.slotId, slot.roleTitle)}
                                                        className="w-6 h-6 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-md border border-amber-200 transition-colors flex items-center justify-center shadow-sm"
                                                        title="Закрыть аутсорсом"
                                                    >
                                                        <Briefcase size={12} />
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
                                shift.floaters.map((p, idx) => (
                                    <div key={`${shift.id}-floater-${idx}`} draggable onDragStart={(e) => handleDragStart(e, p)} onDragEnd={handleDragEnd} className="flex items-center gap-2 p-2 bg-yellow-50 rounded border border-yellow-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group">
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
                            {shift.unassignedPeople.map((p, idx) => (
                                <div
                                    key={`${shift.id}-unassigned-${idx}`}
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
}

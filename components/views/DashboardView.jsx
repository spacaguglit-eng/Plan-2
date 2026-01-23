import React from 'react';
import { Sun, Moon, ArrowRightLeft, UserPlus, GripVertical, X, Wand2, CheckSquare, Square, GraduationCap, Ban, Users } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { RvPickerModal, DayStatusHeader } from '../../UIComponents';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';

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
        isGlobalFill,
        setIsGlobalFill,
        draggedWorker,
        viewMode
    } = useData();

    useRenderTime('dashboard', logPerformanceMetric, viewMode === 'dashboard');

    const shiftsData = getShiftsForDate(selectedDate);
    const dayStats = calculateDailyStats ? calculateDailyStats[selectedDate] : null;
    
    if (!shiftsData || shiftsData.length === 0) {
        return <div className="text-center py-20 text-slate-400">Нет смен на выбранную дату</div>;
    }

    return (
        <div className="pb-20">
            <DayStatusHeader stats={dayStats} date={selectedDate} />
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
                            </div>
                        </div>
                        <div className="p-6 bg-slate-100/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {shift.lineTasks.map((task, idx) => (
                                    <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                                            <h3 className="font-bold text-slate-700 text-sm truncate" title={task.displayName}>{task.displayName}</h3>
                                            <span className="text-xs font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-500">{task.slots.length} мест</span>
                                        </div>
                                        <div className="p-3 space-y-2 flex-1">
                                            {task.slots.map((slot, sIdx) => {
                                                const wName = slot.assigned?.name;
                                                const reg = wName ? workerRegistry[wName] : null;
                                                const isCompFill = reg && reg.competencies.has(slot.roleTitle);

                                                if (slot.assigned?.type === 'external') {
                                                    return (
                                                        <div key={sIdx} className="bg-orange-50 border-orange-200 border-2 p-2 rounded-lg relative group">
                                                            <button onClick={() => handleRemoveAssignment(slot.slotId)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 cursor-pointer">
                                                                <X size={12} />
                                                            </button>
                                                            <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-bl font-bold">РВ • Бр.{slot.assigned.sourceShift}</div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center font-bold text-xs">{slot.assigned.name[0]}</div>
                                                                <div className="min-w-0">
                                                                    <div className="font-semibold text-slate-700 text-sm truncate">{slot.assigned.name}</div>
                                                                    <div className="text-xs text-slate-500 truncate">{slot.assigned.role}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                const renderFilled = (statusColor, borderColor, iconBg, iconColor, assignedWorker, isManual = false) => (
                                                    <div className={`flex items-center gap-3 p-2 rounded-lg ${statusColor} border ${borderColor} relative group`}>
                                                        {(slot.status === 'filled' || isManual || slot.status === 'reassigned') && (
                                                            <button onClick={() => handleRemoveAssignment(slot.slotId)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 cursor-pointer">
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                        <div className={`w-8 h-8 rounded-full ${iconBg} ${iconColor} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                                                            {typeof assignedWorker.name === 'string' ? assignedWorker.name.substring(0, 1) : '?'}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm font-semibold text-slate-700 truncate">{typeof assignedWorker.name === 'string' ? assignedWorker.name : 'Error'}</div>
                                                            <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                                                                {assignedWorker.role} {isManual && <span className="text-blue-600 font-bold ml-1">★</span>}
                                                                {isCompFill && <span title="По компетенции"><GraduationCap size={10} className="text-blue-500 ml-1 inline" /></span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );

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
                                                        <div key={sIdx} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, slot.slotId)} className={`flex items-center gap-3 p-2 rounded-lg border-2 border-dashed ${draggedWorker ? 'border-blue-400 bg-blue-50' : 'border-red-200 bg-red-50/30'} transition-colors relative group`}>
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
                                            <div key={p.id} draggable={p.isAvailable} onDragStart={(e) => handleDragStart(e, p)} className={`flex items-center gap-2 p-2 rounded border transition-shadow ${p.isAvailable ? 'bg-slate-50 border-slate-100 cursor-grab active:cursor-grabbing hover:shadow-md' : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'}`} title={!p.isAvailable ? p.statusReason : (workerRegistry[p.name]?.competencies.size > 0 ? `Компетенции: ${Array.from(workerRegistry[p.name].competencies).join(', ')}` : '')}>
                                                {p.isAvailable ? <GripVertical size={14} className="text-slate-300" /> : <Ban size={14} className="text-red-400" />}
                                                <div className="min-w-0">
                                                    <div className="text-xs font-semibold text-slate-700 truncate flex items-center gap-1">
                                                        {p.name} {workerRegistry[p.name]?.competencies.size > 0 && <GraduationCap size={10} className="text-blue-400" />}
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
        </div>
    );
};

export default React.memo(DashboardView);

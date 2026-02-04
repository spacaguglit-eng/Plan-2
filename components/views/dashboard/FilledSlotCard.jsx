import React from 'react';
import { GripVertical, X, Copy, Briefcase, GraduationCap } from 'lucide-react';
import { getCompetenciesList, hasCompetencyForRole } from './dashboardViewUtils';

const FilledSlotCard = React.memo(({
    slot,
    shift,
    statusConfig,
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
}) => {
    const { statusColor, borderColor, iconBg, iconColor, isManual = false } = statusConfig;
    const assignedWorker = slot.assigned;
    const workerName = assignedWorker?.name;
    const registryWorker = workerName ? findWorkerInRegistry(workerName) : null;
    const displayRole = registryWorker?.role || assignedWorker?.role || 'Не указано';
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
export default FilledSlotCard;

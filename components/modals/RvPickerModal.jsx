import React, { useState } from 'react';
import { X, UserPlus, ToggleRight, ToggleLeft, Ban, GraduationCap } from 'lucide-react';
import { checkWorkerAvailability, getRealNeighborDateStrings } from '../../utils';

export const RvPickerModal = ({ isOpen, onClose, slotData, lineTemplates, workerRegistry, globalSchedule, scheduleDates, onAssign }) => {
    const [showAll, setShowAll] = useState(false);

    if (!isOpen || !slotData) return null;

    const { date, roleTitle, slotId, currentShiftType } = slotData;
    const { prev, next } = getRealNeighborDateStrings(date);
    const isTargetNight = currentShiftType.toLowerCase().includes('ночь');

    const candidates = [];
    const processedNames = new Set();

    let countTotal = 0;
    let countRole = 0;
    let countAvail = 0;
    let countWork = 0;

    Object.keys(lineTemplates).forEach(lineKey => {
        lineTemplates[lineKey].forEach(pos => {
            Object.entries(pos.roster).forEach(([bId, namesStr]) => {
                const names = namesStr.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1);
                names.forEach(name => {
                    if (processedNames.has(name)) return;
                    processedNames.add(name);
                    countTotal++;

                    const reg = workerRegistry[name];

                    const r1 = pos.role.toLowerCase();
                    const r2 = roleTitle.toLowerCase();
                    const hasRole = r1.includes(r2) || r2.includes(r1);
                    const hasComp = reg && Array.from(reg.competencies).some(c => c.toLowerCase().includes(r2));

                    if (!showAll && !hasRole && !hasComp) return;
                    countRole++;

                    const avail = checkWorkerAvailability(name, date, workerRegistry);
                    if (!avail.available) return;
                    countAvail++;

                    const todayShiftMap = globalSchedule[date];
                    const todayShift = todayShiftMap ? todayShiftMap.get(name) : undefined;

                    const nextShiftMap = globalSchedule[next];
                    const nextShift = nextShiftMap ? nextShiftMap.get(name) : undefined;

                    const prevShiftMap = globalSchedule[prev];
                    const prevShift = prevShiftMap ? prevShiftMap.get(name) : undefined;

                    let isBlocked = false;

                    if (todayShift) isBlocked = true;

                    if (!isBlocked) {
                        if (isTargetNight) {
                            if (nextShift && nextShift.includes('Day')) isBlocked = true;
                        } else {
                            if (prevShift && prevShift.includes('Night')) isBlocked = true;
                        }
                    }

                    if (!isBlocked) {
                        candidates.push({
                            name,
                            mainRole: pos.role,
                            homeLine: lineKey,
                            sourceShift: bId,
                            isComp: hasComp && !hasRole
                        });
                    } else {
                        countWork++;
                    }
                });
            });
        });
    });

    candidates.sort((a, b) => {
        if (a.isComp !== b.isComp) return a.isComp ? 1 : -1;
        return a.name.localeCompare(b.name);
    });

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                <div className="bg-orange-50 px-6 py-4 border-b border-orange-100 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-orange-800 flex items-center gap-2"><UserPlus size={20} /> Назначить РВ</h3>
                        <div className="text-xs text-orange-600 mt-1 flex gap-2">
                            <span>Найдено: {candidates.length}</span>
                            <span className="opacity-50">| Всего: {countTotal} | Роль: {countRole} | Доступны: {countAvail}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-orange-400 hover:text-orange-600"><X size={20} /></button>
                </div>

                <div className="p-4 bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <div>Вакансия: <span className="font-bold text-slate-800">{roleTitle}</span></div>
                            <div className="flex items-center gap-2">
                                Дата: <span className="font-bold text-slate-800">{date}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${isTargetNight ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {isTargetNight ? 'НОЧЬ' : 'ДЕНЬ'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowAll(!showAll)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${showAll ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                        >
                            {showAll ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            Все сотрудники
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {candidates.length === 0 ? (
                        <div className="text-center py-10 text-slate-400">
                            <Ban size={32} className="mx-auto mb-2 opacity-50" />
                            Нет доступных кандидатов<br />
                            <span className="text-xs">
                                {countWork > 0 ? "Сотрудники уже работают или отдыхают" : "Нет подходящих по роли или в отпуске"}
                            </span>
                        </div>
                    ) : (
                        candidates.map((worker, i) => (
                            <button
                                key={i}
                                onClick={() => onAssign(worker, slotId)}
                                className="w-full bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50 p-3 rounded-xl flex items-center justify-between group transition-all text-left"
                            >
                                <div>
                                    <div className="font-bold text-slate-700">{worker.name}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2">
                                        Бригада {worker.sourceShift} • {worker.mainRole}
                                        {worker.isComp && <span className="bg-blue-100 text-blue-600 px-1.5 rounded text-[10px] flex items-center gap-1"><GraduationCap size={10} /> Компетенция</span>}
                                    </div>
                                </div>
                                <div className="text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity font-bold text-sm">
                                    Выбрать
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

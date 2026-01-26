// UIComponents.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    X, Search, ArrowRightLeft, Plus, CheckCircle2, 
    UserPlus, ToggleRight, ToggleLeft, Ban, GraduationCap, 
    ChevronUp, ChevronDown, Edit3, AlertTriangle, Briefcase, Users, Trash2, Save, Undo2 
} from 'lucide-react';
import { checkWorkerAvailability, getRealNeighborDateStrings } from './utils';

export const MatrixAssignmentModal = ({ isOpen, onClose, context, currentNames, workerRegistry, lineTemplates, onSave }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedWorkers, setSelectedWorkers] = useState([]);

    useEffect(() => {
        if (isOpen) {
            const initialList = currentNames
                ? currentNames.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1)
                : [];
            setSelectedWorkers(initialList);
            setSearchTerm('');
        }
    }, [isOpen, currentNames]);

    const workerLocations = useMemo(() => {
        const locations = {}; 
        if (!isOpen || !lineTemplates) return locations;

        Object.entries(lineTemplates).forEach(([lineName, positions]) => {
            positions.forEach(pos => {
                Object.entries(pos.roster).forEach(([sId, namesStr]) => {
                    if (namesStr) {
                        const names = namesStr.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1);
                        names.forEach(name => {
                            const isCurrentCell = (lineName === context?.lineName) && (pos.role === context?.role) && (sId === context?.shiftId);
                            if (!isCurrentCell) {
                                locations[name] = { line: lineName, shift: sId, role: pos.role };
                            }
                        });
                    }
                });
            });
        });
        return locations;
    }, [isOpen, context, lineTemplates]);

    if (!isOpen) return null;

    const allWorkers = Object.values(workerRegistry).sort((a, b) => a.name.localeCompare(b.name));

    const filteredWorkers = allWorkers.filter(w => {
        if (selectedWorkers.includes(w.name)) return false;
        const matchName = w.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchRole = w.role && w.role.toLowerCase().includes(searchTerm.toLowerCase());
        return matchName || matchRole;
    });

    const handleAdd = (name) => {
        setSelectedWorkers([...selectedWorkers, name]);
    };

    const handleRemove = (name) => {
        setSelectedWorkers(selectedWorkers.filter(w => w !== name));
    };

    const handleCreateNew = () => {
        if (searchTerm.trim()) {
            handleAdd(searchTerm.trim());
            setSearchTerm('');
        }
    };

    const handleSaveInternal = () => {
        onSave(selectedWorkers);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center rounded-t-2xl">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">Назначение на линию</h3>
                        <div className="text-xs text-slate-500 mt-0.5">{context?.lineName} • {context?.role} • Смена {context?.shiftId}</div>
                    </div>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                </div>

                <div className="p-4 flex-1 overflow-hidden flex flex-col">
                    <div className="mb-4">
                        <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Выбраны ({selectedWorkers.length})</label>
                        <div className="flex flex-wrap gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100 min-h-[50px]">
                            {selectedWorkers.length === 0 ? (
                                <span className="text-slate-400 text-sm italic self-center">Никого не выбрано</span>
                            ) : (
                                selectedWorkers.map(name => (
                                    <div key={name} className="bg-white border border-blue-200 text-blue-800 text-sm px-2 py-1 rounded-lg flex items-center gap-2 shadow-sm animate-in zoom-in duration-200">
                                        <span className="font-medium">{name}</span>
                                        <button onClick={() => handleRemove(name)} className="text-blue-400 hover:text-red-500"><X size={14} /></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="relative mb-2">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Поиск сотрудника..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                autoFocus
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto border border-slate-100 rounded-lg bg-slate-50">
                            {filteredWorkers.map(w => {
                                const busyLocation = workerLocations[w.name];
                                return (
                                    <button
                                        key={w.name}
                                        onClick={() => handleAdd(w.name)}
                                        className="w-full text-left px-4 py-2 hover:bg-white hover:shadow-sm border-b border-slate-100 last:border-0 transition-all flex justify-between items-center group"
                                    >
                                        <div className="flex-1 min-w-0 pr-2">
                                            <div className="font-semibold text-slate-700 text-sm truncate">{w.name}</div>
                                            <div className="text-xs text-slate-400 flex flex-wrap gap-2 items-center">
                                                {w.role && <span>{w.role}</span>}
                                                {busyLocation ? (
                                                    <span className="text-orange-600 bg-orange-50 px-1.5 rounded flex items-center gap-1 font-medium truncate max-w-full" title={`Перенести с: ${busyLocation.line} (Смена ${busyLocation.shift})`}>
                                                        <ArrowRightLeft size={10} /> Перенести с: {busyLocation.line} ({busyLocation.shift})
                                                    </span>
                                                ) : (
                                                    w.homeLine ? <span className="text-slate-400">{w.homeLine}</span> : <span className="text-green-600 font-medium">Не распределен</span>
                                                )}
                                            </div>
                                        </div>
                                        <Plus size={16} className={`flex-shrink-0 group-hover:text-blue-500 ${busyLocation ? 'text-orange-300' : 'text-slate-300'}`} />
                                    </button>
                                );
                            })}
                            {searchTerm && filteredWorkers.length === 0 && (
                                <button
                                    onClick={handleCreateNew}
                                    className="w-full text-left px-4 py-3 text-blue-600 hover:bg-blue-50 font-medium text-sm flex items-center gap-2"
                                >
                                    <Plus size={16} /> Создать нового: "{searchTerm}"
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end rounded-b-2xl">
                    <button onClick={handleSaveInternal} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm flex items-center gap-2">
                        <CheckCircle2 size={18} /> Сохранить
                    </button>
                </div>
            </div>
        </div>
    );
};

export const UpdateReportModal = ({ data, onClose }) => {
    if (!data) return null;
    const { savedDays, savedAssignmentsCount, changedDays } = data;
    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="bg-green-100 p-2 rounded-full text-green-600"><CheckCircle2 size={24} /></div>
                    <h3 className="font-bold text-lg text-slate-800">План обновлен</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                        <h4 className="font-bold text-green-800 mb-2 flex items-center gap-2">📊 Сохранено</h4>
                        <ul className="space-y-1 text-sm text-green-700 font-medium">
                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> {savedDays} дней без изменений</li>
                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> {savedAssignmentsCount} ручных назначений</li>
                        </ul>
                    </div>
                    {changedDays.length > 0 ? (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                            <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2"><AlertTriangle size={18} /> Требуют проверки ({changedDays.length})</h4>
                            <div className="max-h-40 overflow-y-auto pr-2 space-y-2">
                                {changedDays.map((day, idx) => (
                                    <div key={idx} className="text-xs bg-white border border-amber-200 p-2 rounded text-amber-900 flex justify-between"><span className="font-bold">{day.date}</span><span>Бригада {day.shift}</span></div>
                                ))}
                            </div>
                        </div>
                    ) : (<div className="text-center text-slate-400 text-sm">Все дни совпали со старым планом</div>)}
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
                    <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors shadow-sm">Понятно</button>
                </div>
            </div>
        </div>
    );
};

export const RvPickerModal = ({ isOpen, onClose, slotData, lineTemplates, workerRegistry, globalSchedule, scheduleDates, currentShiftId, onAssign }) => {
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

export const CustomDateSelector = ({ dates, selectedDate, onSelect, dayStats }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => { if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getStatusColor = (date) => {
        if (!dayStats) return 'bg-slate-100 text-slate-500';
        const stats = dayStats[date];
        if (!stats) return 'bg-slate-100 text-slate-500';
        if (stats.status === 'complete') return 'bg-emerald-500 text-white';
        if (stats.status === 'warning') return 'bg-amber-500 text-white';
        if (stats.status === 'critical') return 'bg-red-500 text-white';
        return 'bg-slate-100 text-slate-500';
    };

    const getBorderClass = (date) => {
        if (!dayStats) return '';
        const stats = dayStats[date];
        if (stats && stats.manualEdits > 0) return 'ring-2 ring-blue-500 ring-offset-1';
        return '';
    };

    const selectedStats = dayStats ? dayStats[selectedDate] : null;

    return (
        <div className="relative w-64" ref={containerRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-semibold py-2 pl-3 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                    <span>{selectedDate || 'Выберите дату'}</span>
                    {selectedStats && (
                        <div className="flex items-center gap-1 ml-1 opacity-90">
                            {selectedStats.vacancies > 0 ? (
                                <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><AlertTriangle size={10} /> {selectedStats.vacancies}</span>
                            ) : (<span className="bg-green-100 text-green-600 text-[10px] px-1.5 py-0.5 rounded font-bold"><CheckCircle2 size={10} /></span>)}
                            {selectedStats.freeStaff > 0 && (<span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><Users size={10} /> {selectedStats.freeStaff}</span>)}
                        </div>
                    )}
                </div>
                {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-full max-h-80 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-2">
                    {dates.map(date => {
                        const stats = (dayStats && dayStats[date]) || { vacancies: 0, freeStaff: 0 };
                        const colorClass = getStatusColor(date);
                        const borderClass = getBorderClass(date);
                        return (
                            <div key={date} onClick={() => { onSelect(date); setIsOpen(false); }} className={`px-3 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between group transition-colors ${selectedDate === date ? 'bg-blue-50' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${colorClass === 'bg-slate-100 text-slate-500' ? 'bg-slate-300' : colorClass.split(' ')[0]}`}></div>
                                    <span className={`text-sm font-medium ${selectedDate === date ? 'text-blue-700' : 'text-slate-700'}`}>{date}</span>
                                    {selectedDate === date && <CheckCircle2 size={14} className="text-blue-600" />}
                                </div>
                                <div className="flex items-center gap-2">
                                    {getBorderClass(date) && <Edit3 size={12} className="text-blue-500" />}
                                    <div className="flex items-center gap-1 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold min-w-[35px] justify-center" title="Свободные штатные"><Users size={10} />{stats.freeStaff}</div>
                                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold min-w-[20px] text-center ${colorClass} ${borderClass}`} title="Вакансии">{stats.vacancies}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export const DayStatusHeader = ({ stats, date, autoReassignEnabled, onToggleAutoReassign, onBackup, onRestore }) => {
    if (!stats) return null;
    return (
        <div className="mb-6 space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">Дата: {date}</div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-white px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors select-none">
                        <input
                            type="checkbox"
                            className="accent-blue-600"
                            checked={autoReassignEnabled}
                            onChange={(e) => onToggleAutoReassign && onToggleAutoReassign(e.target.checked)}
                        />
                        <span>Автоподстановка</span>
                    </label>
                    <button
                        onClick={onBackup}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 rounded-lg border border-green-200 transition-colors"
                        title="Сохранить текущую расстановку в резервную копию"
                    >
                        <Save size={14} />
                        Сохранить в бэкап
                    </button>
                    <button
                        onClick={onRestore}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg border border-blue-200 transition-colors"
                        title="Восстановить расстановку из резервной копии"
                    >
                        <Undo2 size={14} />
                        Восстановить из бэкапа
                    </button>
                </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 border-r border-slate-100 pr-4"><div className="bg-slate-100 p-2 rounded-lg text-slate-600"><Briefcase size={20} /></div><div><div className="text-xs text-slate-500 font-medium">Всего мест</div><div className="text-lg font-bold text-slate-800">{stats.totalSlots}</div></div></div>
                <div className="flex items-center gap-3 border-r border-slate-100 pr-4"><div className={`p-2 rounded-lg ${stats.vacancies > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}><AlertTriangle size={20} /></div><div><div className="text-xs text-slate-500 font-medium">Вакансии</div><div className={`text-lg font-bold ${stats.vacancies > 0 ? 'text-red-600' : 'text-green-600'}`}>{stats.vacancies} <span className="text-xs text-slate-400 font-normal">({Math.round((stats.vacancies / stats.totalSlots) * 100 || 0)}%)</span></div></div></div>
                <div className="flex items-center gap-3 border-r border-slate-100 pr-4"><div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Users size={20} /></div><div><div className="text-xs text-slate-500 font-medium">Ресурс</div><div className="text-sm font-bold text-slate-700">{stats.freeStaff} <span className="text-slate-400 font-normal">штат</span> + {stats.floatersAvailable} <span className="text-slate-400 font-normal">резерв</span></div></div></div>
                <div className="flex items-center gap-3"><div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><Edit3 size={20} /></div><div><div className="text-xs text-slate-500 font-medium">Ручные правки</div><div className="text-lg font-bold text-indigo-600">{stats.manualEdits}</div></div></div>
            </div>
        </div>
    );
};

export const EditWorkerModal = ({ worker, onClose, onSave, onDelete, workerRegistry, lineTemplates }) => {
    const [name, setName] = useState(worker ? worker.name : '');
    const [statusType, setStatusType] = useState(worker?.status?.type || 'active');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedCompetencies, setSelectedCompetencies] = useState(
        worker && worker.competencies ? Array.from(worker.competencies) : []
    );
    const [compInput, setCompInput] = useState('');
    const [showCompDropdown, setShowCompDropdown] = useState(false);

    const allCompetencies = useMemo(() => {
        const set = new Set();

        Object.values(workerRegistry).forEach(w => {
            if (w.competencies) {
                w.competencies.forEach(c => set.add(c));
            }
        });

        if (lineTemplates) {
            Object.values(lineTemplates).forEach(positions => {
                positions.forEach(pos => {
                    if (pos.role) {
                        const roleName = pos.role.trim();
                        if (roleName) set.add(roleName);
                    }
                });
            });
        }

        return Array.from(set).sort();
    }, [workerRegistry, lineTemplates]);

    const filteredComps = allCompetencies.filter(c =>
        c.toLowerCase().includes(compInput.toLowerCase()) &&
        !selectedCompetencies.includes(c)
    );

    useEffect(() => {
        if (worker && worker.status && !worker.status.permanent) {
            const fmt = (d) => d ? d.toISOString().split('T')[0] : '';
            setDateFrom(fmt(worker.status.from));
            setDateTo(fmt(worker.status.to));
        }
    }, [worker]);

    const addCompetency = (comp) => {
        if (!selectedCompetencies.includes(comp)) {
            setSelectedCompetencies([...selectedCompetencies, comp]);
        }
        setCompInput('');
        setShowCompDropdown(false);
    };

    const removeCompetency = (compToRemove) => {
        setSelectedCompetencies(selectedCompetencies.filter(c => c !== compToRemove));
    };

    const handleSave = () => {
        if (!name.trim()) return;
        const compSet = new Set(selectedCompetencies);
        let newStatus = null;
        if (statusType !== 'active') {
            if (statusType === 'fired') {
                newStatus = { type: 'fired', raw: 'Уволен', permanent: true };
            } else if (dateFrom && dateTo) {
                const d1 = new Date(dateFrom);
                const d2 = new Date(dateTo);
                const raw = `${statusType === 'vacation' ? 'Отпуск' : 'Больничный'} ${d1.getDate()}.${d1.getMonth() + 1}-${d2.getDate()}.${d2.getMonth() + 1}`;
                newStatus = { type: statusType, from: d1, to: d2, raw, permanent: false };
            }
        }
        onSave({
            oldName: worker ? worker.name : null,
            newName: name.trim(),
            competencies: compSet,
            status: newStatus
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-visible flex flex-col max-h-[90vh]">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center rounded-t-2xl">
                    <h3 className="font-bold text-lg text-slate-800">{worker ? 'Редактировать сотрудника' : 'Новый сотрудник'}</h3>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ФИО</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>

                    <div className="relative">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Компетенции</label>
                        <div className="border border-slate-300 rounded-lg p-2 bg-white min-h-[42px] flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                            {selectedCompetencies.map(comp => (
                                <span key={comp} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                                    {comp}
                                    <button onClick={() => removeCompetency(comp)} className="hover:text-blue-900"><X size={12} /></button>
                                </span>
                            ))}
                            <input
                                type="text"
                                value={compInput}
                                onChange={(e) => { setCompInput(e.target.value); setShowCompDropdown(true); }}
                                onFocus={() => setShowCompDropdown(true)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && compInput.trim()) {
                                        e.preventDefault();
                                        addCompetency(compInput.trim());
                                    }
                                }}
                                className="flex-1 min-w-[100px] outline-none text-sm bg-transparent"
                                placeholder={selectedCompetencies.length === 0 ? "Выберите или введите..." : ""}
                            />
                        </div>

                        {showCompDropdown && compInput.length >= 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50">
                                {filteredComps.length > 0 ? (
                                    filteredComps.map(comp => (
                                        <div
                                            key={comp}
                                            onClick={() => addCompetency(comp)}
                                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm text-slate-700 flex items-center justify-between group"
                                        >
                                            {comp}
                                            <Plus size={14} className="opacity-0 group-hover:opacity-100 text-blue-500" />
                                        </div>
                                    ))
                                ) : (
                                    compInput.trim() && (
                                        <div
                                            onClick={() => addCompetency(compInput.trim())}
                                            className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm text-green-700 font-medium"
                                        >
                                            Добавить "{compInput}"
                                        </div>
                                    )
                                )}
                                {filteredComps.length === 0 && !compInput.trim() && (
                                    <div className="px-3 py-2 text-xs text-slate-400 italic">Нет доступных компетенций</div>
                                )}
                            </div>
                        )}
                        {showCompDropdown && (<div className="fixed inset-0 z-40" onClick={() => setShowCompDropdown(false)}></div>)}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Статус</label>
                        <div className="flex gap-2 mb-3">
                            {['active', 'vacation', 'sick', 'fired'].map(t => (
                                <button key={t} onClick={() => setStatusType(t)} className={`flex-1 py-1.5 text-xs font-bold rounded capitalize border ${statusType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}>
                                    {t === 'active' ? 'Работает' : (t === 'vacation' ? 'Отпуск' : (t === 'sick' ? 'Болеет' : 'Уволен'))}
                                </button>
                            ))}
                        </div>
                        {(statusType === 'vacation' || statusType === 'sick') && (
                            <div className="flex gap-2">
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="flex-1 border border-slate-300 rounded p-1 text-xs" />
                                <span className="text-slate-400 self-center">-</span>
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="flex-1 border border-slate-300 rounded p-1 text-xs" />
                            </div>
                        )}
                    </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between rounded-b-2xl">
                    {worker ? (
                        <button onClick={() => { if (confirm('Удалить сотрудника?')) { onDelete(worker.name); onClose(); } }} className="text-red-500 hover:text-red-700 text-sm font-semibold flex items-center gap-1"><Trash2 size={16} /> Удалить</button>
                    ) : <div></div>}
                    <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">Сохранить</button>
                </div>
            </div>
        </div>
    );
};
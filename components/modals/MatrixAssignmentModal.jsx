import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, ArrowRightLeft, Plus, CheckCircle2 } from 'lucide-react';

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

import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, CheckCircle2, Edit3, AlertTriangle, Users } from 'lucide-react';

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
            <button onClick={() => setIsOpen(!isOpen)} className="w-full relative bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-semibold py-2 pl-3 pr-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span>{selectedDate || 'Выберите дату'}</span>
                    {selectedStats && (
                        <div className="flex items-center gap-1 ml-1 opacity-90 shrink-0">
                            {selectedStats.vacancies > 0 ? (
                                <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><AlertTriangle size={10} /> {selectedStats.vacancies}</span>
                            ) : (<span className="bg-green-100 text-green-600 text-[10px] px-1.5 py-0.5 rounded font-bold"><CheckCircle2 size={10} /></span>)}
                            {selectedStats.freeStaff > 0 && (<span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><Users size={10} /> {selectedStats.freeStaff}</span>)}
                        </div>
                    )}
                </div>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 shrink-0">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
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

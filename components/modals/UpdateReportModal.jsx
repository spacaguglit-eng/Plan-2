import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

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

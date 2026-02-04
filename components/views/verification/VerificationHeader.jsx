import React from 'react';
import { FileCheck, CheckCircle2, AlertCircle, UserPlus, Calendar, Loader2, Trash2 } from 'lucide-react';

export default function VerificationHeader({
    stats,
    factDates,
    selectedDate,
    setSelectedDate,
    verificationWorkerStatus,
    useVerificationWorker,
    onResetFact
}) {
    return (
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
            <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                    <FileCheck size={24} />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Сверка факта</h2>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1 text-green-600 font-bold"><CheckCircle2 size={12} /> Пришли: {stats.ok}</span>
                        <span className="flex items-center gap-1 text-red-500 font-bold"><AlertCircle size={12} /> Прогулы: {stats.missing}</span>
                        <span className="flex items-center gap-1 text-orange-500 font-bold"><UserPlus size={12} /> Лишние: {stats.unexpected}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div className="relative">
                    <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {(factDates || []).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                {useVerificationWorker && verificationWorkerStatus?.status === 'calculating' && (
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Идёт расчёт…
                    </div>
                )}
                {useVerificationWorker && verificationWorkerStatus?.status === 'error' && (
                    <div className="text-xs text-red-500">
                        Ошибка расчёта: {verificationWorkerStatus?.error || 'неизвестная ошибка'}
                    </div>
                )}
                <div className="h-8 w-px bg-slate-200" />
                <button
                    type="button"
                    onClick={onResetFact}
                    className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Сбросить файл"
                >
                    <Trash2 size={20} />
                </button>
            </div>
        </div>
    );
}

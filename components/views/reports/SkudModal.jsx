import React from 'react';
import { Clock, X } from 'lucide-react';

export default function SkudModal({ open, onClose, factDates, factData }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Clock size={20} className="text-slate-500" />
                        Данные СКУД — что загружено и как читается
                    </h3>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-auto flex-1 space-y-6">
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 font-semibold text-slate-700 text-sm">factDates (список дат из СКУД)</div>
                        <div className="p-4 text-sm font-mono">
                            {!factDates || factDates.length === 0 ? (
                                <span className="text-amber-600">Нет данных — массив пуст или не загружен.</span>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {factDates.map(d => <span key={d} className="px-2 py-1 bg-slate-100 rounded text-slate-700">{d}</span>)}
                                </div>
                            )}
                            <div className="mt-2 text-slate-400 text-xs">Всего дат: {Array.isArray(factDates) ? factDates.length : 0}</div>
                        </div>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 font-semibold text-slate-700 text-sm">factData (по датам)</div>
                        <div className="p-4 text-sm">
                            {!factData || typeof factData !== 'object' ? (
                                <span className="text-amber-600">Нет данных — factData не загружен.</span>
                            ) : Object.keys(factData).length === 0 ? (
                                <span className="text-amber-600">Объект пуст.</span>
                            ) : (
                                <div className="space-y-4">
                                    {Object.entries(factData).slice(0, 5).map(([date, dayFact]) => (
                                        <details key={date} className="border border-slate-100 rounded-lg overflow-hidden">
                                            <summary className="px-3 py-2 bg-slate-50 cursor-pointer font-medium text-slate-700">
                                                {date} — записей: {dayFact && typeof dayFact === 'object' ? Object.keys(dayFact).length : 0}
                                            </summary>
                                            <div className="p-3 bg-white border-t border-slate-100">
                                                {dayFact && typeof dayFact === 'object' ? (
                                                    <ul className="space-y-2 text-xs font-mono">
                                                        {Object.entries(dayFact).slice(0, 20).map(([key, value]) => (
                                                            <li key={key} className="border-b border-slate-50 pb-2 last:border-0">
                                                                <span className="text-slate-500">Ключ:</span> {String(key)}
                                                                {value && typeof value === 'object' && (
                                                                    <div className="mt-1 text-slate-600 grid grid-cols-2 gap-x-4 gap-y-0.5">
                                                                        {['rawName', 'entryTime', 'exitTime', 'cleanTime', 'time', 'hasOvernightShift', 'nextDayExit'].map(f => (
                                                                            <span key={f}><span className="text-slate-400">{f}:</span> {value[f] != null ? String(value[f]) : '—'}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </li>
                                                        ))}
                                                        {Object.keys(dayFact).length > 20 && <li className="text-slate-400">… и ещё {Object.keys(dayFact).length - 20} записей</li>}
                                                    </ul>
                                                ) : (
                                                    <span className="text-slate-500">Не объект: {typeof dayFact}</span>
                                                )}
                                            </div>
                                        </details>
                                    ))}
                                    {Object.keys(factData).length > 5 && <p className="text-slate-400 text-xs">… и ещё {Object.keys(factData).length - 5} дат</p>}
                                </div>
                            )}
                            <div className="mt-2 text-slate-400 text-xs">Ожидаемая структура: factData[дата] = объект, ключи — идентификатор/ФИО, значение: rawName, entryTime, exitTime, cleanTime, time, hasOvernightShift, nextDayExit.</div>
                        </div>
                    </div>
                    <div className="border border-indigo-200 rounded-xl bg-indigo-50/30 overflow-hidden">
                        <div className="px-4 py-2 bg-indigo-100 border-b border-indigo-200 font-semibold text-indigo-800 text-sm">Как читается в отчёте «Анализ по сотрудникам»</div>
                        <div className="p-4 text-sm text-slate-700 space-y-2">
                            <p>1. Для каждой даты из factData строится индекс (factMap): по нормализованному ФИО (byNormKey, byNormRawName) и по фамилии (bySurname).</p>
                            <p>2. Для сотрудника из плана ищем запись СКУД: сначала точное совпадение нормализованного имени, иначе — по фамилии и matchNames(имя из плана, rawName из СКУД).</p>
                            <p>3. Статус: если найдена запись и есть cleanTime — «Выход», иначе при найденной записи — «Невыход», если запись не найдена — «—».</p>
                            <p>4. Переработки: по entryTime/exitTime (или nextDayExit для ночной) считается длительность смены; если больше 12 ч — разница считается переработкой.</p>
                            <p className="text-amber-700 font-medium mt-2">Если данные не подтягиваются — проверьте, что на вкладке «Верификация» загружен файл СКУД.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

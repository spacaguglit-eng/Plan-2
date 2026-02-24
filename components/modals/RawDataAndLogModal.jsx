import React, { useState } from 'react';
import { X, Database, ListOrdered, Trash2 } from 'lucide-react';

const RawDataBlock = ({ title, data, defaultOpen = false }) => {
    const [open, setOpen] = useState(defaultOpen);
    const json = JSON.stringify(data, null, 2);
    const size = typeof data === 'object' && data !== null
        ? Array.isArray(data) ? `${data.length} эл.` : `${Object.keys(data).length} ключей`
        : '—';
    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
                <span>{title}</span>
                <span className="text-slate-500 text-xs font-normal">{size}</span>
            </button>
            {open && (
                <pre className="p-4 bg-slate-900 text-slate-100 text-xs overflow-x-auto max-h-64 overflow-y-auto border-t border-slate-200">
                    {json}
                </pre>
            )}
        </div>
    );
};

export const RawDataAndLogModal = ({
    rawTables,
    scheduleDates,
    planHashes,
    lineTemplates,
    floaters,
    workerRegistry,
    manualAssignments,
    manualLines,
    assignmentClones,
    dataChangeLog = [],
    clearDataChangeLog,
    onClose,
}) => {
    const [activeTab, setActiveTab] = useState('data'); // 'data' | 'log'

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <Database size={22} className="text-slate-600" />
                        <h2 className="text-lg font-bold text-slate-800">Сырые данные и лог изменений</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex border-b border-slate-200">
                    <button
                        type="button"
                        onClick={() => setActiveTab('data')}
                        className={`px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'data'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                                : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        Сырые данные
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('log')}
                        className={`px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'log'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                                : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        Лог изменений ({dataChangeLog.length})
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                    {activeTab === 'data' && (
                        <div className="space-y-3">
                            <RawDataBlock title="Расписание (rawTables.demand)" data={rawTables?.demand} />
                            <RawDataBlock title="Справочник людей (rawTables.roster)" data={rawTables?.roster} />
                            <RawDataBlock title="Даты расписания (scheduleDates)" data={scheduleDates} />
                            <RawDataBlock title="Хеши плана (planHashes)" data={planHashes} />
                            <RawDataBlock title="Шаблоны линий (lineTemplates)" data={lineTemplates} />
                            <RawDataBlock title="Свободные руки (floaters)" data={floaters} />
                            <RawDataBlock title="Реестр сотрудников (workerRegistry)" data={workerRegistry} />
                            <RawDataBlock title="Ручная расстановка (manualAssignments)" data={manualAssignments} />
                            <RawDataBlock title="Ручные линии (manualLines)" data={manualLines} />
                            <RawDataBlock title="Клоны расстановки (assignmentClones)" data={assignmentClones} />
                        </div>
                    )}

                    {activeTab === 'log' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm text-slate-500">Записи при вызове persistStateKey (последние 100)</span>
                                {dataChangeLog.length > 0 && clearDataChangeLog && (
                                    <button
                                        type="button"
                                        onClick={clearDataChangeLog}
                                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                        Очистить лог
                                    </button>
                                )}
                            </div>
                            {dataChangeLog.length === 0 ? (
                                <div className="text-sm text-slate-400 py-8 text-center">Нет записей</div>
                            ) : (
                                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                                    {dataChangeLog.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-sm"
                                        >
                                            <ListOrdered size={16} className="text-slate-400 shrink-0" />
                                            <span className="font-medium text-slate-700">{entry.keyLabel}</span>
                                            <span className="text-slate-400 text-xs">{entry.key}</span>
                                            <span className="ml-auto text-xs text-slate-500">
                                                {entry.ts ? new Date(entry.ts).toLocaleString('ru') : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-slate-700 hover:bg-slate-800 text-white font-medium py-2 px-5 rounded-lg transition-colors"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
};

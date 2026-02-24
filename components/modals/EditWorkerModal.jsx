import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

export const EditWorkerModal = ({ worker, onClose, onSave, onDelete, workerRegistry, lineTemplates }) => {
    const [name, setName] = useState(worker ? worker.name : '');
    const [statusType, setStatusType] = useState(worker?.status?.type || 'active');
    const [fiveDay, setFiveDay] = useState(worker?.fiveDay ?? false);
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
            status: newStatus,
            fiveDay
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
                        <div className="flex gap-2 mb-3 flex-wrap">
                            {['active', 'vacation', 'sick', 'fired'].map(t => (
                                <button key={t} onClick={() => setStatusType(t)} className={`flex-1 min-w-[80px] py-1.5 text-xs font-bold rounded capitalize border ${statusType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}>
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
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                            <input type="checkbox" checked={fiveDay} onChange={e => setFiveDay(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm font-medium text-slate-700">Пятидневка (только дневная смена)</span>
                        </label>
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

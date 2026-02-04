import React, { useState, useEffect } from 'react';
import { Settings, X, Plus, Trash2 } from 'lucide-react';

export default function ManageDepartmentsModal({ isOpen, onClose, masterList, onUpdate }) {
    const [departments, setDepartments] = useState([]);
    const [newDeptInput, setNewDeptInput] = useState('');

    useEffect(() => {
        if (isOpen) {
            setDepartments([...masterList]);
            setNewDeptInput('');
        }
    }, [isOpen, masterList]);

    const handleAdd = () => {
        const trimmed = newDeptInput.trim();
        if (trimmed && !departments.includes(trimmed)) {
            const updated = [...departments, trimmed].sort();
            setDepartments(updated);
            setNewDeptInput('');
            onUpdate(updated);
        }
    };

    const handleDelete = (deptToDelete) => {
        const updated = departments.filter(d => d !== deptToDelete);
        setDepartments(updated);
        onUpdate(updated);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-blue-800 flex items-center gap-2">
                            <Settings size={20} /> Управление отделениями
                        </h3>
                        <p className="text-xs text-blue-600 mt-1">Добавьте или удалите отделения из списка</p>
                    </div>
                    <button onClick={onClose} className="text-blue-400 hover:text-blue-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Добавить новое отделение
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newDeptInput}
                                onChange={(e) => setNewDeptInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAdd();
                                }}
                                placeholder="Введите название отделения"
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button
                                onClick={handleAdd}
                                disabled={!newDeptInput.trim() || departments.includes(newDeptInput.trim())}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <Plus size={16} /> Добавить
                            </button>
                        </div>
                        {newDeptInput.trim() && departments.includes(newDeptInput.trim()) && (
                            <p className="text-xs text-red-500 mt-1">Это отделение уже существует</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Список отделений ({departments.length})
                        </label>
                        {departments.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-sm">
                                Нет отделений. Добавьте первое отделение выше.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {departments.map((dept) => (
                                    <div
                                        key={dept}
                                        className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                                    >
                                        <span className="text-sm font-medium text-slate-700">{dept}</span>
                                        <button
                                            onClick={() => handleDelete(dept)}
                                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Удалить отделение"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
}

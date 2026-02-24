import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Upload, FolderOpen, Star, ShieldCheck, Trash2, Save, AlertCircle, Users } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { ExcelImportPartsModal } from '../modals/ExcelImportPartsModal';

const PlansView = () => {
    const {
        savedPlans,
        currentPlanId,
        saveCurrentAsNewPlan,
        loadPlan,
        setPlanType,
        deletePlan,
        importPlanFromJson,
        importPlanFromExcelFilePartial,
        pullRosterFromPlanToGlobal
    } = useData();

    const fileInputRef = useRef(null);
    const selectAllCheckboxRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [selectedPlanIds, setSelectedPlanIds] = useState(new Set());
    const [excelModalOpen, setExcelModalOpen] = useState(false);
    const [pendingExcelFile, setPendingExcelFile] = useState(null);

    const activePlan = useMemo(
        () => savedPlans.find(plan => plan.id === currentPlanId),
        [savedPlans, currentPlanId]
    );
    const handleUpload = async (file) => {
        if (!file) return;
        setUploadError('');

        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'json') {
            setIsUploading(true);
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                importPlanFromJson(data, file.name.replace(/\.json$/i, ''));
            } catch (err) {
                setUploadError(err?.message || 'Ошибка загрузки файла');
            } finally {
                setIsUploading(false);
            }
            return;
        }

        if (ext === 'xlsx' || ext === 'xls') {
            setPendingExcelFile(file);
            setExcelModalOpen(true);
            return;
        }

        setUploadError('Поддерживаются только .xlsx/.xls/.json');
    };

    const handleExcelModalCancel = () => {
        setExcelModalOpen(false);
        setPendingExcelFile(null);
    };

    const handleExcelModalConfirm = async (options) => {
        if (!pendingExcelFile) {
            setExcelModalOpen(false);
            return;
        }
        setIsUploading(true);
        setUploadError('');
        try {
            await importPlanFromExcelFilePartial(pendingExcelFile, options);
        } catch (err) {
            setUploadError(err?.message || 'Ошибка загрузки файла');
        } finally {
            setIsUploading(false);
            setExcelModalOpen(false);
            setPendingExcelFile(null);
        }
    };

    const handleSaveCurrent = () => {
        const name = window.prompt('Название новой версии плана:', activePlan?.name ? `${activePlan.name} (копия)` : '');
        if (name !== null && name.trim().length > 0) {
            saveCurrentAsNewPlan(name.trim());
        }
    };

    const toggleSelectPlan = (planId) => {
        setSelectedPlanIds(prev => {
            const next = new Set(prev);
            if (next.has(planId)) {
                next.delete(planId);
            } else {
                next.add(planId);
            }
            return next;
        });
    };

    const selectAllPlans = () => {
        setSelectedPlanIds(new Set(savedPlans.map(plan => plan.id)));
    };

    const clearSelection = () => {
        setSelectedPlanIds(new Set());
    };

    const isAllSelected = savedPlans.length > 0 && selectedPlanIds.size === savedPlans.length;

    const handleSelectAllChange = (checked) => {
        if (checked) {
            selectAllPlans();
        } else {
            clearSelection();
        }
    };

    const deleteSelectedPlans = () => {
        selectedPlanIds.forEach(id => deletePlan(id));
        clearSelection();
    };

    useEffect(() => {
        setSelectedPlanIds(prev => {
            if (prev.size === 0 && savedPlans.length === 0) {
                return prev;
            }
            const available = new Set(savedPlans.map(plan => plan.id));
            const filtered = new Set([...prev].filter(id => available.has(id)));
            if (filtered.size === prev.size) {
                let same = true;
                for (const id of filtered) {
                    if (!prev.has(id)) {
                        same = false;
                        break;
                    }
                }
                if (same) {
                    return prev;
                }
            }
            return filtered;
        });
    }, [savedPlans]);

    useEffect(() => {
        const checkbox = selectAllCheckboxRef.current;
        if (checkbox) {
            checkbox.indeterminate = selectedPlanIds.size > 0 && selectedPlanIds.size < savedPlans.length;
        }
    }, [selectedPlanIds, savedPlans.length]);

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
                        <FolderOpen size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Планы</h2>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSaveCurrent}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 transition-colors"
                    >
                        <Save size={16} />
                        Сохранить версию
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                    >
                        <Upload size={16} />
                        Загрузить план
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => handleUpload(e.target.files?.[0])}
                        className="hidden"
                        accept=".xlsx,.xls,.json"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-hidden p-6 max-w-[1400px] mx-auto w-full">
                {uploadError && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-2 text-sm">
                        <AlertCircle size={16} />
                        {uploadError}
                    </div>
                )}
                {isUploading && (
                    <div className="mb-4 text-sm text-slate-500">Загрузка файла…</div>
                )}
                <div className="mb-3 text-xs text-slate-500">
                    Детальное сравнение изменений между планами доступно в разделе <span className="font-semibold">«Отчёты»</span>.
                </div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                    <div>Выбрано: {selectedPlanIds.size}</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={selectAllPlans}
                            disabled={savedPlans.length === 0}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-300 transition-colors"
                        >
                            Выделить все
                        </button>
                        <button
                            onClick={clearSelection}
                            disabled={selectedPlanIds.size === 0}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-300 transition-colors"
                        >
                            Снять все
                        </button>
                        <button
                            onClick={deleteSelectedPlans}
                            disabled={selectedPlanIds.size === 0}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-100 text-red-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-200 transition-colors"
                        >
                            Удалить выделенные
                        </button>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="max-h-[60vh] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold">
                                <tr>
                                    <th className="w-12 px-4 py-3 border-b text-center">
                                        <input
                                            type="checkbox"
                                            ref={selectAllCheckboxRef}
                                            checked={isAllSelected}
                                            onChange={(e) => handleSelectAllChange(e.target.checked)}
                                            className="h-4 w-4 text-slate-600"
                                        />
                                    </th>
                                    <th className="px-6 py-3 border-b">Название</th>
                                    <th className="px-6 py-3 border-b">Дата</th>
                                    <th className="px-6 py-3 border-b">Тип</th>
                                    <th className="px-6 py-3 border-b text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {savedPlans.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                            Пока нет сохранённых планов
                                        </td>
                                    </tr>
                                )}
                                {savedPlans.map(plan => (
                                    <tr
                                        key={plan.id}
                                        className={
                                            plan.id === currentPlanId
                                                ? 'bg-blue-50/40'
                                                : selectedPlanIds.has(plan.id)
                                                ? 'bg-slate-50'
                                                : ''
                                        }
                                    >
                                        <td className="px-4 py-3 border-b text-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedPlanIds.has(plan.id)}
                                                onChange={() => toggleSelectPlan(plan.id)}
                                                className="h-4 w-4 text-slate-600"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="font-semibold text-slate-800">{plan.name}</div>
                                            {plan.id === currentPlanId && (
                                                <div className="text-xs text-blue-600 font-semibold">Активный</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-slate-500">
                                            {plan.createdAt ? new Date(plan.createdAt).toLocaleString('ru-RU') : '—'}
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-2">
                                                {plan.type === 'Master' && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                                                        <ShieldCheck size={12} /> Основной
                                                    </span>
                                                )}
                                                {plan.type === 'Operational' && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 font-semibold">
                                                        <Star size={12} /> Оперативный
                                                    </span>
                                                )}
                                                {!plan.type && <span className="text-xs text-slate-400">—</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => loadPlan(plan.id)}
                                                    className="px-3 py-1.5 text-xs font-semibold bg-slate-800 text-white rounded-md hover:bg-slate-900"
                                                >
                                                    Загрузить
                                                </button>
                                                <button
                                                    onClick={() => setPlanType(plan.id, 'Master')}
                                                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200"
                                                >
                                                    Сделать основным
                                                </button>
                                                <button
                                                    onClick={() => setPlanType(plan.id, 'Operational')}
                                                    className="px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                                                >
                                                    Сделать оперативным
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const ok = window.confirm('Забрать справочник (люди/линии) из этого плана и применить ГЛОБАЛЬНО?');
                                                        if (!ok) return;
                                                        pullRosterFromPlanToGlobal(plan.id);
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-semibold bg-violet-100 text-violet-700 rounded-md hover:bg-violet-200"
                                                    title="Забрать людей/линии из плана (глобально)"
                                                >
                                                    <Users size={12} />
                                                </button>
                                                <button
                                                    onClick={() => deletePlan(plan.id)}
                                                    className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <ExcelImportPartsModal
                isOpen={excelModalOpen}
                onCancel={handleExcelModalCancel}
                onConfirm={handleExcelModalConfirm}
            />
        </div>
    );
};

export default React.memo(PlansView);

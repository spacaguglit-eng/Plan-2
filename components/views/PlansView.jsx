import React, { useMemo, useRef, useState } from 'react';
import { Upload, FolderOpen, Star, ShieldCheck, Trash2, Save, AlertCircle } from 'lucide-react';
import { useData } from '../../context/DataContext';

const PlansView = () => {
    const {
        savedPlans,
        currentPlanId,
        saveCurrentAsNewPlan,
        loadPlan,
        setPlanType,
        deletePlan,
        importPlanFromJson,
        importPlanFromExcelFile
    } = useData();

    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');

    const activePlan = useMemo(
        () => savedPlans.find(plan => plan.id === currentPlanId),
        [savedPlans, currentPlanId]
    );

    const handleUpload = async (file) => {
        if (!file) return;
        setUploadError('');
        setIsUploading(true);

        try {
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (ext === 'json') {
                const text = await file.text();
                const data = JSON.parse(text);
                importPlanFromJson(data, file.name.replace(/\.json$/i, ''));
            } else if (ext === 'xlsx' || ext === 'xls') {
                await importPlanFromExcelFile(file);
            } else {
                throw new Error('Поддерживаются только .xlsx/.xls/.json');
            }
        } catch (err) {
            setUploadError(err?.message || 'Ошибка загрузки файла');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveCurrent = () => {
        const name = window.prompt('Название новой версии плана:', activePlan?.name ? `${activePlan.name} (копия)` : '');
        if (name !== null && name.trim().length > 0) {
            saveCurrentAsNewPlan(name.trim());
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
                        <FolderOpen size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Планы</h2>
                        <div className="text-xs text-slate-500">
                            Активный план: {activePlan?.name || 'не выбран'}
                        </div>
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
                    <div className="h-8 w-px bg-slate-200" />
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-semibold">
                            <tr>
                                <th className="px-6 py-3 border-b">Название</th>
                                <th className="px-6 py-3 border-b">Дата</th>
                                <th className="px-6 py-3 border-b">Тип</th>
                                <th className="px-6 py-3 border-b text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {savedPlans.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                        Пока нет сохранённых планов
                                    </td>
                                </tr>
                            )}
                            {savedPlans.map(plan => (
                                <tr key={plan.id} className={plan.id === currentPlanId ? 'bg-blue-50/40' : ''}>
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
                                                onClick={() => {
                                                    const code = window.prompt('Введите PIN-код для установки основного плана:');
                                                    if (code === '1234') {
                                                        setPlanType(plan.id, 'Master');
                                                    } else if (code !== null) {
                                                        alert('Неверный PIN-код.');
                                                    }
                                                }}
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
    );
};

export default React.memo(PlansView);

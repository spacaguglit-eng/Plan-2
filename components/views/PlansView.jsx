import React, { useMemo, useRef, useState } from 'react';
import { Upload, FolderOpen, Star, ShieldCheck, Trash2, Save, AlertCircle, ArrowLeftRight, X, Plus, Minus, ArrowRight, RefreshCw, ChevronDown, ChevronRight, UserPlus, UserMinus } from 'lucide-react';
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
        importPlanFromExcelFile,
        comparePlanSnapshots
    } = useData();

    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [compareError, setCompareError] = useState('');
    const [compareOpen, setCompareOpen] = useState(false);
    const [compareResult, setCompareResult] = useState(null);
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());

    const activePlan = useMemo(
        () => savedPlans.find(plan => plan.id === currentPlanId),
        [savedPlans, currentPlanId]
    );
    const masterPlan = useMemo(
        () => savedPlans.find(plan => plan.type === 'Master'),
        [savedPlans]
    );
    const operationalPlan = useMemo(
        () => savedPlans.find(plan => plan.type === 'Operational'),
        [savedPlans]
    );

    const canCompare = !!(masterPlan?.data && operationalPlan?.data);

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

    const handleCompare = () => {
        if (!canCompare) {
            setCompareError('Нужны выбранные Основной и Оперативный планы.');
            setCompareOpen(false);
            setCompareResult(null);
            return;
        }
        setCompareError('');
        const result = comparePlanSnapshots(masterPlan.data, operationalPlan.data);
        setCompareResult(result);
        setCollapsedGroups(new Set()); // Сбрасываем свернутые группы при новом сравнении
        setCompareOpen(true);
    };

    const toggleGroup = (groupKey) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) {
                next.delete(groupKey);
            } else {
                next.add(groupKey);
            }
            return next;
        });
    };

    const toggleAllGroups = () => {
        if (compareGroups.length === 0) return;
        const allKeys = compareGroups.map(g => `${g.date}_${g.shiftId}`);
        if (collapsedGroups.size === compareGroups.length) {
            setCollapsedGroups(new Set());
        } else {
            setCollapsedGroups(new Set(allKeys));
        }
    };

    const getGroupSummary = (items) => {
        const counts = { added: 0, lost: 0, replaced: 0, moved: 0 };
        items.forEach(item => {
            if (item.type in counts) counts[item.type]++;
        });
        return counts;
    };

    const compareGroups = useMemo(() => {
        if (!compareResult) return [];
        const { moved = [], added = [], lost = [], replaced = [] } = compareResult.changes || {};
        const items = [];

        moved.forEach(entry => {
            items.push({
                type: 'moved',
                date: entry.from.date,
                shiftId: entry.from.shiftId,
                entry
            });
        });
        added.forEach(entry => {
            items.push({
                type: 'added',
                date: entry.date,
                shiftId: entry.shiftId,
                entry
            });
        });
        lost.forEach(entry => {
            items.push({
                type: 'lost',
                date: entry.date,
                shiftId: entry.shiftId,
                entry
            });
        });
        replaced.forEach(entry => {
            items.push({
                type: 'replaced',
                date: entry.date,
                shiftId: entry.shiftId,
                entry
            });
        });

        const parseDate = (value) => {
            const parts = String(value || '').split('.');
            if (parts.length !== 3) return 0;
            const [day, month, year] = parts.map(Number);
            return new Date(year, month - 1, day).getTime() || 0;
        };

        const groupMap = new Map();
        items.forEach(item => {
            const key = `${item.date}_${item.shiftId}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, { date: item.date, shiftId: item.shiftId, items: [] });
            }
            groupMap.get(key).items.push(item);
        });

        return Array.from(groupMap.values())
            .sort((a, b) => parseDate(a.date) - parseDate(b.date) || String(a.shiftId).localeCompare(String(b.shiftId)));
    }, [compareResult]);

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
                    <button
                        onClick={handleCompare}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            canCompare
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                        disabled={!canCompare}
                    >
                        <ArrowLeftRight size={16} />
                        Сравнить планы
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
                {compareError && (
                    <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-lg flex items-center gap-2 text-sm">
                        <AlertCircle size={16} />
                        {compareError}
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
                {compareOpen && compareResult && (
                    <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                            <div>
                                <div className="text-sm text-slate-500">Сравнение планов</div>
                                <div className="text-base font-semibold text-slate-800">
                                    {masterPlan?.name || 'Основной'} → {operationalPlan?.name || 'Оперативный'}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {compareGroups.length > 0 && (
                                    <button
                                        onClick={toggleAllGroups}
                                        className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
                                    >
                                        {collapsedGroups.size === compareGroups.length ? 'Развернуть все' : 'Свернуть все'}
                                    </button>
                                )}
                                <button
                                    onClick={() => setCompareOpen(false)}
                                    className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="px-6 pb-6 pt-4 overflow-y-auto flex-1 min-h-0">
                            {compareGroups.length === 0 ? (
                                <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
                                    Изменений в расстановке не найдено.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {compareGroups.map(group => {
                                        const groupKey = `${group.date}_${group.shiftId}`;
                                        const isCollapsed = collapsedGroups.has(groupKey);
                                        const summary = getGroupSummary(group.items);
                                        const hasSummary = Object.values(summary).some(count => count > 0);

                                        return (
                                            <div key={groupKey} className="border border-slate-200 rounded-lg overflow-hidden">
                                                <div
                                                    onClick={() => toggleGroup(groupKey)}
                                                    className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors flex items-center justify-between"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {isCollapsed ? (
                                                            <ChevronRight className="text-slate-500" size={16} />
                                                        ) : (
                                                            <ChevronDown className="text-slate-500" size={16} />
                                                        )}
                                                        <span>
                                                            {group.date} — смена {group.shiftId}
                                                        </span>
                                                    </div>
                                                    {isCollapsed && hasSummary && (
                                                        <div className="flex items-center gap-1.5">
                                                            {summary.added > 0 && (
                                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                                                    <UserPlus size={12} />
                                                                    {summary.added}
                                                                </span>
                                                            )}
                                                            {summary.lost > 0 && (
                                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                                                    <UserMinus size={12} />
                                                                    {summary.lost}
                                                                </span>
                                                            )}
                                                            {summary.replaced > 0 && (
                                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                                                    <RefreshCw size={12} />
                                                                    {summary.replaced}
                                                                </span>
                                                            )}
                                                            {summary.moved > 0 && (
                                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                                                    <ArrowLeftRight size={12} />
                                                                    {summary.moved}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {!isCollapsed && (
                                                    <div className="p-4 space-y-2">
                                                        {group.items.map((item, idx) => {
                                                            if (item.type === 'moved') {
                                                                const { entry } = item;
                                                                return (
                                                                    <div
                                                                        key={`moved_${idx}`}
                                                                        className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg"
                                                                    >
                                                                        <ArrowRight className="text-blue-600 mt-0.5 flex-shrink-0" size={18} />
                                                                        <div className="flex-1 text-sm text-slate-800">
                                                                            <span className="font-semibold">{entry.name}</span> переведён с{' '}
                                                                            <span className="font-medium">{entry.from.lineName}</span> / {entry.from.role} на{' '}
                                                                            <span className="font-medium">{entry.to.lineName}</span> / {entry.to.role}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            if (item.type === 'added') {
                                                                return (
                                                                    <div
                                                                        key={`added_${idx}`}
                                                                        className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg"
                                                                    >
                                                                        <Plus className="text-emerald-600 mt-0.5 flex-shrink-0" size={18} />
                                                                        <div className="flex-1 text-sm text-slate-800">
                                                                            Назначен: <span className="font-semibold">{item.entry.name}</span> на{' '}
                                                                            <span className="font-medium">{item.entry.lineName}</span> / {item.entry.role}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            if (item.type === 'lost') {
                                                                return (
                                                                    <div
                                                                        key={`lost_${idx}`}
                                                                        className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg"
                                                                    >
                                                                        <Minus className="text-red-600 mt-0.5 flex-shrink-0" size={18} />
                                                                        <div className="flex-1 text-sm text-slate-800">
                                                                            Снят со смены: <span className="font-semibold">{item.entry.name}</span> с{' '}
                                                                            <span className="font-medium">{item.entry.lineName}</span> / {item.entry.role}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            if (item.type === 'replaced') {
                                                                return (
                                                                    <div
                                                                        key={`replaced_${idx}`}
                                                                        className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg"
                                                                    >
                                                                        <RefreshCw className="text-amber-600 mt-0.5 flex-shrink-0" size={18} />
                                                                        <div className="flex-1 text-sm text-slate-800">
                                                                            <span className="font-medium">{item.entry.lineName}</span> / {item.entry.role}:{' '}
                                                                            <span className="font-semibold">{item.entry.fromName}</span> →{' '}
                                                                            <span className="font-semibold">{item.entry.toName}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(PlansView);

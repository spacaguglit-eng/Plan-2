import React from 'react';
import { CheckCircle2, XCircle, AlertCircle, Edit3, X, Plus } from 'lucide-react';

function StatusBadge({ status }) {
    if (status === 'ok') {
        return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> Пришел</span>;
    }
    if (status === 'missing') {
        return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><XCircle size={12} /> Не пришел</span>;
    }
    if (status === 'unexpected') {
        return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"><AlertCircle size={12} /> Не в смену</span>;
    }
    return null;
}

function DepartmentCell({
    row,
    editingDepartment,
    departmentInput,
    setDepartmentInput,
    handleDepartmentChange,
    startEditingDepartment,
    setEditingDepartment,
    originalDepartmentRef,
    departmentSuggestions,
    datalistId
}) {
    if (editingDepartment === row.name) {
        return (
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    list={datalistId}
                    value={departmentInput}
                    onChange={e => setDepartmentInput(e.target.value)}
                    onBlur={() => handleDepartmentChange(row.name, departmentInput)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') handleDepartmentChange(row.name, departmentInput);
                        else if (e.key === 'Escape') {
                            setEditingDepartment(null);
                            setDepartmentInput('');
                            originalDepartmentRef.current = null;
                        }
                    }}
                    className="px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none w-40"
                    autoFocus
                />
                <datalist id={datalistId}>
                    {(departmentSuggestions || []).map(dept => <option key={dept} value={dept} />)}
                </datalist>
                <button type="button" onClick={() => handleDepartmentChange(row.name, departmentInput)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Сохранить">
                    <CheckCircle2 size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => { setEditingDepartment(null); setDepartmentInput(''); originalDepartmentRef.current = null; }}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Отмена"
                >
                    <X size={14} />
                </button>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2">
            <span className={row.department ? 'text-slate-700' : 'text-slate-300 italic'}>
                {row.department || 'Не указано'}
            </span>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); startEditingDepartment(row.name, row.department); }}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Редактировать отделение"
            >
                <Edit3 size={14} />
            </button>
        </div>
    );
}

function FactTimeCell({ row }) {
    if (!row.fact) return <span className="text-slate-400 italic">Нет данных</span>;
    return (
        <div className="space-y-1">
            <div className={`font-mono text-sm px-2 py-1 rounded inline-block border text-center ${
                row.timeInfo?.hasOvernightShift ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
                {row.time}
            </div>
            {row.timeInfo?.hasOvernightShift && (
                <div className="text-xs text-blue-600 font-medium">
                    {row.timeInfo?.nextDayExit ? `Ночная смена (выход ${row.timeInfo.nextDayExit} на след. день)` : 'Ночная смена'}
                </div>
            )}
            {row.timeInfo?.entryTime && row.timeInfo?.exitTime && !row.timeInfo?.hasOvernightShift && (
                <div className="text-xs text-slate-500">
                    Вход: {row.timeInfo.entryTime}, Выход: {row.timeInfo.exitTime}
                </div>
            )}
        </div>
    );
}

function FactTimeCellFlat({ row }) {
    if (!row.fact) return <span className="text-slate-300">—</span>;
    return (
        <div className="space-y-1">
            <div className={`font-mono text-sm px-2 py-1 rounded inline-block border text-center ${
                row.timeInfo?.hasOvernightShift ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
                {row.time}
            </div>
            {row.timeInfo?.hasOvernightShift && (
                <div className="text-xs text-blue-600 font-medium">
                    {row.timeInfo?.nextDayExit ? `Ночная смена (выход ${row.timeInfo.nextDayExit} на след. день)` : 'Ночная смена'}
                </div>
            )}
            {row.timeInfo?.entryTime && row.timeInfo?.exitTime && !row.timeInfo?.hasOvernightShift && (
                <div className="text-xs text-slate-500">
                    Вход: {row.timeInfo.entryTime} | Выход: {row.timeInfo.exitTime}
                </div>
            )}
        </div>
    );
}

export default function VerificationTable({
    scrollRef,
    onScroll,
    windowedData,
    visibleData,
    visibleCount,
    setVisibleCount,
    editingDepartment,
    departmentInput,
    setDepartmentInput,
    handleDepartmentChange,
    startEditingDepartment,
    setEditingDepartment,
    originalDepartmentRef,
    departmentSuggestions
}) {
    const rowClass = (status) => {
        if (status === 'missing') return 'bg-red-50/30';
        if (status === 'unexpected') return 'bg-orange-50/30';
        return '';
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
            <div ref={scrollRef} onScroll={onScroll} className="overflow-auto h-full">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-6 py-3 border-b">Сотрудник</th>
                            <th className="px-6 py-3 border-b">План (Смена)</th>
                            <th className="px-6 py-3 border-b">Факт (Время)</th>
                            <th className="px-6 py-3 border-b">Отделение</th>
                            <th className="px-6 py-3 border-b text-center">Статус</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {windowedData.paddingTop > 0 && (
                            <tr>
                                <td colSpan={5} style={{ height: windowedData.paddingTop, padding: 0, border: 0 }} />
                            </tr>
                        )}
                        {visibleData.type === 'grouped' ? (
                            windowedData.items.map((item) => {
                                if (item.type === 'header') {
                                    return (
                                        <tr key={`header-${item.rowKey}`} className="bg-slate-100 sticky top-0 z-20">
                                            <td colSpan={5} className="px-6 py-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-700 text-sm">
                                                        {item.department === 'Нераспределенные' ? '⚠️ Нераспределенные' : `📁 ${item.department}`}
                                                    </span>
                                                    <span className="text-xs text-slate-500">({item.count} {item.count === 1 ? 'человек' : 'человек'})</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }
                                const { row, department, index, rowKey } = item;
                                return (
                                    <tr key={rowKey} className={`hover:bg-slate-50 transition-colors ${rowClass(row.status)}`}>
                                        <td className="px-6 py-3">
                                            <div className="font-bold text-slate-700">{row.name}</div>
                                            <div className="text-xs text-slate-500">{row.role}</div>
                                        </td>
                                        <td className="px-6 py-3 text-slate-600">
                                            {row.plan ? (
                                                <div>
                                                    <div className="font-semibold">{row.line}</div>
                                                    <div className="text-xs">Бригада {row.shift}</div>
                                                </div>
                                            ) : <span className="text-slate-400 italic">Не запланирован</span>}
                                        </td>
                                        <td className="px-6 py-3"><FactTimeCell row={row} /></td>
                                        <td className="px-6 py-3">
                                            <DepartmentCell
                                                row={row}
                                                editingDepartment={editingDepartment}
                                                departmentInput={departmentInput}
                                                setDepartmentInput={setDepartmentInput}
                                                handleDepartmentChange={handleDepartmentChange}
                                                startEditingDepartment={startEditingDepartment}
                                                setEditingDepartment={setEditingDepartment}
                                                originalDepartmentRef={originalDepartmentRef}
                                                departmentSuggestions={departmentSuggestions}
                                                datalistId={`dept-list-${rowKey}`}
                                            />
                                        </td>
                                        <td className="px-6 py-3 text-center"><StatusBadge status={row.status} /></td>
                                    </tr>
                                );
                            })
                        ) : (
                            windowedData.items.map((item) => {
                                const row = item.row;
                                return (
                                <tr key={item.rowKey} className={`hover:bg-slate-50 transition-colors ${rowClass(row.status)}`}>
                                    <td className="px-6 py-3">
                                        <div className="font-bold text-slate-700">{row.name}</div>
                                        <div className="text-xs text-slate-500">{row.role}</div>
                                    </td>
                                    <td className="px-6 py-3 text-slate-600">
                                        {row.plan ? (
                                            <div>
                                                <div className="font-semibold">{row.line}</div>
                                                <div className="text-xs">Бригада {row.shift}</div>
                                            </div>
                                        ) : <span className="text-slate-400 italic">Не запланирован</span>}
                                    </td>
                                    <td className="px-6 py-3"><FactTimeCellFlat row={row} /></td>
                                    <td className="px-6 py-3">
                                        <DepartmentCell
                                            row={row}
                                            editingDepartment={editingDepartment}
                                            departmentInput={departmentInput}
                                            setDepartmentInput={setDepartmentInput}
                                            handleDepartmentChange={handleDepartmentChange}
                                            startEditingDepartment={startEditingDepartment}
                                            setEditingDepartment={setEditingDepartment}
                                            originalDepartmentRef={originalDepartmentRef}
                                            departmentSuggestions={departmentSuggestions}
                                            datalistId={`dept-list-${item.rowKey}`}
                                        />
                                    </td>
                                    <td className="px-6 py-3 text-center"><StatusBadge status={row.status} /></td>
                                </tr>
                            ); })
                        )}
                        {windowedData.paddingBottom > 0 && (
                            <tr>
                                <td colSpan={5} style={{ height: windowedData.paddingBottom, padding: 0, border: 0 }} />
                            </tr>
                        )}
                        {visibleData.data.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-10 text-slate-400">Ничего не найдено</td>
                            </tr>
                        )}
                        {visibleData.total > visibleCount && (
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-center bg-slate-50">
                                    <button
                                        type="button"
                                        onClick={() => setVisibleCount(prev => prev + 50)}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                                    >
                                        <Plus size={16} />
                                        Загрузить еще (+50)
                                    </button>
                                    <div className="text-xs text-slate-500 mt-2">
                                        Показано {visibleCount} из {visibleData.total}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

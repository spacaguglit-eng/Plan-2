import React from 'react';
import { Search, Filter } from 'lucide-react';
import { STATUS_FILTER_TABS } from './verificationViewConstants';

export default function VerificationFilters({
    search,
    setSearch,
    departmentFilter,
    setDepartmentFilter,
    departments,
    statusFilter,
    setStatusFilter
}) {
    return (
        <div className="mb-4 flex gap-4 flex-wrap">
            <div className="relative flex-1 max-w-sm min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Поиск сотрудника..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
            </div>
            <div className="relative">
                <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                    value={departmentFilter}
                    onChange={e => setDepartmentFilter(e.target.value)}
                    className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[180px]"
                >
                    <option value="all">Все отделения</option>
                    {(departments || []).map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                    <option value="Нераспределенные">Нераспределенные</option>
                </select>
            </div>
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                {STATUS_FILTER_TABS.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id)}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${statusFilter === tab.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

import React from 'react';
import { Search, GraduationCap } from 'lucide-react';
import { hasAnyCompetencies } from './dashboardViewUtils';

export default function AssignContextMenu({
    contextMenu,
    contextMenuSearch,
    setContextMenuSearch,
    filteredContextMenuEmployees,
    findWorkerInRegistry,
    handleAssignFromContextMenu
}) {
    if (!contextMenu) return null;

    return (
        <div
            className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-50 min-w-[280px] max-w-[400px]"
            style={{
                left: `${contextMenu.x}px`,
                top: `${contextMenu.y}px`,
                transform: 'translate(-10px, -10px)'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-3 border-b border-slate-200 bg-slate-50">
                <div className="text-xs font-semibold text-slate-600 mb-2">Назначить на: {contextMenu.roleTitle}</div>
                <div className="relative">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Поиск сотрудника..."
                        value={contextMenuSearch}
                        onChange={(e) => setContextMenuSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        autoFocus
                    />
                </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
                {filteredContextMenuEmployees.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-400">
                        {contextMenuSearch ? 'Ничего не найдено' : 'Нет доступных сотрудников'}
                    </div>
                ) : (
                    filteredContextMenuEmployees.map((emp, idx) => {
                        const hasComps = hasAnyCompetencies(findWorkerInRegistry(emp.name)?.competencies);
                        return (
                            <button
                                key={`ctx-${idx}-${emp.id || emp.name}`}
                                onClick={() => handleAssignFromContextMenu(emp, contextMenu.slotId)}
                                className="w-full px-4 py-2 text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-b-0"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-slate-700 truncate flex items-center gap-1">
                                            {emp.name}
                                            {hasComps && <GraduationCap size={12} className="text-blue-400" />}
                                        </div>
                                        <div className="text-xs text-slate-500 truncate">
                                            {emp.role} {emp.homeLine && `(${emp.homeLine})`}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}

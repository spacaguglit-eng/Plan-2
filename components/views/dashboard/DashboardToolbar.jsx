import React from 'react';
import { ArrowRightLeft, ExternalLink } from 'lucide-react';

export default function DashboardToolbar({
    shiftsData,
    openArrangementInNewTab,
    setViewMode
}) {
    return (
        <div className="flex justify-end gap-2 mb-2">
            <button
                type="button"
                onClick={openArrangementInNewTab}
                disabled={!shiftsData || shiftsData.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Открыть текущую расстановку по выбранной дате в новой вкладке"
            >
                <ExternalLink size={16} /> Расстановка в новой вкладке
            </button>
            <button
                type="button"
                onClick={() => setViewMode?.('reports')}
                disabled={!shiftsData || shiftsData.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Перейти к сравнению основного и оперативного плана (текущая расстановка участвует, если этот план — основной или оперативный)"
            >
                <ArrowRightLeft size={16} /> Отправить в сравнение
            </button>
        </div>
    );
}

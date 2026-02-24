import React, { useMemo } from 'react';
import { Cloud, CloudOff } from 'lucide-react';
import { useData } from '../context/DataContext';

/**
 * Глобальный индикатор статуса синхронизации.
 * Показывает "сохранено/синхронизация/ошибка" по syncStatus.
 *
 * Важно: по просьбе — считаем облако всегда включённым (без проверок конфигурации).
 */
const SyncIndicator = ({ className = '' }) => {
    const { syncStatus, cloudStatus, currentPlanId } = useData();

    const state = useMemo(() => {
        const cloudEnabled = true;
        const isSynced = syncStatus === 'saved' || (currentPlanId && cloudStatus?.status === 'has_data');
        const isError = syncStatus === 'error';
        const isSyncing = syncStatus === 'syncing';

        if (!cloudEnabled) {
            return {
                title: 'Облачное хранилище отключено',
                kind: 'off'
            };
        }
        if (isError) {
            return { title: 'Ошибка синхронизации с облаком', kind: 'error' };
        }
        if (isSynced) {
            return { title: 'График сохранен в облаке ✓', kind: 'saved' };
        }
        if (isSyncing) {
            return { title: 'Синхронизация с облаком...', kind: 'syncing' };
        }
        return { title: 'Облачное хранилище активно', kind: 'idle' };
    }, [cloudStatus?.status, currentPlanId, syncStatus]);

    const containerClass = `inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border-2 shadow-lg hover:shadow-xl transition-all duration-300 ${
        state.kind === 'off'
            ? 'bg-gradient-to-r from-slate-50 via-slate-100 to-slate-50 border-slate-300/70'
            : state.kind === 'error'
                ? 'bg-gradient-to-r from-red-50 via-red-50 to-red-50 border-red-300/70'
                : state.kind === 'saved'
                    ? 'bg-gradient-to-r from-emerald-50 via-emerald-50 to-emerald-50 border-emerald-300/70'
                    : 'bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-blue-300/70'
    } ${className}`.trim();

    return (
        <div className={containerClass} title={state.title} aria-label={state.title}>
            {state.kind === 'off' ? (
                <div className="flex items-center gap-2">
                    <CloudOff size={20} className="text-slate-500" />
                    <div className="h-3 w-3 rounded-full bg-slate-400" />
                </div>
            ) : state.kind === 'error' ? (
                <div className="flex items-center gap-2">
                    <CloudOff size={20} className="text-red-600" />
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                </div>
            ) : state.kind === 'saved' ? (
                <div className="flex items-center gap-2">
                    <Cloud size={20} className="text-emerald-600 drop-shadow-sm" />
                    <div className="h-3 w-3 rounded-full bg-emerald-500 shadow shadow-emerald-500/30" />
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <Cloud
                        size={20}
                        className={`${state.kind === 'syncing' ? 'text-blue-600' : 'text-blue-500'} drop-shadow-sm`}
                    />
                    <div className="h-3 w-3 rounded-full bg-blue-500 shadow shadow-blue-500/30" />
                </div>
            )}
        </div>
    );
};

export default React.memo(SyncIndicator);



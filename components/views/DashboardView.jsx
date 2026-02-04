import React from 'react';
import { DayStatusHeader } from '../../UIComponents';
import { useDashboardData } from '../../hooks/useDashboardData';
import DashboardToolbar from './dashboard/DashboardToolbar';
import DashboardShiftBlock from './dashboard/DashboardShiftBlock';
import AssignContextMenu from './dashboard/AssignContextMenu';

function DashboardView() {
    const data = useDashboardData();
    const {
        shiftsData,
        dayStats,
        selectedDate,
        manualLineForm,
        setManualLineForm,
        contextMenu,
        setContextMenu,
        contextMenuSearch,
        setContextMenuSearch,
        getManualTemplateOptionsForShift,
        openManualLineForm,
        closeManualLineForm,
        handleManualLineTemplateChange,
        handleManualLineDisplayNameChange,
        handleManualLineSubmit,
        openArrangementInNewTab,
        handleAssignFromContextMenu,
        handleMarkOutsource,
        filteredContextMenuEmployees,
        findWorkerInRegistry,
        handleRemoveAssignment,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDrop,
        handleAutoFillFloaters,
        cloneAssignedWorker,
        removeCloneEntry,
        exportScheduleByLinesToExcel,
        isGlobalFill,
        setIsGlobalFill,
        autoReassignEnabled,
        setAutoReassignEnabled,
        backupAssignments,
        restoreAssignments,
        draggedWorker,
        removeManualLine,
        setViewMode
    } = data;

    if (!shiftsData || shiftsData.length === 0) {
        return <div className="text-center py-20 text-slate-400">Нет смен на выбранную дату</div>;
    }

    return (
        <div className="pb-20">
            <DayStatusHeader
                stats={dayStats}
                date={selectedDate}
                shiftsData={shiftsData}
                manualAssignments={data.manualAssignments}
                autoReassignEnabled={autoReassignEnabled}
                onToggleAutoReassign={setAutoReassignEnabled}
                onBackup={backupAssignments}
                onRestore={restoreAssignments}
                onExportLines={exportScheduleByLinesToExcel}
            />
            <DashboardToolbar
                shiftsData={shiftsData}
                openArrangementInNewTab={openArrangementInNewTab}
                setViewMode={setViewMode}
            />
            <div className="space-y-12">
                {shiftsData.map((shift) => (
                    <DashboardShiftBlock
                        key={shift.id}
                        shift={shift}
                        selectedDate={selectedDate}
                        manualLineForm={manualLineForm}
                        setManualLineForm={setManualLineForm}
                        getManualTemplateOptionsForShift={getManualTemplateOptionsForShift}
                        openManualLineForm={openManualLineForm}
                        closeManualLineForm={closeManualLineForm}
                        handleManualLineTemplateChange={handleManualLineTemplateChange}
                        handleManualLineDisplayNameChange={handleManualLineDisplayNameChange}
                        handleManualLineSubmit={handleManualLineSubmit}
                        isGlobalFill={isGlobalFill}
                        setIsGlobalFill={setIsGlobalFill}
                        handleAutoFillFloaters={handleAutoFillFloaters}
                        removeManualLine={removeManualLine}
                        findWorkerInRegistry={findWorkerInRegistry}
                        handleDragStart={handleDragStart}
                        handleDragEnd={handleDragEnd}
                        handleDragOver={handleDragOver}
                        handleDrop={handleDrop}
                        handleMarkOutsource={handleMarkOutsource}
                        cloneAssignedWorker={cloneAssignedWorker}
                        handleRemoveAssignment={handleRemoveAssignment}
                        draggedWorker={draggedWorker}
                        removeCloneEntry={removeCloneEntry}
                        setContextMenu={setContextMenu}
                        setContextMenuSearch={setContextMenuSearch}
                    />
                ))}
            </div>
            {contextMenu && (
                <AssignContextMenu
                    contextMenu={contextMenu}
                    contextMenuSearch={contextMenuSearch}
                    setContextMenuSearch={setContextMenuSearch}
                    filteredContextMenuEmployees={filteredContextMenuEmployees}
                    findWorkerInRegistry={findWorkerInRegistry}
                    handleAssignFromContextMenu={handleAssignFromContextMenu}
                />
            )}
        </div>
    );
}

export default React.memo(DashboardView);

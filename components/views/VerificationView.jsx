import React from 'react';
import { useRenderTime } from '../../PerformanceMonitor';
import { logPerformanceMetric } from '../../performanceStore';
import { useVerificationData } from '../../hooks/useVerificationData';
import VerificationUploadPrompt from './verification/VerificationUploadPrompt';
import VerificationHeader from './verification/VerificationHeader';
import VerificationFilters from './verification/VerificationFilters';
import VerificationTable from './verification/VerificationTable';

const VerificationView = () => {
    const data = useVerificationData();
    const {
        fileRef,
        factData,
        factDates,
        selectedDate,
        setSelectedDate,
        isLoading,
        handleFileUpload,
        handleResetFact,
        statusFilter,
        setStatusFilter,
        search,
        setSearch,
        departmentFilter,
        setDepartmentFilter,
        visibleCount,
        setVisibleCount,
        scrollRef,
        scrollTop,
        setScrollTop,
        verificationWorkerStatus,
        USE_VERIFICATION_WORKER,
        departments,
        departmentSuggestions,
        stats,
        visibleData,
        windowedData,
        editingDepartment,
        departmentInput,
        setDepartmentInput,
        setEditingDepartment,
        originalDepartmentRef,
        handleDepartmentChange,
        startEditingDepartment
    } = data;

    useRenderTime('verification', logPerformanceMetric, data?.viewMode === 'verification');

    if (!factData) {
        return (
            <VerificationUploadPrompt
                fileRef={fileRef}
                isLoading={isLoading}
                onFileUpload={handleFileUpload}
            />
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <VerificationHeader
                stats={stats}
                factDates={factDates}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                verificationWorkerStatus={verificationWorkerStatus}
                useVerificationWorker={USE_VERIFICATION_WORKER}
                onResetFact={handleResetFact}
            />

            <div className="flex-1 flex flex-col overflow-hidden p-6 max-w-[1400px] mx-auto w-full">
                <VerificationFilters
                    search={search}
                    setSearch={setSearch}
                    departmentFilter={departmentFilter}
                    setDepartmentFilter={setDepartmentFilter}
                    departments={departments}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                />

                <VerificationTable
                    scrollRef={scrollRef}
                    onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                    windowedData={windowedData}
                    visibleData={visibleData}
                    visibleCount={visibleCount}
                    setVisibleCount={setVisibleCount}
                    editingDepartment={editingDepartment}
                    departmentInput={departmentInput}
                    setDepartmentInput={setDepartmentInput}
                    handleDepartmentChange={handleDepartmentChange}
                    startEditingDepartment={startEditingDepartment}
                    setEditingDepartment={setEditingDepartment}
                    originalDepartmentRef={originalDepartmentRef}
                    departmentSuggestions={departmentSuggestions}
                />
            </div>
        </div>
    );
};

export default React.memo(VerificationView);

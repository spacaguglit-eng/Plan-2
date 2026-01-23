import { useSyncExternalStore } from 'react';

// In-memory metrics store to avoid triggering app-wide re-renders via Context.
// Shape: { [componentName: string]: Metric[] }
// Metric: { componentName, renderTime, renderCount, timestamp, isTabSwitch, isVisible }

let performanceMetrics = {};
const listeners = new Set();

function emitChange() {
    listeners.forEach((l) => {
        try {
            l();
        } catch (e) {
            // ignore listener errors so one bad subscriber doesn't break others
        }
    });
}

export function getPerformanceMetricsSnapshot() {
    return performanceMetrics;
}

export function subscribePerformanceMetrics(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function logPerformanceMetric(metric) {
    if (!metric || !metric.componentName) return;
    const componentName = metric.componentName;
    const existing = performanceMetrics[componentName] || [];
    const updated = [...existing, metric].slice(-50);
    performanceMetrics = { ...performanceMetrics, [componentName]: updated };
    emitChange();
}

export function clearPerformanceMetrics() {
    performanceMetrics = {};
    emitChange();
}

export function usePerformanceMetrics() {
    const snapshot = useSyncExternalStore(
        subscribePerformanceMetrics,
        getPerformanceMetricsSnapshot,
        getPerformanceMetricsSnapshot
    );

    return {
        performanceMetrics: snapshot,
        logPerformanceMetric,
        clearPerformanceMetrics
    };
}


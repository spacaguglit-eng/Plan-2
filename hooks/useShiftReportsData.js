import { useMemo, useCallback, useState } from 'react';
import { useData } from '../context/DataContext';
import { DOWNTIME_CATEGORIES } from '../components/views/shiftReports/shiftReportsViewConstants';
import {
    getShiftBoundariesForDates,
    getShiftForRow,
    buildFlatTimeline,
    applyAllFacts
} from '../components/views/shiftReports/shiftReportsViewUtils';

export function useShiftReportsData() {
    const { savedPlans, currentPlanId, scheduleDates, updateOperationalFacts, loadPlan } = useData();

    const [activeTab, setActiveTab] = useState('reports');
    const [downtimeCatalog, setDowntimeCatalog] = useState([]);
    const [downtimeFilterCategoriesSelected, setDowntimeFilterCategoriesSelected] = useState(
        () => new Set(DOWNTIME_CATEGORIES)
    );
    const [downtimeFilterDescription, setDowntimeFilterDescription] = useState('');

    const resetFactField = useCallback(
        (segmentKey, field) => {
            if (!segmentKey || typeof updateOperationalFacts !== 'function') return;
            updateOperationalFacts((prev) => {
                const next = prev && typeof prev === 'object' ? { ...prev } : {};
                const entry = next[segmentKey] ? { ...next[segmentKey] } : {};
                const clearField = (name) => {
                    if (name in entry) delete entry[name];
                };
                switch (field) {
                    case 'start':
                        clearField('factStartDate');
                        clearField('factStartTime');
                        break;
                    case 'end':
                        clearField('factEndDate');
                        clearField('factEndTime');
                        break;
                    case 'date':
                        clearField('factStartDate');
                        clearField('factEndDate');
                        break;
                    case 'qty':
                        clearField('factQty');
                        break;
                    default:
                        break;
                }
                if (Object.keys(entry).length === 0) {
                    delete next[segmentKey];
                } else {
                    next[segmentKey] = entry;
                }
                return next;
            });
        },
        [updateOperationalFacts]
    );

    const updateFact = useCallback(
        (segmentKey, patch) => {
            if (!segmentKey || typeof updateOperationalFacts !== 'function') return;
            updateOperationalFacts((prev) => {
                const next = prev && typeof prev === 'object' ? { ...prev } : {};
                const entry = next[segmentKey] ? { ...next[segmentKey] } : {};
                Object.entries(patch || {}).forEach(([k, v]) => {
                    if (v === undefined || v === null) {
                        if (k in entry) delete entry[k];
                    } else {
                        entry[k] = v;
                    }
                });
                if (Object.keys(entry).length === 0) {
                    delete next[segmentKey];
                } else {
                    next[segmentKey] = entry;
                }
                return next;
            });
        },
        [updateOperationalFacts]
    );

    const activePlan = useMemo(
        () => savedPlans?.find(p => p.id === currentPlanId),
        [savedPlans, currentPlanId]
    );

    const planningState = activePlan?.data?.planningState;
    const operationalFacts = activePlan?.data?.operationalFacts ?? null;

    const boundaries = useMemo(() => getShiftBoundariesForDates(scheduleDates || []), [scheduleDates]);

    const planFlat = useMemo(() => {
        if (!planningState) return [];
        const flat = buildFlatTimeline(planningState.products || [], planningState.cipBetween || []);
        flat.sort((a, b) => {
            const da = (a.date || '').localeCompare(b.date || '');
            if (da !== 0) return da;
            return (a.start || '').localeCompare(b.start || '');
        });
        return flat;
    }, [planningState]);

    const planByBaseEventIndex = useMemo(() => {
        const map = {};
        planFlat.forEach((e) => {
            if (e.baseEventIndex != null) map[e.baseEventIndex] = e;
        });
        return map;
    }, [planFlat]);

    const factTimeline = useMemo(() => {
        if (!planFlat.length) return [];
        return applyAllFacts(planFlat, operationalFacts, boundaries, scheduleDates);
    }, [planFlat, operationalFacts, boundaries, scheduleDates]);

    const factRows = useMemo(() => {
        const withShift = factTimeline.map((e, idx) => {
            const shift = getShiftForRow(e.date, e.start);
            return {
                ...e,
                id: e.segmentId || e.id || (e.kind === 'product' ? `p_${e.baseProductIndex}_${idx}` : `c_${idx}`),
                isService: e.kind === 'cip',
                displayName: e.kind === 'product' ? (e.name || '—') : (e.eventKey || e.type || 'Служебное событие'),
                displayQty: e.kind === 'product' ? (e.qty ?? '—') : '—',
                planEvent: planByBaseEventIndex[e.baseEventIndex],
                shiftKey: shift.key,
                shiftLabel: shift.label
            };
        });
        withShift.sort((a, b) => {
            const da = (a.date || '').localeCompare(b.date || '');
            if (da !== 0) return da;
            return (a.start || '').localeCompare(b.start || '');
        });
        withShift.forEach((row, idx) => {
            if (row.kind !== 'product') return;
            const segmentIndex = Number.isFinite(row.segmentIndex)
                ? row.segmentIndex
                : withShift
                    .slice(0, idx)
                    .filter((r) => r.kind === 'product' && r.baseProductIndex === row.baseProductIndex).length;
            row.segmentIndex = segmentIndex;
            row.segmentKey = row.segmentId || `${row.baseProductIndex}_${segmentIndex}`;
        });
        return withShift;
    }, [factTimeline, planByBaseEventIndex]);

    const downtimeFiltered = useMemo(() => {
        const desc = (downtimeFilterDescription || '').trim().toLowerCase();
        const selected = downtimeFilterCategoriesSelected;
        return downtimeCatalog.filter((item) => {
            const matchCat = selected.size === 0 || selected.size === DOWNTIME_CATEGORIES.length || selected.has(item.category || '');
            const matchDesc = !desc || (item.description || '').toLowerCase().includes(desc);
            return matchCat && matchDesc;
        });
    }, [downtimeCatalog, downtimeFilterCategoriesSelected, downtimeFilterDescription]);

    const toggleDowntimeCategory = useCallback((category) => {
        setDowntimeFilterCategoriesSelected((prev) => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    }, []);

    const handleReloadInitialPlan = useCallback(() => {
        if (typeof updateOperationalFacts !== 'function') return;
        updateOperationalFacts(() => null);
        if (currentPlanId && typeof loadPlan === 'function') {
            setTimeout(() => loadPlan(currentPlanId, { switchToDashboard: false }), 0);
        }
    }, [updateOperationalFacts, currentPlanId, loadPlan]);

    const hasFacts = operationalFacts && Object.keys(operationalFacts).length > 0;

    return {
        activeTab,
        setActiveTab,
        downtimeCatalog,
        downtimeFilterCategoriesSelected,
        downtimeFilterDescription,
        setDowntimeFilterDescription,
        setDowntimeFilterCategoriesSelected,
        resetFactField,
        updateFact,
        activePlan,
        planningState,
        operationalFacts,
        scheduleDates,
        boundaries,
        planFlat,
        planByBaseEventIndex,
        factTimeline,
        factRows,
        downtimeFiltered,
        toggleDowntimeCategory,
        handleReloadInitialPlan,
        hasFacts
    };
}

import React, { createContext, useContext, useMemo } from 'react';
import { SyncProvider } from './SyncContext';
import { usePlanState } from './hooks/usePlanState';
import { usePlanActions } from './hooks/usePlanActions';
import { useShiftCalculations } from './hooks/useShiftCalculations';
import { useChessTableLogic } from './hooks/useChessTableLogic';

const DataContext = createContext(null);

function DataProviderInner({ children }) {
    // 1. Core State & Sync
    const state = usePlanState();

    // 2. Actions (manipulate state)
    const actions = usePlanActions(state);

    // 3. Derived Calculations (shifts, stats)
    const shiftCalculations = useShiftCalculations({ ...state, updateAssignments: actions.updateAssignments });

    // 4. Chess Table Logic (depends on state & shift calcs)
    const chessLogic = useChessTableLogic(state, shiftCalculations);

    // Combine everything into one context value
    const value = useMemo(() => ({
        ...state,
        ...actions,
        ...shiftCalculations,
        ...chessLogic
    }), [state, actions, shiftCalculations, chessLogic]);

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const DataProvider = ({ children }) => (
    <SyncProvider>
        <DataProviderInner>{children}</DataProviderInner>
    </SyncProvider>
);

export const useData = () => {
    const context = useContext(DataContext);
    if (context == null || typeof context !== 'object') {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};

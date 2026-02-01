import React, { createContext, useContext } from 'react';

const PlanningContext = createContext(null);

export const PlanningProvider = ({ value, children }) => (
    <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>
);

export const usePlanning = () => {
    const ctx = useContext(PlanningContext);
    return ctx ?? {};
};

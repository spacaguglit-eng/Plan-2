import React, { createContext, useContext, useMemo } from 'react';

const WorkersContext = createContext(null);

export const WorkersProvider = ({ value, children }) => (
    <WorkersContext.Provider value={value}>{children}</WorkersContext.Provider>
);

export const useWorkers = () => {
    const ctx = useContext(WorkersContext);
    return ctx ?? {};
};

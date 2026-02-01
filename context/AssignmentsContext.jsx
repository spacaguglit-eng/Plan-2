import React, { createContext, useContext } from 'react';

const AssignmentsContext = createContext(null);

export const AssignmentsProvider = ({ value, children }) => (
    <AssignmentsContext.Provider value={value}>{children}</AssignmentsContext.Provider>
);

export const useAssignments = () => {
    const ctx = useContext(AssignmentsContext);
    return ctx ?? {};
};

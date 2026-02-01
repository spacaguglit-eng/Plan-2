import React, { createContext, useContext } from 'react';

const PlansContext = createContext(null);

export const PlansProvider = ({ value, children }) => (
    <PlansContext.Provider value={value}>{children}</PlansContext.Provider>
);

export const usePlans = () => {
    const ctx = useContext(PlansContext);
    return ctx ?? {};
};

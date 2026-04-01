"use client";

import { createContext, useContext } from "react";

const DashboardUserContext = createContext(null);

export function DashboardUserProvider({ user, children }) {
    return (
        <DashboardUserContext.Provider value={user}>
            {children}
        </DashboardUserContext.Provider>
    );
}

export function useDashboardUser() {
    const context = useContext(DashboardUserContext);

    if (!context) {
        throw new Error("useDashboardUser debe usarse dentro de DashboardUserProvider.");
    }

    return context;
}
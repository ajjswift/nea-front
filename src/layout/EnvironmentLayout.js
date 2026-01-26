"use client";
import "../app/globals.css";

import { createContext, useContext, useState } from "react";

// Define the context and give it a default value
export const EnvironmentContext = createContext({
    environment: {},
    setEnvironment: () => {}, // default no-op function
});

// Create a provider component to wrap your app or layout
export default function EnvironmentLayout({ children }) {
    const [environment, setEnvironment] = useState({});

    return (
        <EnvironmentContext.Provider value={{ environment, setEnvironment }}>
            {children}
        </EnvironmentContext.Provider>
    );
}

export function useEnvironment() {
    return useContext(EnvironmentContext);
}

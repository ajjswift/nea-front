"use client";
import "../../globals.css";

import EnvironmentLayout from "@/layout/EnvironmentLayout";
import { EnvironmentManager } from "./EnvironmentManager";

export default function EnvironmentPageLayout({ children }) {
    return (
        <EnvironmentLayout>
            {children}
            <EnvironmentManager />
        </EnvironmentLayout>
    );
}

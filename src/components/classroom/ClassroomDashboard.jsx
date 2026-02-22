"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import TeacherClassroomDashboard from "@/components/classroom/TeacherClassroomDashboard";
import StudentClassroomDashboard from "@/components/classroom/StudentClassroomDashboard";
import {
    ClassroomApiClient,
    ClassroomApiError,
} from "@/lib/classroom/ClassroomApiClient";

const classroomApiClient = new ClassroomApiClient();

export default function ClassroomDashboard() {
    const [dashboardPayload, setDashboardPayload] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authRequired, setAuthRequired] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadDashboard = async () => {
            setIsLoading(true);
            setErrorMessage("");

            try {
                const payload = await classroomApiClient.getDashboard();
                if (cancelled) {
                    return;
                }

                setDashboardPayload(payload);
                setAuthRequired(false);
            } catch (error) {
                if (cancelled) {
                    return;
                }

                if (error instanceof ClassroomApiError && error.status === 401) {
                    setAuthRequired(true);
                    return;
                }

                setErrorMessage(error.message || "Failed to load classroom dashboard.");
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        loadDashboard();
        return () => {
            cancelled = true;
        };
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-zinc-100">
                <main className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-10 text-sm text-zinc-400 md:px-6">
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading classroom...
                </main>
            </div>
        );
    }

    if (authRequired) {
        return (
            <div className="min-h-screen bg-zinc-950 text-zinc-100">
                <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
                    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
                        <h1 className="text-base font-medium text-zinc-100">
                            Authentication required
                        </h1>
                        <p className="mt-1 text-sm text-zinc-400">
                            Please log in to view classroom data.
                        </p>
                        <div className="mt-4 flex gap-2">
                            <Button asChild size="sm">
                                <Link href="/auth/login">Go to login</Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/auth/signup">Create account</Link>
                            </Button>
                        </div>
                    </section>
                </main>
            </div>
        );
    }

    if (errorMessage) {
        return (
            <div className="min-h-screen bg-zinc-950 text-zinc-100">
                <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
                    <p className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        {errorMessage}
                    </p>
                </main>
            </div>
        );
    }

    const role = dashboardPayload?.user?.role || dashboardPayload?.role || "student";
    if (role === "teacher") {
        return <TeacherClassroomDashboard />;
    }

    return <StudentClassroomDashboard initialDashboard={dashboardPayload} />;
}

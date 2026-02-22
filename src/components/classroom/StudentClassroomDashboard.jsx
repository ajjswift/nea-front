"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    ClassroomApiClient,
    ClassroomApiError,
} from "@/lib/classroom/ClassroomApiClient";

const classroomApiClient = new ClassroomApiClient();

function formatDueLabel(value) {
    if (!value) {
        return "No due date";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "No due date";
    }

    return date.toLocaleString();
}

export default function StudentClassroomDashboard({ initialDashboard = null }) {
    const searchParams = useSearchParams();
    const [dashboard, setDashboard] = useState(
        initialDashboard || { user: null, classes: [] },
    );
    const [selectedClassId, setSelectedClassId] = useState(() => {
        const queryClassId = searchParams.get("classId");
        return queryClassId || null;
    });
    const [isLoading, setIsLoading] = useState(!initialDashboard);
    const [errorMessage, setErrorMessage] = useState("");

    const selectedClass = useMemo(() => {
        return (
            dashboard.classes.find((classEntry) => classEntry.id === selectedClassId) ||
            null
        );
    }, [dashboard.classes, selectedClassId]);

    const loadDashboard = useCallback(async () => {
        setIsLoading(true);
        setErrorMessage("");

        try {
            const payload = await classroomApiClient.getDashboard();
            setDashboard({
                user: payload.user || null,
                classes: Array.isArray(payload.classes) ? payload.classes : [],
            });
        } catch (error) {
            if (error instanceof ClassroomApiError && error.status === 401) {
                setErrorMessage("Please log in to continue.");
            } else {
                setErrorMessage(error.message || "Failed to load classroom data.");
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!initialDashboard) {
            loadDashboard();
        }
    }, [initialDashboard, loadDashboard]);

    useEffect(() => {
        const queryClassId = searchParams.get("classId");
        if (
            queryClassId &&
            dashboard.classes.some((classEntry) => classEntry.id === queryClassId)
        ) {
            setSelectedClassId(queryClassId);
            return;
        }

        setSelectedClassId((current) => {
            if (current && dashboard.classes.some((classEntry) => classEntry.id === current)) {
                return current;
            }

            return dashboard.classes[0]?.id || null;
        });
    }, [dashboard.classes, searchParams]);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-10">
                <header className="mb-6 border-b border-zinc-800 pb-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="mb-3 h-8 border border-zinc-800 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
                            >
                                <Link href="/">
                                    <ArrowLeft className="size-3.5" />
                                    Back
                                </Link>
                            </Button>
                            <h1 className="text-2xl font-semibold tracking-tight">
                                Classroom
                            </h1>
                            <p className="mt-1 text-sm text-zinc-400">
                                View your classes and assignments.
                            </p>
                        </div>
                        {dashboard.user ? (
                            <p className="text-xs text-zinc-500">
                                Signed in as {dashboard.user.username} (student)
                            </p>
                        ) : null}
                    </div>
                </header>

                <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2">
                    {errorMessage ? (
                        <p className="pointer-events-auto rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-lg">
                            {errorMessage}
                        </p>
                    ) : null}
                </div>

                {isLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm text-zinc-400">
                        <LoaderCircle className="size-4 animate-spin" />
                        Loading classroom...
                    </div>
                ) : dashboard.classes.length === 0 ? (
                    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
                        <h2 className="text-base font-medium text-zinc-100">
                            No classes yet
                        </h2>
                        <p className="mt-1 text-sm text-zinc-400">
                            Join a class from the home page with your teacher&apos;s
                            join code.
                        </p>
                        <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="mt-4 h-8 text-xs"
                        >
                            <Link href="/">Go to home</Link>
                        </Button>
                    </section>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                            <div className="border-b border-zinc-800 px-4 py-3">
                                <h2 className="text-sm font-medium text-zinc-100">Classes</h2>
                            </div>
                            <div className="divide-y divide-zinc-800">
                                {dashboard.classes.map((classEntry) => (
                                    <button
                                        key={classEntry.id}
                                        type="button"
                                        onClick={() => setSelectedClassId(classEntry.id)}
                                        className={`w-full px-4 py-3 text-left transition-colors ${
                                            selectedClassId === classEntry.id
                                                ? "bg-zinc-800/60"
                                                : "hover:bg-zinc-800/30"
                                        }`}
                                    >
                                        <p className="truncate text-sm font-medium text-zinc-100">
                                            {classEntry.name}
                                        </p>
                                        <p className="mt-1 text-xs text-zinc-500">
                                            {classEntry.assignments?.length || 0} assignments
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </aside>

                        {!selectedClass ? (
                            <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
                                Select a class to view assignments.
                            </section>
                        ) : (
                            <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                                <div className="border-b border-zinc-800 px-4 py-3">
                                    <h2 className="text-sm font-medium text-zinc-100">
                                        {selectedClass.name}
                                    </h2>
                                    <p className="mt-1 text-xs text-zinc-500">
                                        {selectedClass.description || "No class description."}
                                    </p>
                                </div>

                                <div className="divide-y divide-zinc-800">
                                    {(selectedClass.assignments || []).length === 0 ? (
                                        <p className="px-4 py-4 text-sm text-zinc-400">
                                            No assignments yet.
                                        </p>
                                    ) : (
                                        selectedClass.assignments.map((assignment) => {
                                            const linkedEnvironmentId =
                                                assignment.environments?.[0]?.environmentId ||
                                                null;
                                            const environmentHref = linkedEnvironmentId
                                                ? `/environment/${linkedEnvironmentId}?returnTo=${encodeURIComponent(
                                                      `/classroom?classId=${selectedClass.id}`,
                                                  )}`
                                                : null;

                                            return (
                                                <div
                                                    key={assignment.id}
                                                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-4"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-zinc-100">
                                                            {assignment.title}
                                                        </p>
                                                        <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
                                                            {assignment.description ||
                                                                "No description."}
                                                        </p>
                                                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                                                            <Clock3 className="size-3" />
                                                            {formatDueLabel(assignment.dueAt)}
                                                        </p>
                                                    </div>
                                                    {environmentHref ? (
                                                        <Button
                                                            asChild
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 text-xs"
                                                        >
                                                            <Link href={environmentHref}>
                                                                Open environment
                                                                <ArrowRight className="size-3.5" />
                                                            </Link>
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-zinc-500">
                                                            Environment pending
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

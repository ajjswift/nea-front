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

function getDueUrgency(value) {
    if (!value) {
        return null;
    }

    const dueDate = new Date(value);
    if (Number.isNaN(dueDate.getTime())) {
        return null;
    }

    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTomorrow = new Date(startToday);
    startTomorrow.setDate(startTomorrow.getDate() + 1);
    const startDayAfterTomorrow = new Date(startTomorrow);
    startDayAfterTomorrow.setDate(startDayAfterTomorrow.getDate() + 1);
    const startInFourDays = new Date(startToday);
    startInFourDays.setDate(startInFourDays.getDate() + 4);

    if (dueDate.getTime() < now.getTime()) {
        return { label: "Overdue", tone: "overdue" };
    }
    if (dueDate.getTime() < startTomorrow.getTime()) {
        return { label: "Due today", tone: "today" };
    }
    if (dueDate.getTime() < startDayAfterTomorrow.getTime()) {
        return { label: "Due tomorrow", tone: "tomorrow" };
    }
    if (dueDate.getTime() < startInFourDays.getTime()) {
        return { label: "Due soon", tone: "soon" };
    }

    return { label: "Upcoming", tone: "upcoming" };
}

function getDueBadgeClass(tone) {
    if (tone === "overdue") {
        return "border-red-400/50 bg-red-500/15 text-red-300";
    }
    if (tone === "today") {
        return "border-amber-400/50 bg-amber-500/15 text-amber-300";
    }
    if (tone === "tomorrow") {
        return "border-yellow-400/50 bg-yellow-500/15 text-yellow-300";
    }
    if (tone === "soon") {
        return "border-sky-400/50 bg-sky-500/15 text-sky-300";
    }
    return "border-zinc-700 bg-zinc-800/60 text-zinc-400";
}

function getSubmissionBadge(status) {
    if (status === "submitted") {
        return {
            label: "Submitted",
            className: "border-emerald-400/50 bg-emerald-500/15 text-emerald-300",
        };
    }
    if (status === "needs_changes") {
        return {
            label: "Needs changes",
            className: "border-amber-400/50 bg-amber-500/15 text-amber-300",
        };
    }
    if (status === "in_progress") {
        return {
            label: "In progress",
            className: "border-sky-400/50 bg-sky-500/15 text-sky-300",
        };
    }

    return {
        label: "Not started",
        className: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
    };
}

function getAssignmentAccentClass(dueUrgencyTone, submissionStatus) {
    if (dueUrgencyTone === "overdue") return "border-l-red-500";
    if (dueUrgencyTone === "today") return "border-l-amber-500";
    if (dueUrgencyTone === "tomorrow") return "border-l-yellow-500/70";
    if (submissionStatus === "submitted") return "border-l-emerald-500";
    if (submissionStatus === "needs_changes") return "border-l-amber-500";
    if (submissionStatus === "in_progress") return "border-l-sky-500/70";
    return "border-l-zinc-700/50";
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
            <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-12">
                <header className="mb-8">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="mb-3 h-7 px-2 text-xs text-zinc-500 hover:text-zinc-300"
                            >
                                <Link href="/">
                                    <ArrowLeft className="size-3.5" />
                                    Home
                                </Link>
                            </Button>
                            <h1 className="text-2xl font-bold tracking-tight text-zinc-50">
                                Classroom
                            </h1>
                            <p className="mt-0.5 text-sm text-zinc-500">
                                Your classes and assignments.
                            </p>
                        </div>
                        {dashboard.user ? (
                            <div className="text-right">
                                <p className="text-sm font-medium text-zinc-200">{dashboard.user.username}</p>
                                <p className="text-xs text-zinc-500">student</p>
                            </div>
                        ) : null}
                    </div>
                </header>

                <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2">
                    {errorMessage ? (
                        <p className="pointer-events-auto rounded-lg border border-red-400/30 bg-zinc-900 px-3 py-2 text-sm text-red-300 shadow-lg shadow-black/40">
                            {errorMessage}
                        </p>
                    ) : null}
                </div>

                {isLoading ? (
                    <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-sm text-zinc-500">
                        <LoaderCircle className="size-4 animate-spin" />
                        Loading classroom…
                    </div>
                ) : dashboard.classes.length === 0 ? (
                    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                        <h2 className="text-base font-semibold text-zinc-100">
                            No classes yet
                        </h2>
                        <p className="mt-1 text-sm text-zinc-500">
                            Join a class from the home page using your teacher&apos;s join code.
                        </p>
                        <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="mt-4 h-8 text-xs"
                        >
                            <Link href="/">Go home</Link>
                        </Button>
                    </section>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                        <aside className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm shadow-black/20">
                            <div className="border-b border-zinc-800 px-4 py-3">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Classes</h2>
                            </div>
                            <div className="py-1">
                                {dashboard.classes.map((classEntry) => (
                                    <button
                                        key={classEntry.id}
                                        type="button"
                                        onClick={() => setSelectedClassId(classEntry.id)}
                                        className={`w-full border-l-2 py-2.5 pl-3 pr-4 text-left transition-colors ${
                                            selectedClassId === classEntry.id
                                                ? "border-l-emerald-500 bg-zinc-800/60 text-zinc-100"
                                                : "border-l-transparent text-zinc-400 hover:border-l-zinc-600 hover:bg-zinc-800/30 hover:text-zinc-200"
                                        }`}
                                    >
                                        <p className="truncate text-sm font-medium">
                                            {classEntry.name}
                                        </p>
                                        <p className="mt-0.5 text-xs text-zinc-500">
                                            {classEntry.assignments?.length || 0} assignment{classEntry.assignments?.length === 1 ? "" : "s"}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </aside>

                        {!selectedClass ? (
                            <section className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-sm text-zinc-500">
                                Select a class to view assignments.
                            </section>
                        ) : (
                            <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm shadow-black/20">
                                <div className="border-b border-zinc-800 px-4 py-3">
                                    <h2 className="text-sm font-semibold text-zinc-100">
                                        {selectedClass.name}
                                    </h2>
                                    {selectedClass.description ? (
                                        <p className="mt-0.5 text-xs text-zinc-500">
                                            {selectedClass.description}
                                        </p>
                                    ) : null}
                                </div>

                                <div className="divide-y divide-zinc-800/60">
                                    {(selectedClass.assignments || []).length === 0 ? (
                                        <p className="px-4 py-5 text-sm text-zinc-500">
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
                                            const dueUrgency = getDueUrgency(
                                                assignment.dueAt,
                                            );
                                            const submissionStatus =
                                                assignment.environments?.[0]?.submissionStatus;
                                            const submissionBadge =
                                                getSubmissionBadge(submissionStatus);
                                            const latestTestSummary =
                                                assignment.environments?.[0]
                                                    ?.latestTestSummary || null;
                                            const commentsCount =
                                                assignment.environments?.[0]
                                                    ?.commentsCount || 0;
                                            const testProgressLabel =
                                                latestTestSummary &&
                                                Number(latestTestSummary.total) > 0
                                                    ? `${latestTestSummary.passed || 0}/${latestTestSummary.total || 0} tests`
                                                    : null;

                                            return (
                                                <div
                                                    key={assignment.id}
                                                    className={`border-l-2 pl-3 pr-4 py-4 ${getAssignmentAccentClass(dueUrgency?.tone, submissionStatus)}`}
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-zinc-100">
                                                                {assignment.title}
                                                            </p>
                                                            {assignment.description ? (
                                                                <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">
                                                                    {assignment.description}
                                                                </p>
                                                            ) : null}
                                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                                <span
                                                                    className={`rounded border px-1.5 py-0.5 text-xs ${submissionBadge.className}`}
                                                                >
                                                                    {submissionBadge.label}
                                                                </span>
                                                                {dueUrgency ? (
                                                                    <span
                                                                        className={`rounded border px-1.5 py-0.5 text-xs ${getDueBadgeClass(
                                                                            dueUrgency.tone,
                                                                        )}`}
                                                                    >
                                                                        {dueUrgency.label}
                                                                    </span>
                                                                ) : null}
                                                                {testProgressLabel ? (
                                                                    <span className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-xs text-zinc-400">
                                                                        {testProgressLabel}
                                                                    </span>
                                                                ) : null}
                                                                {commentsCount > 0 ? (
                                                                    <span className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-300">
                                                                        {commentsCount} comment{commentsCount === 1 ? "" : "s"}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <p className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-600">
                                                                <Clock3 className="size-3" />
                                                                {formatDueLabel(assignment.dueAt)}
                                                            </p>
                                                        </div>
                                                        {environmentHref ? (
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                className="h-7 bg-zinc-100 text-xs text-zinc-900 hover:bg-white shrink-0"
                                                            >
                                                                <Link href={environmentHref}>
                                                                    Open
                                                                    <ArrowRight className="size-3.5" />
                                                                </Link>
                                                            </Button>
                                                        ) : (
                                                            <span className="shrink-0 text-xs text-zinc-600">
                                                                Pending
                                                            </span>
                                                        )}
                                                    </div>
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

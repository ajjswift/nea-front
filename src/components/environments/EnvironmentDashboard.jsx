"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    Clock3,
    LoaderCircle,
    Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ApiError,
    EnvironmentApiClient,
} from "@/lib/environments/EnvironmentApiClient";
import {
    ClassroomApiClient,
    ClassroomApiError,
} from "@/lib/classroom/ClassroomApiClient";
import { EnvironmentViewModel } from "@/lib/environments/EnvironmentViewModel";
import { StudentAssignmentViewModel } from "@/lib/classroom/StudentAssignmentViewModel";

const environmentApiClient = new EnvironmentApiClient();
const classroomApiClient = new ClassroomApiClient();

const emptyFormState = {
    name: "",
    description: "",
};

function getDueBadgeClass(tone) {
    if (tone === "overdue") {
        return "border-red-400/50 bg-red-500/15 text-red-200";
    }
    if (tone === "today") {
        return "border-amber-400/50 bg-amber-500/15 text-amber-200";
    }
    if (tone === "tomorrow") {
        return "border-yellow-400/50 bg-yellow-500/15 text-yellow-200";
    }
    if (tone === "soon") {
        return "border-sky-400/50 bg-sky-500/15 text-sky-200";
    }
    return "border-zinc-600 bg-zinc-800 text-zinc-300";
}

function getSubmissionBadge(status) {
    if (status === "submitted") {
        return {
            label: "Submitted",
            className: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200",
        };
    }
    if (status === "needs_changes") {
        return {
            label: "Needs changes",
            className: "border-amber-400/50 bg-amber-500/15 text-amber-200",
        };
    }
    if (status === "in_progress") {
        return {
            label: "In progress",
            className: "border-sky-400/50 bg-sky-500/15 text-sky-200",
        };
    }

    return {
        label: "Not started",
        className: "border-zinc-600 bg-zinc-800 text-zinc-300",
    };
}

export default function EnvironmentDashboard() {
    const router = useRouter();
    const [formState, setFormState] = useState(emptyFormState);
    const [environments, setEnvironments] = useState([]);
    const [studentClasses, setStudentClasses] = useState([]);
    const [user, setUser] = useState(null);
    const [authRequired, setAuthRequired] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isJoiningClass, setIsJoiningClass] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [infoMessage, setInfoMessage] = useState("");
    const [joinCodeInput, setJoinCodeInput] = useState("");
    const [isStudentJoinModalOpen, setIsStudentJoinModalOpen] = useState(false);
    const [isStudentCreateModalOpen, setIsStudentCreateModalOpen] = useState(false);
    const [studentCreateForm, setStudentCreateForm] = useState(emptyFormState);

    const stats = useMemo(() => {
        return {
            total: environments.length,
            active: environments.filter((environment) => environment.status === "active")
                .length,
        };
    }, [environments]);

    const studentAssignments = useMemo(() => {
        if (user?.role !== "student") {
            return [];
        }

        return StudentAssignmentViewModel.fromDashboardClasses(studentClasses);
    }, [studentClasses, user?.role]);

    const assignmentEnvironmentIds = useMemo(() => {
        return new Set(
            studentAssignments
                .map((assignment) => assignment.environmentId)
                .filter(Boolean),
        );
    }, [studentAssignments]);

    const personalEnvironments = useMemo(() => {
        if (user?.role !== "student") {
            return environments;
        }

        return environments.filter(
            (environment) => !assignmentEnvironmentIds.has(environment.id),
        );
    }, [assignmentEnvironmentIds, environments, user?.role]);

    const personalStats = useMemo(() => {
        return {
            total: personalEnvironments.length,
            active: personalEnvironments.filter(
                (environment) => environment.status === "active",
            ).length,
        };
    }, [personalEnvironments]);

    const loadEnvironments = useCallback(async () => {
        setIsLoading(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const payload = await environmentApiClient.listEnvironments();
            const mappedEnvironments = (payload.environments || []).map((environment) =>
                EnvironmentViewModel.fromApi(environment),
            );

            setEnvironments(mappedEnvironments);
            setUser(payload.user || null);
            setStudentClasses([]);
            setAuthRequired(false);

            if ((payload.user?.role || "student") === "student") {
                try {
                    const classroomPayload = await classroomApiClient.getDashboard();
                    const classes = Array.isArray(classroomPayload?.classes)
                        ? classroomPayload.classes
                        : [];
                    setStudentClasses(classes);
                } catch (error) {
                    if (
                        !(error instanceof ClassroomApiError && error.status === 401)
                    ) {
                        console.error(
                            "Failed to load student classroom assignments:",
                            error,
                        );
                    }
                }
            }
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                setAuthRequired(true);
                setUser(null);
                setEnvironments([]);
                setStudentClasses([]);
                return;
            }

            setErrorMessage(error.message || "Failed to load environments.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadEnvironments();
    }, [loadEnvironments]);

    useEffect(() => {
        if (!isStudentJoinModalOpen && !isJoiningClass) {
            setJoinCodeInput("");
        }
    }, [isJoiningClass, isStudentJoinModalOpen]);

    useEffect(() => {
        if (!isStudentCreateModalOpen && !isSubmitting) {
            setStudentCreateForm(emptyFormState);
        }
    }, [isStudentCreateModalOpen, isSubmitting]);

    const handleCreateEnvironment = async (event) => {
        event.preventDefault();
        const normalizedName = formState.name.trim();

        if (!normalizedName) {
            setErrorMessage("Environment name is required.");
            return;
        }

        setIsSubmitting(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const payload = await environmentApiClient.createEnvironment({
                name: normalizedName,
                description: formState.description,
                runtime: "python-3.11",
            });

            const createdEnvironment = EnvironmentViewModel.fromApi(
                payload.environment,
            );
            setEnvironments((previous) => [createdEnvironment, ...previous]);
            setFormState(emptyFormState);
            setInfoMessage("Environment created.");
        } catch (error) {
            setErrorMessage(error.message || "Could not create environment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleJoinClass = async (event) => {
        event.preventDefault();
        const normalizedCode = joinCodeInput.trim().toUpperCase();
        if (!normalizedCode) {
            setErrorMessage("Enter a join code.");
            return;
        }

        setIsJoiningClass(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const payload = await classroomApiClient.joinClassByCode(normalizedCode);
            setJoinCodeInput("");
            await loadEnvironments();
            setIsStudentJoinModalOpen(false);
            setInfoMessage(`Joined class: ${payload?.class?.name || "Success"}.`);
        } catch (error) {
            if (error instanceof ClassroomApiError) {
                setErrorMessage(error.message || "Could not join class.");
            } else {
                setErrorMessage("Could not join class.");
            }
        } finally {
            setIsJoiningClass(false);
        }
    };

    const handleCreateEnvironmentFromStudentModal = async (event) => {
        event.preventDefault();
        const normalizedName = studentCreateForm.name.trim();

        if (!normalizedName) {
            setErrorMessage("Environment name is required.");
            return;
        }

        setIsSubmitting(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const payload = await environmentApiClient.createEnvironment({
                name: normalizedName,
                description: studentCreateForm.description,
                runtime: "python-3.11",
            });

            const createdEnvironment = EnvironmentViewModel.fromApi(
                payload.environment,
            );
            setEnvironments((previous) => [createdEnvironment, ...previous]);
            setStudentCreateForm(emptyFormState);
            setIsStudentCreateModalOpen(false);
            setInfoMessage("Environment created.");
        } catch (error) {
            setErrorMessage(error.message || "Could not create environment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
                <header className="mb-6 border-b border-zinc-800 pb-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">
                                Environments
                            </h1>
                            <p className="mt-1 text-sm text-zinc-400">
                                Create and open your coding environments.
                            </p>
                        </div>
                        {user && (
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-zinc-500">
                                    Signed in as {user.username} ({user.role || "student"})
                                </p>
                                <Button
                                    asChild
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                >
                                    <Link href="/classroom">Classroom</Link>
                                </Button>
                            </div>
                        )}
                    </div>
                </header>

                {authRequired ? (
                    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                        <h2 className="text-base font-medium text-zinc-100">
                            Authentication required
                        </h2>
                        <p className="mt-1 text-sm text-zinc-400">
                            Log in to create environments and view your existing ones.
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
                ) : user?.role === "student" ? (
                    <div className="space-y-5">
                        <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-sm font-medium text-zinc-100">
                                        Assignments
                                    </h2>
                                    <p className="text-xs text-zinc-500">
                                        {studentAssignments.length} total
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs"
                                        onClick={() => setIsStudentJoinModalOpen(true)}
                                        disabled={isLoading || isJoiningClass}
                                    >
                                        Join class
                                    </Button>
                                </div>
                            </div>

                            <div className="divide-y divide-zinc-800">
                                {isLoading ? (
                                    <div className="flex items-center gap-2 px-4 py-4 text-sm text-zinc-400">
                                        <LoaderCircle className="size-4 animate-spin" />
                                        Loading assignments...
                                    </div>
                                ) : studentAssignments.length === 0 ? (
                                    <p className="px-4 py-4 text-sm text-zinc-400">
                                        No assignments yet.
                                    </p>
                                ) : (
                                    studentAssignments.map((assignment) => {
                                        const isOpenable = Boolean(
                                            assignment.environmentHref,
                                        );
                                        const submissionBadge =
                                            getSubmissionBadge(
                                                assignment.submissionStatus,
                                            );

                                        return (
                                            <div
                                                key={assignment.assignmentId}
                                                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-4 ${
                                                    isOpenable
                                                        ? "cursor-pointer transition-colors hover:bg-zinc-800/40"
                                                        : ""
                                                }`}
                                                onClick={() => {
                                                    if (isOpenable) {
                                                        router.push(
                                                            assignment.environmentHref,
                                                        );
                                                    }
                                                }}
                                                onKeyDown={(event) => {
                                                    if (
                                                        isOpenable &&
                                                        (event.key === "Enter" ||
                                                            event.key === " ")
                                                    ) {
                                                        event.preventDefault();
                                                        router.push(
                                                            assignment.environmentHref,
                                                        );
                                                    }
                                                }}
                                                role={isOpenable ? "button" : undefined}
                                                tabIndex={isOpenable ? 0 : undefined}
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-zinc-100">
                                                        {assignment.title}
                                                    </p>
                                                    <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
                                                        {assignment.description ||
                                                            "No description."}
                                                    </p>
                                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                                                        <span className="inline-flex items-center gap-1">
                                                            <Clock3 className="size-3" />
                                                            {assignment.dueAtLabel}
                                                        </span>
                                                        <span>{assignment.className}</span>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                                        {assignment.dueUrgency ? (
                                                            <span
                                                                className={`rounded border px-2 py-0.5 ${getDueBadgeClass(
                                                                    assignment.dueUrgency.tone,
                                                                )}`}
                                                            >
                                                                {
                                                                    assignment.dueUrgency
                                                                        .label
                                                                }
                                                            </span>
                                                        ) : null}
                                                        <span
                                                            className={`rounded border px-2 py-0.5 ${submissionBadge.className}`}
                                                        >
                                                            {submissionBadge.label}
                                                        </span>
                                                        {assignment.testProgressLabel ? (
                                                            <span className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-zinc-300">
                                                                {
                                                                    assignment.testProgressLabel
                                                                }
                                                            </span>
                                                        ) : null}
                                                        {assignment.commentsCount > 0 ? (
                                                            <span className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                                                                {assignment.commentsCount} teacher
                                                                comment
                                                                {assignment.commentsCount === 1
                                                                    ? ""
                                                                    : "s"}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 text-xs"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            router.push(
                                                                assignment.classHref,
                                                            );
                                                        }}
                                                    >
                                                        Go to class
                                                    </Button>
                                                    {isOpenable ? (
                                                        <ArrowRight className="size-4 text-zinc-500" />
                                                    ) : (
                                                        <span className="text-xs text-zinc-500">
                                                            Environment pending
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </section>

                        <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-sm font-medium text-zinc-100">
                                        Personal environments
                                    </h2>
                                    <p className="text-xs text-zinc-500">
                                        {personalStats.total} total · {personalStats.active} active
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 bg-zinc-100 text-xs text-zinc-900 hover:bg-zinc-200"
                                    onClick={() => setIsStudentCreateModalOpen(true)}
                                    disabled={isLoading || isSubmitting}
                                >
                                    <Plus className="size-3.5" />
                                    Create new
                                </Button>
                            </div>

                            <div className="divide-y divide-zinc-800">
                                {isLoading ? (
                                    <div className="flex items-center gap-2 px-4 py-4 text-sm text-zinc-400">
                                        <LoaderCircle className="size-4 animate-spin" />
                                        Loading environments...
                                    </div>
                                ) : personalEnvironments.length === 0 ? (
                                    <p className="px-4 py-4 text-sm text-zinc-400">
                                        No personal environments yet.
                                    </p>
                                ) : (
                                    personalEnvironments.map((environment) => (
                                        <Link
                                            key={environment.id}
                                            href={environment.href}
                                            className="group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-zinc-800/40"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-zinc-100">
                                                    {environment.name}
                                                </p>
                                                <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
                                                    {environment.description}
                                                </p>
                                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock3 className="size-3" />
                                                        {environment.updatedAtLabel}
                                                    </span>
                                                    <span>#{environment.shortId}</span>
                                                    <span>{environment.runtimeLabel}</span>
                                                </div>
                                            </div>
                                            <ArrowRight className="mt-0.5 size-4 shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5" />
                                        </Link>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                        <div className="space-y-4">
                            <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                                <h2 className="text-sm font-medium text-zinc-100">
                                    New environment
                                </h2>
                                <p className="mt-1 text-xs text-zinc-500">
                                    Name is required. Description is optional.
                                </p>
                                <form
                                    className="mt-4 flex flex-col gap-3"
                                    onSubmit={handleCreateEnvironment}
                                >
                                    <Input
                                        placeholder="Environment name"
                                        value={formState.name}
                                        onChange={(event) =>
                                            setFormState((previous) => ({
                                                ...previous,
                                                name: event.target.value,
                                            }))
                                        }
                                        maxLength={80}
                                        required
                                    />
                                    <Textarea
                                        placeholder="Description (optional)"
                                        value={formState.description}
                                        onChange={(event) =>
                                            setFormState((previous) => ({
                                                ...previous,
                                                description: event.target.value,
                                            }))
                                        }
                                        maxLength={500}
                                    />
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting || isLoading}
                                        className="justify-center bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <LoaderCircle className="size-4 animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="size-4" />
                                                Create
                                            </>
                                        )}
                                    </Button>
                                </form>
                            </section>
                        </div>

                        <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                                <h2 className="text-sm font-medium text-zinc-100">
                                    Existing environments
                                </h2>
                                <p className="text-xs text-zinc-500">
                                    {stats.total} total · {stats.active} active
                                </p>
                            </div>

                            <div className="divide-y divide-zinc-800">
                                {isLoading ? (
                                    <div className="flex items-center gap-2 px-4 py-4 text-sm text-zinc-400">
                                        <LoaderCircle className="size-4 animate-spin" />
                                        Loading environments...
                                    </div>
                                ) : environments.length === 0 ? (
                                    <p className="px-4 py-4 text-sm text-zinc-400">
                                        No environments yet.
                                    </p>
                                ) : (
                                    environments.map((environment) => (
                                        <Link
                                            key={environment.id}
                                            href={environment.href}
                                            className="group flex items-start justify-between gap-4 px-4 py-4 transition-colors hover:bg-zinc-800/40"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-zinc-100">
                                                    {environment.name}
                                                </p>
                                                <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
                                                    {environment.description}
                                                </p>
                                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock3 className="size-3" />
                                                        {environment.updatedAtLabel}
                                                    </span>
                                                    <span>#{environment.shortId}</span>
                                                    <span>{environment.runtimeLabel}</span>
                                                </div>
                                            </div>
                                            <ArrowRight className="mt-0.5 size-4 shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5" />
                                        </Link>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {user?.role === "student" && (
                    <>
                        <Dialog
                            open={isStudentJoinModalOpen}
                            onOpenChange={setIsStudentJoinModalOpen}
                        >
                            <DialogContent className="max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Join class</DialogTitle>
                                    <DialogDescription>
                                        Enter your teacher&apos;s class join code.
                                    </DialogDescription>
                                </DialogHeader>
                                <form
                                    onSubmit={handleJoinClass}
                                    className="flex flex-col gap-3"
                                >
                                    <Input
                                        value={joinCodeInput}
                                        onChange={(event) =>
                                            setJoinCodeInput(
                                                event.target.value.toUpperCase(),
                                            )
                                        }
                                        placeholder="ABC12345"
                                        maxLength={12}
                                        className="uppercase"
                                    />
                                    <DialogFooter>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setIsStudentJoinModalOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={isJoiningClass}
                                            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                        >
                                            {isJoiningClass ? (
                                                <>
                                                    <LoaderCircle className="size-4 animate-spin" />
                                                    Joining
                                                </>
                                            ) : (
                                                "Join"
                                            )}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>

                        <Dialog
                            open={isStudentCreateModalOpen}
                            onOpenChange={setIsStudentCreateModalOpen}
                        >
                            <DialogContent className="max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Create new environment</DialogTitle>
                                    <DialogDescription>
                                        Add a personal environment outside assignment work.
                                    </DialogDescription>
                                </DialogHeader>
                                <form
                                    onSubmit={handleCreateEnvironmentFromStudentModal}
                                    className="flex flex-col gap-3"
                                >
                                    <Input
                                        placeholder="Environment name"
                                        value={studentCreateForm.name}
                                        onChange={(event) =>
                                            setStudentCreateForm((previous) => ({
                                                ...previous,
                                                name: event.target.value,
                                            }))
                                        }
                                        maxLength={80}
                                        required
                                    />
                                    <Textarea
                                        placeholder="Description (optional)"
                                        value={studentCreateForm.description}
                                        onChange={(event) =>
                                            setStudentCreateForm((previous) => ({
                                                ...previous,
                                                description: event.target.value,
                                            }))
                                        }
                                        maxLength={500}
                                    />
                                    <DialogFooter>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setIsStudentCreateModalOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <LoaderCircle className="size-4 animate-spin" />
                                                    Creating...
                                                </>
                                            ) : (
                                                "Create"
                                            )}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </>
                )}

                <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2">
                    {errorMessage && (
                        <p className="pointer-events-auto rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-lg">
                            {errorMessage}
                        </p>
                    )}
                    {infoMessage && (
                        <p className="pointer-events-auto rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 shadow-lg">
                            {infoMessage}
                        </p>
                    )}
                </div>
            </main>
        </div>
    );
}

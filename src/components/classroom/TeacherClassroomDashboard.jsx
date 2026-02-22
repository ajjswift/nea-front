"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    Clipboard,
    LoaderCircle,
    Plus,
    Save,
    UserMinus,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ClassroomApiClient,
    ClassroomApiError,
} from "@/lib/classroom/ClassroomApiClient";
import {
    ApiError,
    EnvironmentApiClient,
} from "@/lib/environments/EnvironmentApiClient";

const classroomApiClient = new ClassroomApiClient();
const environmentApiClient = new EnvironmentApiClient();
const NEW_ASSIGNMENT_DRAFT_STORAGE_KEY_PREFIX = "classroom:new-assignment-draft:";

function getAssignmentDraftStorageKey(classId) {
    return `${NEW_ASSIGNMENT_DRAFT_STORAGE_KEY_PREFIX}${classId}`;
}

function toDateTimeLocalValue(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
    const local = new Date(date.getTime() - timezoneOffsetMs);
    return local.toISOString().slice(0, 16);
}

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

export default function TeacherClassroomDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [dashboard, setDashboard] = useState({ user: null, classes: [] });
    const [templateEnvironments, setTemplateEnvironments] = useState([]);
    const [selectedClassId, setSelectedClassId] = useState(null);
    const [newClassName, setNewClassName] = useState("");
    const [newClassDescription, setNewClassDescription] = useState("");
    const [newAssignment, setNewAssignment] = useState({
        title: "",
        description: "",
        dueAt: "",
        templateEnvironmentId: "",
    });
    const [activeAssignmentId, setActiveAssignmentId] = useState(null);
    const [assignmentDraft, setAssignmentDraft] = useState({
        title: "",
        description: "",
        dueAt: "",
    });
    const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);
    const [isTemplateNamePromptOpen, setIsTemplateNamePromptOpen] = useState(false);
    const [templateNameDraft, setTemplateNameDraft] = useState("");
    const [isStudentsModalOpen, setIsStudentsModalOpen] = useState(false);
    const [activeStudentActionId, setActiveStudentActionId] = useState(null);
    const [assignmentViewerStudentId, setAssignmentViewerStudentId] = useState(null);
    const [removalCandidateStudentId, setRemovalCandidateStudentId] = useState(null);
    const [classDeletionCandidateId, setClassDeletionCandidateId] = useState(null);
    const [assignmentDeletionCandidateId, setAssignmentDeletionCandidateId] =
        useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletingClass, setIsDeletingClass] = useState(false);
    const [isDeletingAssignment, setIsDeletingAssignment] = useState(false);
    const [isCreatingTemplateEnvironment, setIsCreatingTemplateEnvironment] =
        useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [infoMessage, setInfoMessage] = useState("");

    const selectedClass = useMemo(
        () => dashboard.classes.find((entry) => entry.id === selectedClassId) || null,
        [dashboard.classes, selectedClassId],
    );

    const activeAssignment = useMemo(() => {
        if (!selectedClass || !activeAssignmentId) {
            return null;
        }

        return (
            selectedClass.assignments.find(
                (assignment) => assignment.id === activeAssignmentId,
            ) || null
        );
    }, [selectedClass, activeAssignmentId]);

    const assignmentViewerStudent = useMemo(() => {
        if (!selectedClass || !assignmentViewerStudentId) {
            return null;
        }

        return (
            selectedClass.students.find(
                (student) => student.id === assignmentViewerStudentId,
            ) || null
        );
    }, [selectedClass, assignmentViewerStudentId]);

    const assignmentViewerItems = useMemo(() => {
        if (!selectedClass || !assignmentViewerStudentId) {
            return [];
        }

        return selectedClass.assignments
            .flatMap((assignment) =>
                assignment.environments
                    .filter((link) => link.studentId === assignmentViewerStudentId)
                    .map((link) => ({
                        ...link,
                        assignmentId: assignment.id,
                        assignmentTitle: assignment.title,
                    })),
            )
            .sort((a, b) =>
                a.assignmentTitle.localeCompare(b.assignmentTitle, undefined, {
                    sensitivity: "base",
                }),
            );
    }, [selectedClass, assignmentViewerStudentId]);

    const removalCandidateStudent = useMemo(() => {
        if (!selectedClass || !removalCandidateStudentId) {
            return null;
        }

        return (
            selectedClass.students.find(
                (student) => student.id === removalCandidateStudentId,
            ) || null
        );
    }, [selectedClass, removalCandidateStudentId]);

    const classDeletionCandidate = useMemo(() => {
        if (!classDeletionCandidateId) {
            return null;
        }

        return (
            dashboard.classes.find((entry) => entry.id === classDeletionCandidateId) ||
            null
        );
    }, [classDeletionCandidateId, dashboard.classes]);

    const assignmentDeletionCandidate = useMemo(() => {
        if (!assignmentDeletionCandidateId) {
            return null;
        }

        for (const classEntry of dashboard.classes) {
            const assignment = (classEntry.assignments || []).find(
                (value) => value.id === assignmentDeletionCandidateId,
            );

            if (assignment) {
                return {
                    assignment,
                    classEntry,
                };
            }
        }

        return null;
    }, [assignmentDeletionCandidateId, dashboard.classes]);

    const loadDashboard = useCallback(async () => {
        setIsLoading(true);
        setErrorMessage("");

        try {
            const [dashboardResult, environmentsResult] = await Promise.allSettled([
                classroomApiClient.getDashboard(),
                environmentApiClient.listEnvironments(),
            ]);

            if (dashboardResult.status === "rejected") {
                throw dashboardResult.reason;
            }

            const payload = dashboardResult.value;
            const classes = Array.isArray(payload.classes) ? payload.classes : [];

            setDashboard({
                user: payload.user || null,
                classes,
            });
            setSelectedClassId((current) => {
                if (current && classes.some((entry) => entry.id === current)) {
                    return current;
                }

                return classes[0]?.id || null;
            });

            if (environmentsResult.status === "fulfilled") {
                const environmentsPayload = environmentsResult.value;
                setTemplateEnvironments(
                    Array.isArray(environmentsPayload?.environments)
                        ? environmentsPayload.environments
                        : [],
                );
            } else if (
                !(
                    environmentsResult.reason instanceof ApiError &&
                    environmentsResult.reason.status === 401
                )
            ) {
                setTemplateEnvironments([]);
            }
        } catch (error) {
            if (error instanceof ClassroomApiError && error.status === 403) {
                setErrorMessage("Teacher account required for classroom features.");
            } else if (error instanceof ClassroomApiError && error.status === 401) {
                setErrorMessage("Please log in to continue.");
            } else {
                setErrorMessage(error.message || "Failed to load classroom data.");
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        if (!activeAssignment) {
            setAssignmentDraft({ title: "", description: "", dueAt: "" });
            return;
        }

        setAssignmentDraft({
            title: activeAssignment.title || "",
            description: activeAssignment.description || "",
            dueAt: toDateTimeLocalValue(activeAssignment.dueAt),
        });
    }, [activeAssignment]);

    useEffect(() => {
        if (!errorMessage && !infoMessage) {
            return;
        }

        const timeoutId = setTimeout(() => {
            setErrorMessage("");
            setInfoMessage("");
        }, 3000);

        return () => clearTimeout(timeoutId);
    }, [errorMessage, infoMessage]);

    const persistAssignmentDraft = useCallback((classId, draft) => {
        if (!classId || typeof window === "undefined") {
            return;
        }

        try {
            window.sessionStorage.setItem(
                getAssignmentDraftStorageKey(classId),
                JSON.stringify(draft),
            );
        } catch {
            // Ignore storage failures in restricted browser contexts.
        }
    }, []);

    const loadAssignmentDraft = useCallback((classId) => {
        if (!classId || typeof window === "undefined") {
            return null;
        }

        try {
            const rawValue = window.sessionStorage.getItem(
                getAssignmentDraftStorageKey(classId),
            );
            if (!rawValue) {
                return null;
            }

            const parsed = JSON.parse(rawValue);
            return {
                title: typeof parsed?.title === "string" ? parsed.title : "",
                description:
                    typeof parsed?.description === "string"
                        ? parsed.description
                        : "",
                dueAt: typeof parsed?.dueAt === "string" ? parsed.dueAt : "",
                templateEnvironmentId:
                    typeof parsed?.templateEnvironmentId === "string"
                        ? parsed.templateEnvironmentId
                        : "",
            };
        } catch {
            return null;
        }
    }, []);

    const clearAssignmentDraft = useCallback((classId) => {
        if (!classId || typeof window === "undefined") {
            return;
        }

        try {
            window.sessionStorage.removeItem(getAssignmentDraftStorageKey(classId));
        } catch {
            // Ignore storage failures in restricted browser contexts.
        }
    }, []);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        const shouldResume = searchParams.get("openNewAssignment") === "1";
        if (!shouldResume) {
            return;
        }

        const requestedClassId = searchParams.get("classId");
        const fallbackClassId = dashboard.classes[0]?.id || null;
        const classId =
            requestedClassId &&
            dashboard.classes.some((entry) => entry.id === requestedClassId)
                ? requestedClassId
                : fallbackClassId;

        if (!classId) {
            return;
        }

        const resumedTemplateEnvironmentId =
            searchParams.get("templateEnvironmentId") || "";
        const storedDraft = loadAssignmentDraft(classId);

        setSelectedClassId(classId);
        setIsCreateAssignmentOpen(true);
        setNewAssignment({
            title: storedDraft?.title || "",
            description: storedDraft?.description || "",
            dueAt: storedDraft?.dueAt || "",
            templateEnvironmentId:
                resumedTemplateEnvironmentId ||
                storedDraft?.templateEnvironmentId ||
                "",
        });

        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete("openNewAssignment");
        nextParams.delete("classId");
        nextParams.delete("templateEnvironmentId");
        const nextQuery = nextParams.toString();
        router.replace(nextQuery ? `/classroom?${nextQuery}` : "/classroom");
    }, [dashboard.classes, isLoading, loadAssignmentDraft, router, searchParams]);

    const handleCreateClass = async (event) => {
        event.preventDefault();
        if (!newClassName.trim()) {
            setErrorMessage("Class name is required.");
            return;
        }

        setIsSaving(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const payload = await classroomApiClient.createClass({
                name: newClassName,
                description: newClassDescription,
            });
            const createdClass = payload.class;

            setDashboard((prev) => ({
                ...prev,
                classes: [createdClass, ...prev.classes],
            }));
            setSelectedClassId(createdClass.id);
            setNewClassName("");
            setNewClassDescription("");
            setInfoMessage("Class created.");
        } catch (error) {
            setErrorMessage(error.message || "Failed to create class.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveStudent = async (studentId) => {
        if (!selectedClass) {
            return;
        }

        const student = selectedClass.students.find((value) => value.id === studentId);
        if (!student) {
            return;
        }

        setActiveStudentActionId(studentId);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const remainingUsernames = selectedClass.students
                .filter((value) => value.id !== studentId)
                .map((value) => value.username);

            const payload = await classroomApiClient.setClassStudents(
                selectedClass.id,
                remainingUsernames,
            );

            setDashboard((prev) => ({
                ...prev,
                classes: prev.classes.map((entry) =>
                    entry.id === selectedClass.id
                        ? { ...entry, students: payload.students }
                        : entry,
                ),
            }));
            setInfoMessage(`Removed ${student.username} from class.`);
        } catch (error) {
            setErrorMessage(error.message || "Failed to remove student.");
        } finally {
            setActiveStudentActionId(null);
        }
    };

    const handleConfirmRemoveStudent = async () => {
        if (!removalCandidateStudentId) {
            return;
        }

        await handleRemoveStudent(removalCandidateStudentId);
        setRemovalCandidateStudentId(null);
    };

    const handleCreateAssignment = async (event) => {
        event.preventDefault();
        if (!selectedClass) {
            return;
        }

        if (!newAssignment.title.trim()) {
            setErrorMessage("Assignment title is required.");
            return;
        }

        setIsSaving(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            await classroomApiClient.createAssignment(selectedClass.id, {
                title: newAssignment.title,
                description: newAssignment.description,
                dueAt: newAssignment.dueAt || null,
                templateEnvironmentId: newAssignment.templateEnvironmentId || null,
            });

            setIsCreateAssignmentOpen(false);
            setNewAssignment({
                title: "",
                description: "",
                dueAt: "",
                templateEnvironmentId: "",
            });
            clearAssignmentDraft(selectedClass.id);
            await loadDashboard();
            setInfoMessage("Assignment created.");
        } catch (error) {
            setErrorMessage(error.message || "Failed to create assignment.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateTemplateEnvironment = async () => {
        if (!selectedClass) {
            return;
        }

        const normalizedTemplateName = templateNameDraft.trim();
        if (!normalizedTemplateName) {
            setErrorMessage("Template name is required.");
            return;
        }

        setIsCreatingTemplateEnvironment(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const templateDescription = newAssignment.description
                ? newAssignment.description.slice(0, 500)
                : "Assignment template";

            const payload = await environmentApiClient.createEnvironment({
                name: normalizedTemplateName.slice(0, 80),
                description: templateDescription,
                runtime: "python-3.11",
            });

            const templateEnvironmentId = payload?.environment?.id || "";
            if (!templateEnvironmentId) {
                throw new Error("Template environment was created without an ID.");
            }

            const draftToPersist = {
                title: newAssignment.title,
                description: newAssignment.description,
                dueAt: newAssignment.dueAt,
                templateEnvironmentId,
            };
            persistAssignmentDraft(selectedClass.id, draftToPersist);

            const resumeParams = new URLSearchParams({
                openNewAssignment: "1",
                classId: selectedClass.id,
                templateEnvironmentId,
            });
            const returnToPath = `/classroom?${resumeParams.toString()}`;
            setIsTemplateNamePromptOpen(false);
            setTemplateNameDraft("");
            router.push(
                `/environment/${templateEnvironmentId}?seedInstructions=1&returnTo=${encodeURIComponent(
                    returnToPath,
                )}`,
            );
        } catch (error) {
            setErrorMessage(
                error?.message || "Could not create template environment.",
            );
        } finally {
            setIsCreatingTemplateEnvironment(false);
        }
    };

    const handleUpdateAssignment = async (event) => {
        event.preventDefault();
        if (!activeAssignment) {
            return;
        }

        setIsSaving(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const payload = await classroomApiClient.updateAssignment(
                activeAssignment.id,
                {
                    title: assignmentDraft.title,
                    description: assignmentDraft.description,
                    dueAt: assignmentDraft.dueAt || null,
                },
            );

            setDashboard((prev) => ({
                ...prev,
                classes: prev.classes.map((classEntry) => ({
                    ...classEntry,
                    assignments: classEntry.assignments.map((assignment) =>
                        assignment.id === activeAssignment.id
                            ? {
                                  ...assignment,
                                  title: payload.assignment.title,
                                  description: payload.assignment.description,
                                  dueAt: payload.assignment.due_at,
                                  templateEnvironmentId:
                                      payload.assignment.template_environment_id ||
                                      assignment.templateEnvironmentId ||
                                      null,
                                  updatedAt: payload.assignment.updated_at,
                              }
                            : assignment,
                    ),
                })),
            }));
            setInfoMessage("Assignment updated.");
        } catch (error) {
            setErrorMessage(error.message || "Failed to update assignment.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopyJoinCode = async () => {
        if (!selectedClass?.joinCode) {
            return;
        }

        setErrorMessage("");
        setInfoMessage("");

        try {
            await navigator.clipboard.writeText(selectedClass.joinCode);
            setInfoMessage("Join code copied.");
        } catch {
            setErrorMessage("Could not copy join code.");
        }
    };

    const handleConfirmDeleteClass = async () => {
        if (!classDeletionCandidate) {
            return;
        }

        setIsDeletingClass(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const payload = await classroomApiClient.deleteClass(
                classDeletionCandidate.id,
            );
            const deletedEnvironmentCount =
                payload?.deletedEnvironmentCount ??
                payload?.class?.deletedEnvironmentCount ??
                0;

            setClassDeletionCandidateId(null);
            setActiveAssignmentId(null);
            setAssignmentDeletionCandidateId(null);
            await loadDashboard();
            setInfoMessage(
                `Deleted class "${classDeletionCandidate.name}" and ${deletedEnvironmentCount} linked environment${
                    deletedEnvironmentCount === 1 ? "" : "s"
                }.`,
            );
        } catch (error) {
            setErrorMessage(error.message || "Failed to delete class.");
        } finally {
            setIsDeletingClass(false);
        }
    };

    const handleConfirmDeleteAssignment = async () => {
        if (!assignmentDeletionCandidate) {
            return;
        }

        setIsDeletingAssignment(true);
        setErrorMessage("");
        setInfoMessage("");

        try {
            const payload = await classroomApiClient.deleteAssignment(
                assignmentDeletionCandidate.assignment.id,
            );
            const deletedEnvironmentCount =
                payload?.deletedEnvironmentCount ??
                payload?.assignment?.deletedEnvironmentCount ??
                0;

            setAssignmentDeletionCandidateId(null);
            setActiveAssignmentId(null);
            await loadDashboard();
            setInfoMessage(
                `Deleted assignment "${assignmentDeletionCandidate.assignment.title}" and ${deletedEnvironmentCount} linked environment${
                    deletedEnvironmentCount === 1 ? "" : "s"
                }.`,
            );
        } catch (error) {
            setErrorMessage(error.message || "Failed to delete assignment.");
        } finally {
            setIsDeletingAssignment(false);
        }
    };

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
                                Manage classes, assignments, and student environments.
                            </p>
                        </div>
                        {dashboard.user && (
                            <p className="text-xs text-zinc-500">
                                Teacher: {dashboard.user.username}
                            </p>
                        )}
                    </div>
                </header>

                {isLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                        <LoaderCircle className="size-4 animate-spin" />
                        Loading classroom dashboard...
                    </div>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="space-y-4">
                            <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                                <h2 className="text-sm font-medium">New class</h2>
                                <form className="mt-3 space-y-3" onSubmit={handleCreateClass}>
                                    <Input
                                        placeholder="Class name"
                                        value={newClassName}
                                        onChange={(event) =>
                                            setNewClassName(event.target.value)
                                        }
                                        maxLength={120}
                                    />
                                    <Textarea
                                        placeholder="Description (optional)"
                                        value={newClassDescription}
                                        onChange={(event) =>
                                            setNewClassDescription(event.target.value)
                                        }
                                        maxLength={800}
                                    />
                                    <Button
                                        type="submit"
                                        disabled={isSaving}
                                        className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                    >
                                        <Plus className="size-4" />
                                        Create class
                                    </Button>
                                </form>
                            </section>

                            <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                                <div className="border-b border-zinc-800 px-4 py-3 text-sm font-medium">
                                    Classes
                                </div>
                                <div className="divide-y divide-zinc-800">
                                    {dashboard.classes.length === 0 ? (
                                        <p className="px-4 py-4 text-sm text-zinc-400">
                                            No classes yet.
                                        </p>
                                    ) : (
                                        dashboard.classes.map((entry) => (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                onClick={() => setSelectedClassId(entry.id)}
                                                className={`w-full px-4 py-3 text-left transition-colors ${
                                                    selectedClassId === entry.id
                                                        ? "bg-zinc-800/60"
                                                        : "hover:bg-zinc-800/30"
                                                }`}
                                            >
                                                <p className="text-sm font-medium">{entry.name}</p>
                                                <p className="mt-1 text-xs text-zinc-500">
                                                    {entry.students.length} students ·{" "}
                                                    {entry.assignments.length} assignments
                                                </p>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </section>
                        </aside>

                        <section className="space-y-4">
                            {!selectedClass ? (
                                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                                    Select a class to manage students and assignments.
                                </div>
                            ) : (
                                <>
                                    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                                        <h2 className="text-base font-medium">
                                            {selectedClass.name}
                                        </h2>
                                        <p className="mt-1 text-sm text-zinc-400">
                                            {selectedClass.description || "No class description."}
                                        </p>
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                                            <span className="rounded border border-zinc-700 px-2 py-1">
                                                Join code: {selectedClass.joinCode || "Unavailable"}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2"
                                                onClick={handleCopyJoinCode}
                                            >
                                                <Clipboard className="size-3.5" />
                                                Copy
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 border-red-400/40 px-2 text-red-200 hover:bg-red-500/10"
                                                onClick={() =>
                                                    setClassDeletionCandidateId(
                                                        selectedClass.id,
                                                    )
                                                }
                                            >
                                                Delete class
                                            </Button>
                                        </div>
                                    </section>

                                    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-medium">
                                                    Class students
                                                </h3>
                                                <p className="mt-1 text-xs text-zinc-500">
                                                    {selectedClass.students.length} enrolled · manage removals and linked environments in one place.
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setIsStudentsModalOpen(true)}
                                            >
                                                <Users className="size-4" />
                                                Manage students
                                            </Button>
                                        </div>
                                    </section>

                                    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                                        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 text-sm font-medium">
                                            <span>Assignments</span>
                                            <Button
                                                size="sm"
                                                onClick={() => setIsCreateAssignmentOpen(true)}
                                                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                            >
                                                <Plus className="size-4" />
                                                New assignment
                                            </Button>
                                        </div>
                                        {selectedClass.assignments.length === 0 ? (
                                            <p className="px-4 py-4 text-sm text-zinc-400">
                                                No assignments yet.
                                            </p>
                                        ) : (
                                            <div className="divide-y divide-zinc-800">
                                                {selectedClass.assignments.map((assignment) => (
                                                    <button
                                                        key={assignment.id}
                                                        type="button"
                                                        onClick={() =>
                                                            setActiveAssignmentId(assignment.id)
                                                        }
                                                        className="w-full px-4 py-3 text-left transition-colors hover:bg-zinc-800/40"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium text-zinc-100">
                                                                    {assignment.title}
                                                                </p>
                                                                <p className="mt-1 text-xs text-zinc-500">
                                                                    {assignment.environments.length} student environments ·{" "}
                                                                    {formatDueLabel(assignment.dueAt)}
                                                                </p>
                                                            </div>
                                                            <ArrowRight className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                </>
                            )}
                        </section>
                    </div>
                )}
            </main>

            <Dialog
                open={isStudentsModalOpen}
                onOpenChange={(open) => {
                    setIsStudentsModalOpen(open);
                    if (!open) {
                        setActiveStudentActionId(null);
                        setAssignmentViewerStudentId(null);
                        setRemovalCandidateStudentId(null);
                    }
                }}
            >
                <DialogContent className="max-w-3xl">
                    {!selectedClass ? null : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Class students</DialogTitle>
                                <DialogDescription>
                                    Remove students or open any environment that belongs to this class.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="rounded border border-zinc-800">
                                <div className="grid grid-cols-[1fr_auto] border-b border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
                                    <span>Student</span>
                                    <span>Action</span>
                                </div>
                                {selectedClass.students.length === 0 ? (
                                    <p className="px-3 py-3 text-sm text-zinc-400">
                                        No students currently enrolled.
                                    </p>
                                ) : (
                                    selectedClass.students.map((student) => (
                                        <div
                                            key={student.id}
                                            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-800 px-3 py-2 last:border-b-0"
                                        >
                                            <span className="text-sm text-zinc-200">
                                                {student.username}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={
                                                        activeStudentActionId === student.id
                                                    }
                                                    onClick={() =>
                                                        setAssignmentViewerStudentId(student.id)
                                                    }
                                                >
                                                    View assignments
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={
                                                        activeStudentActionId === student.id
                                                    }
                                                    onClick={() =>
                                                        setRemovalCandidateStudentId(student.id)
                                                    }
                                                >
                                                    {activeStudentActionId === student.id ? (
                                                        <LoaderCircle className="size-4 animate-spin" />
                                                    ) : (
                                                        <UserMinus className="size-4" />
                                                    )}
                                                    Remove
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(assignmentViewerStudent)}
                onOpenChange={(open) => {
                    if (!open) {
                        setAssignmentViewerStudentId(null);
                    }
                }}
            >
                <DialogContent className="max-w-2xl">
                    {!assignmentViewerStudent ? null : (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {assignmentViewerStudent.username} assignments
                                </DialogTitle>
                                <DialogDescription>
                                    Linked assignment environments for this student.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="rounded border border-zinc-800">
                                <div className="grid grid-cols-[1fr_auto] border-b border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
                                    <span>Assignment</span>
                                    <span>Environment</span>
                                </div>
                                {assignmentViewerItems.length === 0 ? (
                                    <p className="px-3 py-3 text-sm text-zinc-400">
                                        No assignment environments for this student yet.
                                    </p>
                                ) : (
                                    assignmentViewerItems.map((entry) => (
                                        <div
                                            key={entry.assignmentEnvironmentId}
                                            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-800 px-3 py-2 last:border-b-0"
                                        >
                                            <span className="truncate text-sm text-zinc-200">
                                                {entry.assignmentTitle}
                                            </span>
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={`/environment/${entry.environmentId}`}>
                                                    Open
                                                    <ArrowRight className="size-4" />
                                                </Link>
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(removalCandidateStudent)}
                onOpenChange={(open) => {
                    if (!open) {
                        setRemovalCandidateStudentId(null);
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    {!removalCandidateStudent ? null : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Remove student?</DialogTitle>
                                <DialogDescription>
                                    Remove <strong>{removalCandidateStudent.username}</strong>{" "}
                                    from this class?
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setRemovalCandidateStudentId(null)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    className="bg-red-600 text-white hover:bg-red-700"
                                    disabled={activeStudentActionId !== null}
                                    onClick={handleConfirmRemoveStudent}
                                >
                                    {activeStudentActionId ? (
                                        <>
                                            <LoaderCircle className="size-4 animate-spin" />
                                            Removing
                                        </>
                                    ) : (
                                        "Remove"
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={isCreateAssignmentOpen}
                onOpenChange={setIsCreateAssignmentOpen}
            >
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>New assignment</DialogTitle>
                        <DialogDescription>
                            Create an assignment and optionally base it on a template environment.
                        </DialogDescription>
                    </DialogHeader>

                    <form className="space-y-3" onSubmit={handleCreateAssignment}>
                        <Input
                            placeholder="Assignment title"
                            value={newAssignment.title}
                            onChange={(event) =>
                                setNewAssignment((prev) => ({
                                    ...prev,
                                    title: event.target.value,
                                }))
                            }
                            maxLength={160}
                        />
                        <Textarea
                            placeholder="Assignment description (optional)"
                            value={newAssignment.description}
                            onChange={(event) =>
                                setNewAssignment((prev) => ({
                                    ...prev,
                                    description: event.target.value,
                                }))
                            }
                            maxLength={2000}
                        />
                        <Input
                            type="datetime-local"
                            value={newAssignment.dueAt}
                            onChange={(event) =>
                                setNewAssignment((prev) => ({
                                    ...prev,
                                    dueAt: event.target.value,
                                }))
                            }
                        />
                        <div>
                            <label
                                htmlFor="templateEnvironment"
                                className="mb-1 block text-xs text-zinc-400"
                            >
                                Template environment
                            </label>
                            <select
                                id="templateEnvironment"
                                value={newAssignment.templateEnvironmentId}
                                onChange={(event) =>
                                    setNewAssignment((prev) => ({
                                        ...prev,
                                        templateEnvironmentId: event.target.value,
                                    }))
                                }
                                className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                            >
                                <option value="">Blank environment</option>
                                {templateEnvironments.map((environment) => (
                                    <option key={environment.id} value={environment.id}>
                                        {environment.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isSaving || isCreatingTemplateEnvironment}
                            onClick={() => {
                                setTemplateNameDraft("");
                                setIsTemplateNamePromptOpen(true);
                            }}
                        >
                            {isCreatingTemplateEnvironment ? (
                                <>
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Opening template editor...
                                </>
                            ) : (
                                "Create template environment"
                            )}
                        </Button>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsCreateAssignmentOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSaving || isCreatingTemplateEnvironment}
                                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                            >
                                {isSaving ? (
                                    <>
                                        <LoaderCircle className="size-4 animate-spin" />
                                        Creating
                                    </>
                                ) : (
                                    <>
                                        <Plus className="size-4" />
                                        Create assignment
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={isTemplateNamePromptOpen}
                onOpenChange={(open) => {
                    setIsTemplateNamePromptOpen(open);
                    if (!open) {
                        setTemplateNameDraft("");
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Name template environment</DialogTitle>
                        <DialogDescription>
                            Choose the name for the template before opening the editor.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <Input
                            placeholder="Template name"
                            value={templateNameDraft}
                            onChange={(event) => setTemplateNameDraft(event.target.value)}
                            maxLength={80}
                            autoFocus
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsTemplateNamePromptOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={isCreatingTemplateEnvironment}
                            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                            onClick={handleCreateTemplateEnvironment}
                        >
                            {isCreatingTemplateEnvironment ? (
                                <>
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Opening...
                                </>
                            ) : (
                                "Create and open"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(activeAssignment)}
                onOpenChange={(open) => {
                    if (!open) {
                        setActiveAssignmentId(null);
                    }
                }}
            >
                <DialogContent className="max-w-2xl">
                    {!activeAssignment ? null : (
                        <>
                            <DialogHeader>
                                <DialogTitle>{activeAssignment.title}</DialogTitle>
                                <DialogDescription>
                                    Update assignment details and open student environments.
                                </DialogDescription>
                            </DialogHeader>

                            <form className="space-y-3" onSubmit={handleUpdateAssignment}>
                                <Input
                                    value={assignmentDraft.title}
                                    onChange={(event) =>
                                        setAssignmentDraft((prev) => ({
                                            ...prev,
                                            title: event.target.value,
                                        }))
                                    }
                                    maxLength={160}
                                />
                                <Textarea
                                    value={assignmentDraft.description}
                                    onChange={(event) =>
                                        setAssignmentDraft((prev) => ({
                                            ...prev,
                                            description: event.target.value,
                                        }))
                                    }
                                    maxLength={2000}
                                />
                                <Input
                                    type="datetime-local"
                                    value={assignmentDraft.dueAt}
                                    onChange={(event) =>
                                        setAssignmentDraft((prev) => ({
                                            ...prev,
                                            dueAt: event.target.value,
                                        }))
                                    }
                                />

                                <p className="text-xs text-zinc-500">
                                    Template: {activeAssignment.templateEnvironmentName || "Blank environment"}
                                </p>

                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="border-red-400/40 text-red-200 hover:bg-red-500/10"
                                        disabled={isSaving || isDeletingAssignment}
                                        onClick={() =>
                                            setAssignmentDeletionCandidateId(
                                                activeAssignment.id,
                                            )
                                        }
                                    >
                                        Delete assignment
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSaving}
                                        className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                    >
                                        {isSaving ? (
                                            <>
                                                <LoaderCircle className="size-4 animate-spin" />
                                                Saving
                                            </>
                                        ) : (
                                            <>
                                                <Save className="size-4" />
                                                Save assignment
                                            </>
                                        )}
                                    </Button>
                                </DialogFooter>
                            </form>

                            <div className="rounded border border-zinc-800">
                                <div className="grid grid-cols-[1fr_auto] border-b border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
                                    <span>Student</span>
                                    <span>Environment</span>
                                </div>
                                {activeAssignment.environments.length === 0 ? (
                                    <p className="px-3 py-3 text-sm text-zinc-400">
                                        No student environments linked.
                                    </p>
                                ) : (
                                    activeAssignment.environments.map((entry) => (
                                        <div
                                            key={entry.assignmentEnvironmentId}
                                            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-800 px-3 py-2 last:border-b-0"
                                        >
                                            <span className="text-sm text-zinc-200">
                                                {entry.studentUsername}
                                            </span>
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={`/environment/${entry.environmentId}`}>
                                                    Open
                                                    <ArrowRight className="size-4" />
                                                </Link>
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(classDeletionCandidate)}
                onOpenChange={(open) => {
                    if (!open && !isDeletingClass) {
                        setClassDeletionCandidateId(null);
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    {!classDeletionCandidate ? null : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Delete class?</DialogTitle>
                                <DialogDescription>
                                    Delete <strong>{classDeletionCandidate.name}</strong> and
                                    all assignments in this class? This also deletes every
                                    student assignment environment linked to those assignments.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isDeletingClass}
                                    onClick={() => setClassDeletionCandidateId(null)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    className="bg-red-600 text-white hover:bg-red-700"
                                    disabled={isDeletingClass}
                                    onClick={handleConfirmDeleteClass}
                                >
                                    {isDeletingClass ? (
                                        <>
                                            <LoaderCircle className="size-4 animate-spin" />
                                            Deleting
                                        </>
                                    ) : (
                                        "Delete class"
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(assignmentDeletionCandidate)}
                onOpenChange={(open) => {
                    if (!open && !isDeletingAssignment) {
                        setAssignmentDeletionCandidateId(null);
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    {!assignmentDeletionCandidate ? null : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Delete assignment?</DialogTitle>
                                <DialogDescription>
                                    Delete{" "}
                                    <strong>
                                        {assignmentDeletionCandidate.assignment.title}
                                    </strong>{" "}
                                    from{" "}
                                    <strong>
                                        {assignmentDeletionCandidate.classEntry.name}
                                    </strong>
                                    ? All linked student assignment environments will be
                                    deleted.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isDeletingAssignment}
                                    onClick={() => setAssignmentDeletionCandidateId(null)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    className="bg-red-600 text-white hover:bg-red-700"
                                    disabled={isDeletingAssignment}
                                    onClick={handleConfirmDeleteAssignment}
                                >
                                    {isDeletingAssignment ? (
                                        <>
                                            <LoaderCircle className="size-4 animate-spin" />
                                            Deleting
                                        </>
                                    ) : (
                                        "Delete assignment"
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2">
                {errorMessage && (
                    <p className="pointer-events-auto rounded-md border border-red-400/30 bg-red-500/90 px-3 py-2 text-sm text-red-100 shadow-lg backdrop-blur">
                        {errorMessage}
                    </p>
                )}
                {infoMessage && (
                    <p className="pointer-events-auto rounded-md border border-emerald-400/30 bg-emerald-500/90 px-3 py-2 text-sm text-emerald-100 shadow-lg backdrop-blur">
                        {infoMessage}
                    </p>
                )}
            </div>
        </div>
    );
}

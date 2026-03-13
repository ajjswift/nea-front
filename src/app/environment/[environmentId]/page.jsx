"use client";

import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FileManager } from "@/components/files/FileManager";
import { FileViewer } from "@/components/files/FileViewer";
import { Console } from "@/components/files/Console";
import { ProgramDisplayPanel } from "@/components/files/ProgramDisplayPanel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowUpRight,
    CirclePlay,
    X,
    Copy,
    Focus,
    LoaderCircle,
    LocateFixed,
    RotateCcw,
    SlidersHorizontal,
    Square,
    SquareTerminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    ApiError,
    EnvironmentApiClient,
} from "@/lib/environments/EnvironmentApiClient";
import { ClassroomApiClient } from "@/lib/classroom/ClassroomApiClient";

const environmentApiClient = new EnvironmentApiClient();
const classroomApiClient = new ClassroomApiClient();
const ACCESSIBILITY_STORAGE_KEY = "environment:accessibility:v1";
const VIRTUAL_INSTRUCTIONS_FILE_ID = "__virtual_assignment_instructions__";
const STOP_BUTTON_ARM_DELAY_MS = 650;
const DEFAULT_ACCESSIBILITY = {
    fontSize: "md",
    highContrast: false,
    reduceMotion: false,
    readableFont: false,
};

function isInstructionsFile(fileName) {
    return (fileName || "").toLowerCase() === "instructions.md";
}

function getSubmissionStatusModel(status) {
    switch (status) {
        case "submitted":
            return {
                label: "Submitted",
                toneClass:
                    "text-emerald-200 border-emerald-400/30 bg-emerald-500/10",
            };
        case "needs_changes":
            return {
                label: "Needs changes",
                toneClass:
                    "text-amber-200 border-amber-400/30 bg-amber-500/10",
            };
        case "in_progress":
            return {
                label: "In progress",
                toneClass: "text-sky-200 border-sky-400/30 bg-sky-500/10",
            };
        default:
            return {
                label: "Not started",
                toneClass: "text-zinc-200 border-zinc-500/30 bg-zinc-500/10",
            };
    }
}

function formatDateTime(value) {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toLocaleString();
}

export default function EnvironmentPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const environmentId = Array.isArray(params.environmentId)
        ? params.environmentId[0]
        : params.environmentId;

    const { environment, setEnvironment } = useEnvironment();
    const [isRunning, setIsRunning] = useState(false);
    const [isMetaLoading, setIsMetaLoading] = useState(true);
    const [environmentName, setEnvironmentName] = useState("Environment");
    const [metadataError, setMetadataError] = useState("");
    const [infoMessage, setInfoMessage] = useState("");
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [showConsole, setShowConsole] = useState(true);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [isStopButtonArmed, setIsStopButtonArmed] = useState(false);
    const [isResettingTemplate, setIsResettingTemplate] = useState(false);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isRunningTests, setIsRunningTests] = useState(false);
    const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
    const [helpMessage, setHelpMessage] = useState("");
    const [isSendingHelp, setIsSendingHelp] = useState(false);
    const [isSubmissionUpdating, setIsSubmissionUpdating] = useState(false);
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const [isSavingFeedback, setIsSavingFeedback] = useState(false);
    const [feedbackDraft, setFeedbackDraft] = useState({
        fileName: "",
        lineNumber: "",
        content: "",
    });
    const [isAccessibilityOpen, setIsAccessibilityOpen] = useState(false);
    const [isDisplayDialogOpen, setIsDisplayDialogOpen] = useState(false);
    const [accessibility, setAccessibility] = useState(() => {
        if (typeof window === "undefined") {
            return DEFAULT_ACCESSIBILITY;
        }

        try {
            const raw = window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
            if (!raw) {
                return DEFAULT_ACCESSIBILITY;
            }

            const parsed = JSON.parse(raw);
            return {
                fontSize: ["sm", "md", "lg"].includes(parsed?.fontSize)
                    ? parsed.fontSize
                    : DEFAULT_ACCESSIBILITY.fontSize,
                highContrast: Boolean(parsed?.highContrast),
                reduceMotion: Boolean(parsed?.reduceMotion),
                readableFont: Boolean(parsed?.readableFont),
            };
        } catch {
            return DEFAULT_ACCESSIBILITY;
        }
    });
    const [followStudentId, setFollowStudentId] = useState(() => {
        const value = searchParams.get("followStudent");
        return value ? value.trim() : "";
    });
    const hasSeededInstructionsRef = useRef(false);
    const stopButtonArmTimeoutRef = useRef(null);
    const displayModalFrameRef = useRef(null);
    const isReady = environment?.ws?.readyState === 1;
    const isReadOnlyEnvironment = Boolean(
        environment?.permissions?.readOnlyEnvironment,
    );
    const isAssignmentEnvironment = Boolean(
        environment?.access?.isAssignmentEnvironment,
    );
    const isStudentViewer = environment?.access?.viewerRole === "student";
    const submissionStatus = environment?.access?.submissionStatus || "not_started";
    const submissionStatusModel = useMemo(
        () => getSubmissionStatusModel(submissionStatus),
        [submissionStatus],
    );
    const latestTestRun =
        environment?.access?.latestTestRun &&
        typeof environment.access.latestTestRun === "object"
            ? environment.access.latestTestRun
            : { summary: { total: 0, passed: 0, failed: 0 }, results: [] };
    const teacherComments = Array.isArray(environment?.access?.teacherComments)
        ? environment.access.teacherComments
        : [];
    const canManageTeacherComments = Boolean(
        environment?.access?.canManageTeacherComments,
    );
    const canUpdateSubmissionStatus = Boolean(
        environment?.access?.canUpdateSubmissionStatus,
    );
    const currentFile = Array.isArray(environment?.files)
        ? environment.files.find((file) => file.id === environment?.currentFile) ||
          environment.files[0] ||
          null
        : null;
    const displayState =
        environment?.display && typeof environment.display === "object"
            ? environment.display
            : null;
    const displayUrl = displayState?.enabled ? displayState?.url || null : null;
    const hasLiveDisplay = Boolean(displayUrl);

    const shortEnvironmentId = useMemo(() => {
        if (!environmentId) {
            return "unknown";
        }

        return environmentId.slice(0, 8);
    }, [environmentId]);

    const displayedName = environment?.name || environmentName;

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        document.title = displayedName || "Environment";
    }, [displayedName]);

    const collaboratorEntries = useMemo(() => {
        const onlineUsers = Array.isArray(environment?.onlineUsers)
            ? environment.onlineUsers
            : [];
        const selfId = environment?.userId;

        return onlineUsers
            .filter((entry) => entry?.id && entry.id !== selfId)
            .map((entry) => ({
                id: entry.id,
                userName: entry.userName || "User",
            }));
    }, [environment?.onlineUsers, environment?.userId]);
    const followedCollaborator = useMemo(() => {
        if (!followStudentId) {
            return null;
        }

        return (
            collaboratorEntries.find((entry) => entry.id === followStudentId) || null
        );
    }, [collaboratorEntries, followStudentId]);
    const classHref = useMemo(() => {
        const classId = environment?.access?.classId;
        if (!classId) {
            return null;
        }

        return `/classroom?classId=${encodeURIComponent(classId)}`;
    }, [environment?.access?.classId]);
    const safeReturnTo = useMemo(() => {
        const returnTo = searchParams.get("returnTo");
        if (!returnTo) {
            return null;
        }

        const normalized = returnTo.trim();
        return normalized.startsWith("/") ? normalized : null;
    }, [searchParams]);
    const backLabel = safeReturnTo
        ? "Back"
        : classHref
          ? "Back to class"
          : "Back home";
    const assignmentTestCases = useMemo(() => {
        const cases = environment?.access?.testCases;
        return Array.isArray(cases) ? cases : [];
    }, [environment?.access?.testCases]);
    const canRequestHelp = Boolean(
        isAssignmentEnvironment && isStudentViewer && environment?.access?.assignmentId,
    );
    const fontSizePx =
        accessibility.fontSize === "sm"
            ? 13
            : accessibility.fontSize === "lg"
              ? 17
              : 15;
    const canResetToTemplate = Boolean(environment?.access?.canResetToTemplate);
    const canStudentSubmit = Boolean(
        canUpdateSubmissionStatus && isStudentViewer && isAssignmentEnvironment,
    );
    const canTeacherReviewSubmission = Boolean(
        canUpdateSubmissionStatus &&
            environment?.access?.viewerRole === "teacher" &&
            isAssignmentEnvironment,
    );
    const isSubmittedAssignment = submissionStatus === "submitted";
    const commandActions = [
        {
            id: "run",
            label: isRunning
                ? isStopButtonArmed
                    ? "Kill program"
                    : "Kill program (arming...)"
                : "Run program",
            shortcut: "Cmd/Ctrl + Enter",
            disabled: isRunning
                ? !isReady || isMetaLoading || !isStopButtonArmed
                : !isReady || isMetaLoading || isReadOnlyEnvironment,
            action: () => (isRunning ? stopProgram() : runProgram()),
        },
        {
            id: "share",
            label: "Copy share URL",
            shortcut: "Cmd/Ctrl + Shift + S",
            disabled: false,
            action: () => handleCopyShareUrl(),
        },
        {
            id: "focus",
            label: isFocusMode ? "Exit focus mode" : "Enter focus mode",
            shortcut: "Cmd/Ctrl + Shift + F",
            disabled: false,
            action: () => setIsFocusMode((prev) => !prev),
        },
        {
            id: "console",
            label: showConsole ? "Hide console" : "Show console",
            shortcut: "Cmd/Ctrl + Shift + C",
            disabled: false,
            action: () => setShowConsole((prev) => !prev),
        },
        ...(assignmentTestCases.length > 0
            ? [
                  {
                      id: "run-tests",
                      label: "Run assignment tests",
                      shortcut: "Cmd/Ctrl + Shift + T",
                      disabled: isRunningTests || isMetaLoading,
                      action: () => handleRunAssignmentTests(),
                  },
              ]
            : []),
        {
            id: "accessibility",
            label: "Accessibility settings",
            shortcut: "Cmd/Ctrl + Shift + A",
            disabled: false,
            action: () => setIsAccessibilityOpen(true),
        },
        ...(isAssignmentEnvironment
            ? [
                  {
                      id: "reset-template",
                      label: "Reset to template",
                      shortcut: "Cmd/Ctrl + Shift + R",
                      disabled: !canResetToTemplate || isResettingTemplate,
                      action: () => requestResetToTemplate(),
                  },
              ]
            : []),
    ];

    function requestResetToTemplate() {
        if (!canResetToTemplate || !environmentId || isResettingTemplate) {
            return;
        }
        setIsResetConfirmOpen(true);
    }

    const handleBackNavigation = useCallback(() => {
        if (safeReturnTo) {
            router.push(safeReturnTo);
            return;
        }

        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
        }

        if (classHref) {
            router.push(classHref);
            return;
        }

        router.push("/");
    }, [classHref, router, safeReturnTo]);

    useEffect(() => {
        const nextFollowValue = searchParams.get("followStudent") || "";
        setFollowStudentId(nextFollowValue.trim());
    }, [searchParams]);

    useEffect(() => {
        setEnvironment((prev) => ({
            ...prev,
            followMode: {
                enabled: Boolean(followStudentId),
                studentId: followStudentId || null,
            },
        }));
    }, [followStudentId, setEnvironment]);

    function runProgram() {
        if (
            isRunning ||
            isReadOnlyEnvironment ||
            !environment?.ws ||
            environment.ws.readyState !== 1 ||
            !Array.isArray(environment?.files)
        ) {
            return;
        }

        setEnvironment((prev) => ({
            ...prev,
            console: "",
            isRunning: true,
            display: {
                enabled: false,
                status: "starting",
                url: null,
                viewPath: null,
                novncAssetPath: null,
                websockifyPath: null,
                browserToken: null,
                browserTokenExpiresAt: null,
                reason: null,
            },
            runFeedback: {
                status: "starting",
                startedAt: Date.now(),
                endedAt: null,
                durationMs: null,
                exitCode: null,
                helper: null,
            },
        }));

        environment.ws.send(
            JSON.stringify({
                type: "runProgram",
                data: environment.files,
            }),
        );

        setIsRunning(true);

        if (environment.consoleRef && environment.consoleRef.current) {
            setTimeout(() => {
                environment.consoleRef.current.focus();
            }, 50);
        }
    }

    function stopProgram() {
        if (!isRunning || !environment?.ws || environment.ws.readyState !== 1) {
            return;
        }

        setEnvironment((prev) => ({
            ...prev,
            display: {
                enabled: false,
                status: "stopping",
                url: null,
                viewPath: null,
                novncAssetPath: null,
                websockifyPath: null,
                browserToken: null,
                browserTokenExpiresAt: null,
                reason: null,
            },
            runFeedback: {
                status: "stopping",
                startedAt: prev?.runFeedback?.startedAt || Date.now(),
                endedAt: null,
                durationMs: null,
                exitCode: null,
                helper: null,
            },
        }));

        environment.ws.send(
            JSON.stringify({
                type: "killProgram",
            }),
        );
    }

    async function handleCopyShareUrl() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setInfoMessage("Share URL copied to clipboard.");
        } catch {
            setInfoMessage("Could not copy URL from this browser context.");
        }
    }

    function updateEnvironmentAccess(patch) {
        setEnvironment((prev) => ({
            ...prev,
            access: {
                ...(prev?.access || {}),
                ...patch,
            },
        }));
    }

    function jumpToFeedbackComment(comment) {
        const files = Array.isArray(environment?.files) ? environment.files : [];
        const targetFile =
            files.find((file) => file?.name === comment?.fileName) || null;
        if (!targetFile) {
            return;
        }

        setEnvironment((prev) => ({
            ...prev,
            currentFile: targetFile.id,
            editorJump: {
                line: Number(comment?.lineNumber) || 1,
                column: 1,
                at: `${targetFile.id}:${comment?.lineNumber || 1}:${Date.now()}`,
            },
        }));
    }

    async function handleRunAssignmentTests() {
        if (!environmentId || !assignmentTestCases.length) {
            return;
        }

        setIsRunningTests(true);
        setMetadataError("");
        setInfoMessage("");

        try {
            const payload = await environmentApiClient.runAssignmentTests(
                environmentId,
                {
                    files: Array.isArray(environment?.files) ? environment.files : [],
                },
            );
            const summary = payload?.summary || {};
            updateEnvironmentAccess({
                latestTestRun: payload,
                submissionStatus:
                    submissionStatus === "not_started"
                        ? "in_progress"
                        : submissionStatus,
            });
            setInfoMessage(
                `Tests complete: ${summary.passed || 0}/${summary.total || 0} passed.`,
            );
        } catch (error) {
            setMetadataError(error?.message || "Could not run assignment tests.");
        } finally {
            setIsRunningTests(false);
        }
    }

    async function handleUpdateSubmissionStatus(nextStatus) {
        if (!environmentId || !canUpdateSubmissionStatus) {
            return;
        }

        setIsSubmissionUpdating(true);
        setMetadataError("");
        setInfoMessage("");

        try {
            const payload = await environmentApiClient.updateAssignmentSubmission(
                environmentId,
                { status: nextStatus },
            );
            const submission = payload?.submission || null;
            updateEnvironmentAccess({
                submissionStatus:
                    submission?.submissionStatus || nextStatus || submissionStatus,
                submissionUpdatedAt: submission?.submissionUpdatedAt || null,
                submittedAt: submission?.submittedAt || null,
                reviewedAt: submission?.reviewedAt || null,
                latestTestRun:
                    submission?.latestTestRun || environment?.access?.latestTestRun,
            });
            setEnvironment((prev) => ({
                ...prev,
                permissions: {
                    ...(prev?.permissions || {}),
                    readOnlyEnvironment: Boolean(
                        isStudentViewer &&
                            (submission?.submissionStatus || nextStatus) ===
                                "submitted",
                    ),
                },
            }));
            setInfoMessage(
                nextStatus === "submitted"
                    ? "Assignment marked as done."
                    : nextStatus === "needs_changes"
                      ? "Marked as needs changes."
                      : nextStatus === "in_progress" && submissionStatus === "submitted"
                        ? "Done mark removed."
                        : "Submission status updated.",
            );
        } catch (error) {
            setMetadataError(error?.message || "Could not update submission status.");
        } finally {
            setIsSubmissionUpdating(false);
        }
    }

    async function handleCreateTeacherComment() {
        if (!environmentId || !canManageTeacherComments) {
            return;
        }

        setIsSavingFeedback(true);
        setMetadataError("");
        setInfoMessage("");

        try {
            const payload = await environmentApiClient.createTeacherFeedbackComment(
                environmentId,
                {
                    fileName: feedbackDraft.fileName,
                    lineNumber: Number(feedbackDraft.lineNumber),
                    content: feedbackDraft.content,
                },
            );
            const comments = Array.isArray(payload?.comments) ? payload.comments : [];
            updateEnvironmentAccess({ teacherComments: comments });
            setInfoMessage("Teacher comment added.");
            setIsFeedbackDialogOpen(false);
            setFeedbackDraft({
                fileName: currentFile?.name || "",
                lineNumber: "",
                content: "",
            });
        } catch (error) {
            setMetadataError(error?.message || "Could not save comment.");
        } finally {
            setIsSavingFeedback(false);
        }
    }

    async function handleSubmitHelpRequest() {
        if (!canRequestHelp || !environmentId) {
            return;
        }

        setIsSendingHelp(true);
        setMetadataError("");
        setInfoMessage("");

        try {
            const payload = await classroomApiClient.requestHelp({
                environmentId,
                message: helpMessage,
            });
            const alreadyOpen = Boolean(payload?.alreadyOpen);
            setIsHelpDialogOpen(false);
            setHelpMessage("");
            setInfoMessage(
                alreadyOpen
                    ? "Updated your open help request."
                    : "Help request sent to your teacher.",
            );
        } catch (error) {
            setMetadataError(error?.message || "Could not send help request.");
        } finally {
            setIsSendingHelp(false);
        }
    }

    async function handleResetToTemplate() {
        if (!canResetToTemplate || !environmentId) {
            return;
        }

        setIsResettingTemplate(true);
        setMetadataError("");

        try {
            const payload =
                await environmentApiClient.resetEnvironmentToTemplate(environmentId);
            const files = Array.isArray(payload?.files) ? payload.files : [];

            setEnvironment((prev) => {
                const nextCurrentFile =
                    files.find((file) => file.id === prev.currentFile)?.id ||
                    files[0]?.id ||
                    prev.currentFile ||
                    null;

                if (prev.ws?.readyState === 1) {
                    prev.ws.send(
                        JSON.stringify({
                            type: "fileUpdate",
                            data: {
                                fileId: nextCurrentFile,
                                changes: [],
                                files,
                                userId: prev.userId,
                            },
                        }),
                    );
                }

                return {
                    ...prev,
                    files,
                    currentFile: nextCurrentFile,
                    console: "",
                };
            });

            setInfoMessage("Environment reset to assignment template.");
        } catch (error) {
            setMetadataError(error?.message || "Could not reset from template.");
        } finally {
            setIsResettingTemplate(false);
        }
    }

    useEffect(() => {
        if (environment.isRunning !== undefined) {
            setIsRunning(environment.isRunning);
        }
    }, [environment.isRunning]);

    useEffect(() => {
        if (!hasLiveDisplay) {
            setIsDisplayDialogOpen(false);
        }
    }, [hasLiveDisplay]);

    useEffect(() => {
        if (!isDisplayDialogOpen) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setIsDisplayDialogOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isDisplayDialogOpen]);

    useEffect(() => {
        if (!isDisplayDialogOpen || !displayUrl) {
            return undefined;
        }

        const focusDisplayFrame = () => {
            const frame = displayModalFrameRef.current;
            if (!frame) {
                return;
            }

            frame.focus();

            try {
                frame.contentWindow?.focus();
            } catch {}
        };

        const timeoutId = window.setTimeout(focusDisplayFrame, 80);
        return () => window.clearTimeout(timeoutId);
    }, [displayUrl, isDisplayDialogOpen]);

    useEffect(() => {
        if (stopButtonArmTimeoutRef.current) {
            clearTimeout(stopButtonArmTimeoutRef.current);
            stopButtonArmTimeoutRef.current = null;
        }

        if (!isRunning) {
            setIsStopButtonArmed(false);
            return;
        }

        setIsStopButtonArmed(false);
        stopButtonArmTimeoutRef.current = setTimeout(() => {
            setIsStopButtonArmed(true);
            stopButtonArmTimeoutRef.current = null;
        }, STOP_BUTTON_ARM_DELAY_MS);

        return () => {
            if (stopButtonArmTimeoutRef.current) {
                clearTimeout(stopButtonArmTimeoutRef.current);
                stopButtonArmTimeoutRef.current = null;
            }
        };
    }, [isRunning]);

    useEffect(() => {
        let cancelled = false;

        const fallbackName = environmentId
            ? `Environment ${environmentId.slice(0, 8)}`
            : "Environment";

        if (!environmentId) {
            setEnvironmentName("Environment");
            setMetadataError("Missing environment ID.");
            setIsMetaLoading(false);
            return () => {
                cancelled = true;
            };
        }

        const loadEnvironmentMetadata = async () => {
            setIsMetaLoading(true);
            setMetadataError("");

            try {
                const payload =
                    await environmentApiClient.getEnvironmentById(environmentId);
                if (cancelled) {
                    return;
                }

                const loadedName = payload?.environment?.name || fallbackName;
                const viewer = payload?.viewer || null;
                setEnvironmentName(loadedName);
                setEnvironment((prev) => ({
                    ...prev,
                    id: environmentId,
                    name: loadedName,
                    viewerName: viewer?.username || prev.viewerName || "User",
                    userId: viewer?.id || prev.userId,
                    permissions: {
                        readOnlyInstructions: Boolean(
                            payload?.access?.instructionsReadOnly,
                        ),
                        readOnlyEnvironment: Boolean(
                            payload?.access?.environmentReadOnly,
                        ),
                    },
                    access: payload?.access || null,
                }));
            } catch (error) {
                if (cancelled) {
                    return;
                }

                setEnvironmentName(fallbackName);

                if (error instanceof ApiError && error.status === 404) {
                    setMetadataError(
                        "Environment not found or inaccessible for your account.",
                    );
                } else if (error instanceof ApiError && error.status === 401) {
                    setMetadataError("Please sign in again to access this environment.");
                } else {
                    setMetadataError("Could not load environment metadata.");
                }
            } finally {
                if (!cancelled) {
                    setIsMetaLoading(false);
                }
            }
        };

        loadEnvironmentMetadata();

        return () => {
            cancelled = true;
        };
    }, [environmentId, setEnvironment]);

    useEffect(() => {
        hasSeededInstructionsRef.current = false;
    }, [environmentId]);

    useEffect(() => {
        try {
            window.localStorage.setItem(
                ACCESSIBILITY_STORAGE_KEY,
                JSON.stringify(accessibility),
            );
        } catch {
            // Ignore storage errors in restricted browser contexts.
        }
    }, [accessibility]);

    useEffect(() => {
        if (!isFeedbackDialogOpen) {
            return;
        }

        setFeedbackDraft((previous) => ({
            ...previous,
            fileName: previous.fileName || currentFile?.name || "",
            lineNumber: previous.lineNumber || "",
        }));
    }, [currentFile?.name, isFeedbackDialogOpen]);

    useEffect(() => {
        const shouldSeedInstructions = searchParams.get("seedInstructions") === "1";
        if (
            !shouldSeedInstructions ||
            hasSeededInstructionsRef.current ||
            !isReady ||
            isReadOnlyEnvironment
        ) {
            return;
        }

        const files = Array.isArray(environment?.files) ? environment.files : [];
        if (files.length === 0) {
            return;
        }

        const existingInstructions = files.find(
            (file) => (file?.name || "").toLowerCase() === "instructions.md",
        );
        if (existingInstructions) {
            hasSeededInstructionsRef.current = true;
            setEnvironment((prev) => ({ ...prev, currentFile: existingInstructions.id }));
            return;
        }

        const instructionsFileId = crypto.randomUUID();
        const seededFiles = [
            ...files,
            {
                id: instructionsFileId,
                name: "INSTRUCTIONS.md",
                content: "# Instructions\n\nWrite assignment instructions here.",
            },
        ];

        if (environment?.ws?.readyState === 1) {
            environment.ws.send(
                JSON.stringify({
                    type: "fileUpdate",
                    data: {
                        fileId: instructionsFileId,
                        changes: [],
                        files: seededFiles,
                        userId: environment.userId,
                    },
                }),
            );
        }

        setEnvironment((prev) => ({
            ...prev,
            files: seededFiles,
            currentFile: instructionsFileId,
        }));
        hasSeededInstructionsRef.current = true;
    }, [
        environment,
        isReadOnlyEnvironment,
        isReady,
        searchParams,
        setEnvironment,
    ]);

    useEffect(() => {
        if (!isAssignmentEnvironment || !isStudentViewer) {
            return;
        }

        setEnvironment((prev) => {
            const files = Array.isArray(prev?.files) ? prev.files : [];
            const hasInstructions = files.some((file) =>
                isInstructionsFile(file?.name),
            );

            if (hasInstructions) {
                return prev;
            }

            const syntheticInstructionsFile = {
                id: VIRTUAL_INSTRUCTIONS_FILE_ID,
                name: "INSTRUCTIONS.md",
                content: "",
                isVirtualInstructions: true,
            };

            const nextFiles = [...files, syntheticInstructionsFile];
            const nextCurrentFile = prev.currentFile || VIRTUAL_INSTRUCTIONS_FILE_ID;

            return {
                ...prev,
                files: nextFiles,
                currentFile: nextCurrentFile,
            };
        });
    }, [isAssignmentEnvironment, isStudentViewer, setEnvironment, environment?.files]);

    useEffect(() => {
        if (!metadataError && !infoMessage) {
            return;
        }

        const timeoutId = setTimeout(() => {
            setMetadataError("");
            setInfoMessage("");
        }, 3500);

        return () => clearTimeout(timeoutId);
    }, [metadataError, infoMessage]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            const isMac = navigator.platform.toUpperCase().includes("MAC");
            const modKey = isMac ? event.metaKey : event.ctrlKey;

            if (!modKey) return;

            const key = event.key.toLowerCase();
            if (key === "enter") {
                event.preventDefault();
                runProgram();
                return;
            }

            if (event.shiftKey && key === "f") {
                event.preventDefault();
                setIsFocusMode((prev) => !prev);
                return;
            }

            if (event.shiftKey && key === "c") {
                event.preventDefault();
                setShowConsole((prev) => !prev);
                return;
            }

            if (event.shiftKey && key === "s") {
                event.preventDefault();
                handleCopyShareUrl();
                return;
            }

            if (event.shiftKey && key === "t") {
                event.preventDefault();
                handleRunAssignmentTests();
                return;
            }

            if (event.shiftKey && key === "a") {
                event.preventDefault();
                setIsAccessibilityOpen(true);
                return;
            }

            if (event.shiftKey && key === "r") {
                event.preventDefault();
                requestResetToTemplate();
                return;
            }

            if (key === "k") {
                event.preventDefault();
                setIsCommandPaletteOpen(true);
                return;
            }

        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    });

    return (
        <div
            className={cn(
                "h-screen bg-zinc-950 text-zinc-100",
                accessibility.highContrast ? "contrast-125" : "",
                accessibility.reduceMotion ? "[&_*]:transition-none" : "",
            )}
            style={{
                fontFamily: accessibility.readableFont
                    ? "Verdana, Geneva, Tahoma, sans-serif"
                    : undefined,
            }}
        >
            <main className="mx-auto flex h-full w-full max-w-[1680px] flex-col px-3 py-3 md:px-4">
                <header className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 md:px-4">
                        <div className="flex min-w-0 items-center gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-zinc-300 hover:bg-zinc-800"
                                onClick={handleBackNavigation}
                            >
                                <ArrowLeft className="size-4" />
                                {backLabel}
                            </Button>

                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-100">
                                    {displayedName}
                                </p>
                                <p className="text-xs text-zinc-500">
                                    #{shortEnvironmentId}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 text-xs text-zinc-400">
                                <span
                                    className={`size-1.5 rounded-full ${
                                        isReady
                                            ? "bg-emerald-400"
                                            : cn("bg-amber-300", accessibility.reduceMotion ? "" : "animate-pulse")
                                    }`}
                                />
                                {isReady ? "Connected" : "Connecting"}
                            </span>

                            <div className="flex items-center gap-0.5">
                                <Button
                                    onClick={handleCopyShareUrl}
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-zinc-500 hover:text-zinc-100"
                                    title="Copy share URL (⌘⇧S)"
                                >
                                    <Copy className="size-4" />
                                </Button>
                                <Button
                                    onClick={() => setIsFocusMode((prev) => !prev)}
                                    size="icon-sm"
                                    variant="ghost"
                                    className={isFocusMode ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-100"}
                                    title={isFocusMode ? "Exit focus mode (⌘⇧F)" : "Focus mode (⌘⇧F)"}
                                >
                                    <Focus className="size-4" />
                                </Button>
                                <Button
                                    onClick={() => setShowConsole((prev) => !prev)}
                                    size="icon-sm"
                                    variant="ghost"
                                    className={showConsole ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-100"}
                                    title={showConsole ? "Hide console (⌘⇧C)" : "Show console (⌘⇧C)"}
                                >
                                    <SquareTerminal className="size-4" />
                                </Button>
                                <Button
                                    onClick={() => setIsAccessibilityOpen(true)}
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-zinc-500 hover:text-zinc-100"
                                    title="Accessibility settings (⌘⇧A)"
                                >
                                    <SlidersHorizontal className="size-4" />
                                </Button>
                                {hasLiveDisplay ? (
                                    <Button
                                        onClick={() =>
                                            setIsDisplayDialogOpen(true)
                                        }
                                        size="icon-sm"
                                        variant="ghost"
                                        className="text-zinc-500 hover:text-zinc-100"
                                        title="Open live display"
                                    >
                                        <ArrowUpRight className="size-4" />
                                    </Button>
                                ) : null}
                            </div>

                            {(assignmentTestCases.length > 0 || canRequestHelp || isAssignmentEnvironment) && (
                                <div className="mx-0.5 h-4 w-px bg-zinc-700" />
                            )}

                            {assignmentTestCases.length > 0 ? (
                                <Button
                                    onClick={handleRunAssignmentTests}
                                    disabled={isRunningTests}
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                >
                                    {isRunningTests ? (
                                        <LoaderCircle
                                            className={`size-3.5 ${
                                                accessibility.reduceMotion
                                                    ? ""
                                                    : "animate-spin"
                                            }`}
                                        />
                                    ) : null}
                                    Run tests
                                </Button>
                            ) : null}
                            {canRequestHelp ? (
                                <Button
                                    onClick={() => setIsHelpDialogOpen(true)}
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                >
                                    Need help
                                </Button>
                            ) : null}
                            {isAssignmentEnvironment ? (
                                <Button
                                    onClick={requestResetToTemplate}
                                    disabled={
                                        !canResetToTemplate ||
                                        isResettingTemplate
                                    }
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-zinc-500 hover:text-zinc-100"
                                    title="Reset to template (⌘⇧R)"
                                >
                                    {isResettingTemplate ? (
                                        <LoaderCircle
                                            className={`size-4 ${
                                                accessibility.reduceMotion
                                                    ? ""
                                                    : "animate-spin"
                                            }`}
                                        />
                                    ) : (
                                        <RotateCcw className="size-4" />
                                    )}
                                </Button>
                            ) : null}

                            <Button
                                onClick={isRunning ? stopProgram : runProgram}
                                disabled={
                                    isRunning
                                        ? !isReady || isMetaLoading || !isStopButtonArmed
                                        : !isReady ||
                                          isMetaLoading ||
                                          isReadOnlyEnvironment
                                }
                                size="sm"
                                className={cn(
                                    "h-8 font-medium",
                                    isRunning
                                        ? isStopButtonArmed
                                            ? "bg-red-500 hover:bg-red-600 text-white border-transparent"
                                            : "bg-zinc-800 text-zinc-400 border-transparent cursor-wait"
                                        : "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent",
                                )}
                            >
                                {isRunning ? (
                                    <>
                                        {isStopButtonArmed ? (
                                            <Square className="size-3.5" />
                                        ) : (
                                            <LoaderCircle
                                                className={`size-3.5 ${
                                                    accessibility.reduceMotion
                                                        ? ""
                                                        : "animate-spin"
                                                }`}
                                            />
                                        )}
                                        {isStopButtonArmed ? "Kill" : "Starting..."}
                                    </>
                                ) : (
                                    <>
                                        <CirclePlay className="size-3.5" />
                                        Run
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {!isFocusMode ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 px-4 py-1.5 text-xs text-zinc-500">
                            <span className="text-zinc-600">Online:</span>
                            {collaboratorEntries.length > 0 ? (
                                collaboratorEntries.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        onClick={() =>
                                            setFollowStudentId(entry.id)
                                        }
                                        className="rounded border border-zinc-700/80 bg-zinc-800/60 px-2 py-0.5 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                                    >
                                        {entry.userName}
                                    </button>
                                ))
                            ) : (
                                <span className="text-zinc-600">
                                    just you
                                </span>
                            )}
                            {followStudentId ? (
                                <span className="ml-2 inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-zinc-200">
                                    <LocateFixed className="size-3" />
                                    Following{" "}
                                    {followedCollaborator?.userName ||
                                        "student"}
                                </span>
                            ) : null}
                            {followStudentId ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
                                    onClick={() => setFollowStudentId("")}
                                >
                                    Stop
                                </Button>
                            ) : null}
                            {isReadOnlyEnvironment ? (
                                <span className="ml-auto rounded border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-amber-300">
                                    View-only
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </header>

                {isAssignmentEnvironment && !isFocusMode ? (
                    <section className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 md:p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-sm font-medium text-zinc-100">
                                        Assignment progress
                                    </h2>
                                    <span
                                        className={`rounded border px-2 py-0.5 text-xs ${submissionStatusModel.toneClass}`}
                                    >
                                        {submissionStatusModel.label}
                                    </span>
                                </div>
                                <p className="mt-1 text-sm text-zinc-400">
                                    {environment?.access?.assignmentTitle ||
                                        "Assignment environment"}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                                    {formatDateTime(environment?.access?.submittedAt) ? (
                                        <span>
                                            Submitted{" "}
                                            {formatDateTime(
                                                environment?.access?.submittedAt,
                                            )}
                                        </span>
                                    ) : null}
                                    {formatDateTime(latestTestRun?.ranAt) ? (
                                        <span>
                                            Last tests{" "}
                                            {formatDateTime(latestTestRun.ranAt)}
                                        </span>
                                    ) : null}
                                    <span>
                                        {latestTestRun?.summary?.passed || 0}/
                                        {latestTestRun?.summary?.total || 0} tests
                                        passed
                                    </span>
                                    <span>
                                        {teacherComments.length} teacher comment
                                        {teacherComments.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {canManageTeacherComments ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8"
                                        onClick={() => setIsFeedbackDialogOpen(true)}
                                    >
                                        Add comment
                                    </Button>
                                ) : null}
                                {canTeacherReviewSubmission ? (
                                    <>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8"
                                            disabled={
                                                isSubmissionUpdating ||
                                                submissionStatus === "in_progress"
                                            }
                                            onClick={() =>
                                                handleUpdateSubmissionStatus(
                                                    "in_progress",
                                                )
                                            }
                                        >
                                            {submissionStatus === "in_progress"
                                                ? "In progress"
                                                : "Mark in progress"}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8"
                                            disabled={isSubmissionUpdating}
                                            onClick={() =>
                                                handleUpdateSubmissionStatus(
                                                    "needs_changes",
                                                )
                                            }
                                        >
                                            Needs changes
                                        </Button>
                                    </>
                                ) : null}
                                {canStudentSubmit ? (
                                    <>
                                        {!isSubmittedAssignment ? (
                                            <>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8"
                                                    disabled={
                                                        isSubmissionUpdating ||
                                                        submissionStatus ===
                                                            "in_progress"
                                                    }
                                                    onClick={() =>
                                                        handleUpdateSubmissionStatus(
                                                            "in_progress",
                                                        )
                                                    }
                                                >
                                                    {submissionStatus ===
                                                    "in_progress"
                                                        ? "In progress"
                                                        : "Mark in progress"}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-8 bg-zinc-100 text-zinc-900 hover:bg-white"
                                                    disabled={isSubmissionUpdating}
                                                    onClick={() =>
                                                        handleUpdateSubmissionStatus(
                                                            "submitted",
                                                        )
                                                    }
                                                >
                                                    Mark as done
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-8"
                                                disabled={isSubmissionUpdating}
                                                onClick={() =>
                                                    handleUpdateSubmissionStatus(
                                                        "in_progress",
                                                    )
                                                }
                                            >
                                                Undo mark as done
                                            </Button>
                                        )}
                                    </>
                                ) : null}
                            </div>
                        </div>

                        {latestTestRun?.results?.length > 0 ? (
                            <div className="mt-4 rounded border border-zinc-800 bg-zinc-950/50">
                                <div className="border-b border-zinc-800 px-3 py-2">
                                    <p className="text-xs font-medium text-zinc-300">
                                        Latest test results
                                    </p>
                                </div>
                                <div className="divide-y divide-zinc-800">
                                    {latestTestRun.results.map((result, index) => (
                                        <div
                                            key={result.id || `result-${index}`}
                                            className="px-3 py-3"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-sm font-medium text-zinc-100">
                                                    {result.name || `Test ${index + 1}`}
                                                </p>
                                                <span
                                                    className={`rounded border px-2 py-0.5 text-xs ${
                                                        result.passed
                                                            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                                            : "border-red-400/30 bg-red-500/10 text-red-200"
                                                    }`}
                                                >
                                                    {result.passed ? "Passed" : "Failed"}
                                                </span>
                                            </div>
                                            <div className="mt-2 grid gap-2 text-xs text-zinc-400 md:grid-cols-2">
                                                <div className="rounded border border-zinc-800 bg-zinc-900/70 p-2">
                                                    <p className="mb-1 text-zinc-500">
                                                        Expected output
                                                    </p>
                                                    <pre className="overflow-x-auto whitespace-pre-wrap text-zinc-200">
                                                        {result.expectedOutput || "(empty)"}
                                                    </pre>
                                                </div>
                                                <div className="rounded border border-zinc-800 bg-zinc-900/70 p-2">
                                                    <p className="mb-1 text-zinc-500">
                                                        Actual output
                                                    </p>
                                                    <pre className="overflow-x-auto whitespace-pre-wrap text-zinc-200">
                                                        {result.actualOutput || "(empty)"}
                                                    </pre>
                                                </div>
                                            </div>
                                            {result.runtimeError ? (
                                                <p className="mt-2 text-xs text-red-300">
                                                    {result.runtimeError}
                                                </p>
                                            ) : null}
                                            {Number.isFinite(result.line) ? (
                                                <button
                                                    type="button"
                                                    className="mt-2 text-xs text-sky-300 underline decoration-dotted underline-offset-2"
                                                    onClick={() =>
                                                        setEnvironment((prev) => ({
                                                            ...prev,
                                                            editorJump: {
                                                                line: result.line,
                                                                column: 1,
                                                                at: `test-${result.id}-${Date.now()}`,
                                                            },
                                                        }))
                                                    }
                                                >
                                                    Jump to line {result.line}
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {teacherComments.length > 0 ? (
                            <div className="mt-4 rounded border border-zinc-800 bg-zinc-950/50">
                                <div className="border-b border-zinc-800 px-3 py-2">
                                    <p className="text-xs font-medium text-zinc-300">
                                        Teacher feedback
                                    </p>
                                </div>
                                <div className="divide-y divide-zinc-800">
                                    {teacherComments.map((comment) => (
                                        <button
                                            key={comment.id}
                                            type="button"
                                            className="flex w-full flex-wrap items-start justify-between gap-3 px-3 py-3 text-left hover:bg-zinc-900/70"
                                            onClick={() =>
                                                jumpToFeedbackComment(comment)
                                            }
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm text-zinc-100">
                                                    {comment.content}
                                                </p>
                                                <p className="mt-1 text-xs text-zinc-500">
                                                    {comment.fileName}: line{" "}
                                                    {comment.lineNumber} ·{" "}
                                                    {comment.teacherUsername}
                                                </p>
                                            </div>
                                            <span className="text-xs text-sky-300">
                                                Open
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </section>
                ) : null}

                {isReady ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-3">
                        <div
                            className={cn(
                                "min-h-0 flex-1 gap-3",
                                isFocusMode
                                    ? "grid grid-cols-1"
                                    : "grid lg:grid-cols-[260px_minmax(0,1fr)]",
                            )}
                        >
                            {!isFocusMode && (
                                <aside className="min-h-0 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 py-2">
                                    <div className="mb-1 flex items-center justify-between px-3 py-1">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Files</span>
                                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs tabular-nums text-zinc-500">
                                            {environment?.files?.length || 0}
                                        </span>
                                    </div>
                                    <div className="px-1">
                                        <FileManager />
                                    </div>
                                </aside>
                            )}

                            <section className="min-h-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                                <div className="grid h-full grid-cols-8 grid-rows-12">
                                    <FileViewer
                                        className={
                                            hasLiveDisplay
                                                ? showConsole
                                                    ? "col-span-8 row-span-7"
                                                    : "col-span-8 row-span-8"
                                                : showConsole
                                                  ? "col-span-8 row-span-7"
                                                  : "col-span-8 row-span-12"
                                        }
                                        editorFontSize={fontSizePx}
                                        highContrast={accessibility.highContrast}
                                        reducedMotion={accessibility.reduceMotion}
                                    />
                                    {hasLiveDisplay && showConsole ? (
                                        <div className="col-span-8 row-span-5 grid min-h-0 grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] overflow-hidden">
                                            <ProgramDisplayPanel
                                                className="min-h-0 border-t-0 border-r border-zinc-800"
                                                displayUrl={displayUrl}
                                                onPopOut={() =>
                                                    setIsDisplayDialogOpen(true)
                                                }
                                            />
                                            <Console
                                                className="min-h-0 border-t-0 border-l border-zinc-800"
                                                fontSize={fontSizePx}
                                                highContrast={accessibility.highContrast}
                                                reducedMotion={accessibility.reduceMotion}
                                            />
                                        </div>
                                    ) : null}
                                    {hasLiveDisplay && !showConsole ? (
                                        <ProgramDisplayPanel
                                            className="col-span-8 row-span-4 border-t-0"
                                            displayUrl={displayUrl}
                                            onPopOut={() =>
                                                setIsDisplayDialogOpen(true)
                                            }
                                        />
                                    ) : null}
                                    {!hasLiveDisplay && showConsole ? (
                                        <Console
                                            className="col-span-8 row-span-5"
                                            fontSize={fontSizePx}
                                            highContrast={accessibility.highContrast}
                                            reducedMotion={accessibility.reduceMotion}
                                        />
                                    ) : null}
                                </div>
                            </section>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-8 py-10 text-center">
                            <LoaderCircle
                                className={`mx-auto size-7 text-zinc-300 ${
                                    accessibility.reduceMotion ? "" : "animate-spin"
                                }`}
                            />
                            <p className="mt-3 text-sm text-zinc-300">
                                Connecting to {displayedName}...
                            </p>
                        </div>
                    </div>
                )}

                <Dialog
                    open={isCommandPaletteOpen}
                    onOpenChange={setIsCommandPaletteOpen}
                >
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Command palette</DialogTitle>
                            <DialogDescription>
                                Keyboard-first actions for faster workflow.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                            {commandActions.map((command) => (
                                <button
                                    key={command.id}
                                    type="button"
                                    disabled={command.disabled}
                                    onClick={() => {
                                        command.action();
                                        setIsCommandPaletteOpen(false);
                                    }}
                                    className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span>{command.label}</span>
                                    <span className="text-xs text-zinc-500">
                                        {command.shortcut}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>

                {isDisplayDialogOpen ? (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm md:p-5"
                        onClick={() => setIsDisplayDialogOpen(false)}
                    >
                        <div
                            className="flex h-[94vh] w-[99vw] flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50 md:w-[97vw]"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-5 py-4">
                                <div className="min-w-0">
                                    <p className="text-base font-semibold text-zinc-100">
                                        Live display
                                    </p>
                                    <p className="text-sm text-zinc-500">
                                        Interactive graphical output from the current
                                        Python session.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    className="shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                                    onClick={() => setIsDisplayDialogOpen(false)}
                                >
                                    <X className="size-4" />
                                </Button>
                            </div>

                            <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,_rgba(63,63,70,0.18),_transparent_55%),linear-gradient(180deg,_#09090b_0%,_#050505_100%)] p-2 md:p-4">
                                <div className="h-full w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-inner shadow-black/60">
                                    {displayUrl ? (
                                        <iframe
                                            ref={displayModalFrameRef}
                                            title="Program display modal"
                                            src={displayUrl}
                                            className="h-full w-full bg-black"
                                            onLoad={() => {
                                                const frame =
                                                    displayModalFrameRef.current;
                                                if (!frame) {
                                                    return;
                                                }

                                                frame.focus();

                                                try {
                                                    frame.contentWindow?.focus();
                                                } catch {}
                                            }}
                                        />
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                <Dialog
                    open={isResetConfirmOpen}
                    onOpenChange={(open) => {
                        if (!isResettingTemplate) {
                            setIsResetConfirmOpen(open);
                        }
                    }}
                >
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Reset environment?</DialogTitle>
                            <DialogDescription>
                                This replaces your current files with the
                                assignment template version.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsResetConfirmOpen(false)}
                                disabled={isResettingTemplate}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-red-600 text-white hover:bg-red-700"
                                disabled={isResettingTemplate}
                                onClick={async () => {
                                    await handleResetToTemplate();
                                    setIsResetConfirmOpen(false);
                                }}
                            >
                                {isResettingTemplate ? (
                                    <>
                                        <LoaderCircle
                                            className={`size-4 ${
                                                accessibility.reduceMotion
                                                    ? ""
                                                    : "animate-spin"
                                            }`}
                                        />
                                        Resetting
                                    </>
                                ) : (
                                    "Reset"
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={isHelpDialogOpen}
                    onOpenChange={(open) => {
                        if (!isSendingHelp) {
                            setIsHelpDialogOpen(open);
                        }
                    }}
                >
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Request teacher help</DialogTitle>
                            <DialogDescription>
                                Send a short message to your teacher. They can follow your environment live.
                            </DialogDescription>
                        </DialogHeader>
                        <Textarea
                            placeholder="What are you stuck on? (optional)"
                            value={helpMessage}
                            onChange={(event) => setHelpMessage(event.target.value)}
                            maxLength={1000}
                            className="min-h-28"
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isSendingHelp}
                                onClick={() => setIsHelpDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                disabled={isSendingHelp}
                                className="bg-zinc-100 text-zinc-900 hover:bg-white"
                                onClick={handleSubmitHelpRequest}
                            >
                                {isSendingHelp ? (
                                    <>
                                        <LoaderCircle
                                            className={`size-4 ${
                                                accessibility.reduceMotion
                                                    ? ""
                                                    : "animate-spin"
                                            }`}
                                        />
                                        Sending
                                    </>
                                ) : (
                                    "Send help request"
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={isFeedbackDialogOpen}
                    onOpenChange={(open) => {
                        if (!isSavingFeedback) {
                            setIsFeedbackDialogOpen(open);
                        }
                    }}
                >
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Add teacher comment</DialogTitle>
                            <DialogDescription>
                                Anchor feedback to a file and line so the student
                                can jump straight to it.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="mb-1 block text-xs text-zinc-400">
                                    File
                                </label>
                                <select
                                    value={feedbackDraft.fileName}
                                    onChange={(event) =>
                                        setFeedbackDraft((previous) => ({
                                            ...previous,
                                            fileName: event.target.value,
                                        }))
                                    }
                                    className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                                >
                                    <option value="">Select a file</option>
                                    {(environment?.files || []).map((file) => (
                                        <option key={file.id} value={file.name}>
                                            {file.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-zinc-400">
                                    Line number
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={feedbackDraft.lineNumber}
                                    onChange={(event) =>
                                        setFeedbackDraft((previous) => ({
                                            ...previous,
                                            lineNumber: event.target.value,
                                        }))
                                    }
                                    className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-zinc-400">
                                    Comment
                                </label>
                                <Textarea
                                    value={feedbackDraft.content}
                                    onChange={(event) =>
                                        setFeedbackDraft((previous) => ({
                                            ...previous,
                                            content: event.target.value,
                                        }))
                                    }
                                    maxLength={2000}
                                    className="min-h-28"
                                    placeholder="Explain what to fix and why."
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isSavingFeedback}
                                onClick={() => setIsFeedbackDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                disabled={isSavingFeedback}
                                className="bg-zinc-100 text-zinc-900 hover:bg-white"
                                onClick={handleCreateTeacherComment}
                            >
                                {isSavingFeedback ? (
                                    <>
                                        <LoaderCircle
                                            className={`size-4 ${
                                                accessibility.reduceMotion
                                                    ? ""
                                                    : "animate-spin"
                                            }`}
                                        />
                                        Saving
                                    </>
                                ) : (
                                    "Save comment"
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={isAccessibilityOpen}
                    onOpenChange={setIsAccessibilityOpen}
                >
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Accessibility settings</DialogTitle>
                            <DialogDescription>
                                Adjust the editor and console for readability.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="mb-1 block text-xs text-zinc-400">
                                    Font size
                                </label>
                                <select
                                    value={accessibility.fontSize}
                                    onChange={(event) =>
                                        setAccessibility((previous) => ({
                                            ...previous,
                                            fontSize: event.target.value,
                                        }))
                                    }
                                    className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                                >
                                    <option value="sm">Small</option>
                                    <option value="md">Medium</option>
                                    <option value="lg">Large</option>
                                </select>
                            </div>
                            <label className="flex items-center justify-between rounded border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
                                High contrast
                                <input
                                    type="checkbox"
                                    checked={accessibility.highContrast}
                                    onChange={(event) =>
                                        setAccessibility((previous) => ({
                                            ...previous,
                                            highContrast: event.target.checked,
                                        }))
                                    }
                                />
                            </label>
                            <label className="flex items-center justify-between rounded border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
                                Reduce motion
                                <input
                                    type="checkbox"
                                    checked={accessibility.reduceMotion}
                                    onChange={(event) =>
                                        setAccessibility((previous) => ({
                                            ...previous,
                                            reduceMotion: event.target.checked,
                                        }))
                                    }
                                />
                            </label>
                            <label className="flex items-center justify-between rounded border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
                                Readable interface font
                                <input
                                    type="checkbox"
                                    checked={accessibility.readableFont}
                                    onChange={(event) =>
                                        setAccessibility((previous) => ({
                                            ...previous,
                                            readableFont: event.target.checked,
                                        }))
                                    }
                                />
                            </label>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAccessibility(DEFAULT_ACCESSIBILITY)}
                            >
                                Reset defaults
                            </Button>
                            <Button
                                type="button"
                                className="bg-zinc-100 text-zinc-900 hover:bg-white"
                                onClick={() => setIsAccessibilityOpen(false)}
                            >
                                Done
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2">
                    {metadataError && (
                        <p className="pointer-events-auto rounded-md border border-red-400/30 bg-zinc-900 px-3 py-2 text-sm text-red-300 shadow-lg shadow-black/40">
                            {metadataError}
                        </p>
                    )}
                    {infoMessage && (
                        <p className="pointer-events-auto rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 shadow-lg shadow-black/40">
                            {infoMessage}
                        </p>
                    )}
                </div>
            </main>
        </div>
    );
}

function cn(...classes) {
    return classes.filter(Boolean).join(" ");
}

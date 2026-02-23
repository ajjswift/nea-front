"use client";

import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useParams, useSearchParams } from "next/navigation";
import { FileManager } from "@/components/files/FileManager";
import { FileViewer } from "@/components/files/FileViewer";
import { Console } from "@/components/files/Console";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    CirclePlay,
    Copy,
    Focus,
    LoaderCircle,
    LocateFixed,
    RotateCcw,
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
const DEFAULT_ACCESSIBILITY = {
    fontSize: "md",
    highContrast: false,
    reduceMotion: false,
    readableFont: false,
};

function isInstructionsFile(fileName) {
    return (fileName || "").toLowerCase() === "instructions.md";
}

export default function EnvironmentPage() {
    const params = useParams();
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
    const [isResettingTemplate, setIsResettingTemplate] = useState(false);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isRunningTests, setIsRunningTests] = useState(false);
    const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
    const [helpMessage, setHelpMessage] = useState("");
    const [isSendingHelp, setIsSendingHelp] = useState(false);
    const [isAccessibilityOpen, setIsAccessibilityOpen] = useState(false);
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
    const [clockTick, setClockTick] = useState(Date.now());
    const hasSeededInstructionsRef = useRef(false);
    const isReady = environment?.ws?.readyState === 1;
    const isReadOnlyEnvironment = Boolean(
        environment?.permissions?.readOnlyEnvironment,
    );
    const isAssignmentEnvironment = Boolean(
        environment?.access?.isAssignmentEnvironment,
    );
    const isStudentViewer = environment?.access?.viewerRole === "student";

    const shortEnvironmentId = useMemo(() => {
        if (!environmentId) {
            return "unknown";
        }

        return environmentId.slice(0, 8);
    }, [environmentId]);

    const backHref = "/";
    const backLabel = "Back home";

    const displayedName = environment?.name || environmentName;

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

    const syncInfo = useMemo(() => {
        const sync = environment?.sync || {};
        const pendingCount = Number.isFinite(sync.pendingCount)
            ? sync.pendingCount
            : 0;
        const conflictAt = Number.isFinite(sync.conflictAt) ? sync.conflictAt : null;
        const lastSavedAt = Number.isFinite(sync.lastSavedAt)
            ? sync.lastSavedAt
            : null;

        let statusLabel = "Saved";
        let statusTone = "text-zinc-300";
        if (!isReady || sync.status === "offline") {
            statusLabel = "Offline";
            statusTone = "text-amber-200";
        } else if (pendingCount > 0 || sync.status === "saving") {
            statusLabel = "Saving...";
            statusTone = "text-amber-200";
        } else if (lastSavedAt) {
            const elapsedSeconds = Math.max(
                0,
                Math.floor((clockTick - lastSavedAt) / 1000),
            );
            if (elapsedSeconds < 5) {
                statusLabel = "Saved just now";
            } else if (elapsedSeconds < 60) {
                statusLabel = `Saved ${elapsedSeconds}s ago`;
            } else {
                const elapsedMinutes = Math.floor(elapsedSeconds / 60);
                statusLabel = `Saved ${elapsedMinutes}m ago`;
            }
            statusTone = "text-emerald-200";
        }

        const hasRecentConflict =
            Boolean(conflictAt) && clockTick - conflictAt < 8000;

        return {
            statusLabel,
            statusTone,
            hasRecentConflict,
        };
    }, [clockTick, environment?.sync, isReady]);

    const canResetToTemplate = Boolean(environment?.access?.canResetToTemplate);
    const commandActions = [
        {
            id: "run",
            label: "Run program",
            shortcut: "Cmd/Ctrl + Enter",
            disabled: !isReady || isRunning || isMetaLoading || isReadOnlyEnvironment,
            action: () => runProgram(),
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
            isReadOnlyEnvironment ||
            !environment?.ws ||
            !Array.isArray(environment?.files)
        ) {
            return;
        }

        setEnvironment((prev) => ({
            ...prev,
            console: "",
            isRunning: true,
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

    async function handleCopyShareUrl() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setInfoMessage("Share URL copied to clipboard.");
        } catch {
            setInfoMessage("Could not copy URL from this browser context.");
        }
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
            setInfoMessage(
                `Tests complete: ${summary.passed || 0}/${summary.total || 0} passed.`,
            );
        } catch (error) {
            setMetadataError(error?.message || "Could not run assignment tests.");
        } finally {
            setIsRunningTests(false);
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
        const intervalId = setInterval(() => {
            setClockTick(Date.now());
        }, 1000);

        return () => clearInterval(intervalId);
    }, []);

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
                                asChild
                                size="sm"
                                variant="ghost"
                                className="text-zinc-300 hover:bg-zinc-800"
                            >
                                <Link href={backHref}>
                                    <ArrowLeft className="size-4" />
                                    {backLabel}
                                </Link>
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

                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-700 px-3 text-xs text-zinc-300">
                                <span
                                    className={`size-1.5 rounded-full ${
                                        isReady
                                            ? "bg-emerald-400"
                                            : "bg-amber-300"
                                    }`}
                                />
                                {isReady ? "Connected" : "Connecting"}
                            </span>
                            <span
                                className={`inline-flex h-8 items-center rounded-md border border-zinc-700 px-3 text-xs ${syncInfo.statusTone}`}
                            >
                                {syncInfo.statusLabel}
                            </span>
                            {syncInfo.hasRecentConflict ? (
                                <span className="inline-flex h-8 items-center rounded-md border border-amber-400/40 bg-amber-500/20 px-3 text-xs text-amber-100">
                                    Concurrent edits merged
                                </span>
                            ) : null}
                            <Button
                                onClick={handleCopyShareUrl}
                                size="sm"
                                variant="outline"
                                className="h-8"
                            >
                                <Copy className="size-4" />
                                Share
                            </Button>
                            <Button
                                onClick={() => setIsFocusMode((prev) => !prev)}
                                size="sm"
                                variant="outline"
                                className="h-8"
                            >
                                <Focus className="size-4" />
                                {isFocusMode ? "Exit focus" : "Focus"}
                            </Button>
                            <Button
                                onClick={() => setShowConsole((prev) => !prev)}
                                size="sm"
                                variant="outline"
                                className="h-8"
                            >
                                <SquareTerminal className="size-4" />
                                {showConsole ? "Hide console" : "Show console"}
                            </Button>
                            <Button
                                onClick={() => setIsAccessibilityOpen(true)}
                                size="sm"
                                variant="outline"
                                className="h-8"
                            >
                                Accessibility
                            </Button>
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
                                            className={`size-4 ${
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
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
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
                                    Reset
                                </Button>
                            ) : null}
                            <Button
                                onClick={runProgram}
                                disabled={
                                    !isReady ||
                                    isRunning ||
                                    isMetaLoading ||
                                    isReadOnlyEnvironment
                                }
                                size="sm"
                                className="h-8 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                            >
                                {isRunning ? (
                                    <>
                                        <LoaderCircle
                                            className={`size-4 ${
                                                accessibility.reduceMotion
                                                    ? ""
                                                    : "animate-spin"
                                            }`}
                                        />
                                        Running
                                    </>
                                ) : (
                                    <>
                                        <CirclePlay className="size-4" />
                                        Run
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {!isFocusMode ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400">
                            <span>Collaborators:</span>
                            {collaboratorEntries.length > 0 ? (
                                collaboratorEntries.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        onClick={() =>
                                            setFollowStudentId(entry.id)
                                        }
                                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-zinc-200"
                                    >
                                        {entry.userName}
                                    </button>
                                ))
                            ) : (
                                <span className="text-zinc-500">
                                    Just you right now
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
                                <span className="ml-auto rounded border border-amber-400/40 bg-amber-600 px-2 py-0.5 text-amber-50">
                                    View-only mode
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </header>

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
                                <aside className="min-h-0 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                                    <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                                        <span>Files</span>
                                        <span>
                                            {environment?.files?.length || 0}
                                        </span>
                                    </div>
                                    <FileManager />
                                </aside>
                            )}

                            <section className="min-h-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                                <div className="grid h-full grid-cols-8 grid-rows-12">
                                    <FileViewer
                                        className={
                                            showConsole
                                                ? "col-span-8 row-span-7"
                                                : "col-span-8 row-span-12"
                                        }
                                        editorFontSize={fontSizePx}
                                        highContrast={accessibility.highContrast}
                                        reducedMotion={accessibility.reduceMotion}
                                    />
                                    {showConsole && (
                                        <Console
                                            className="col-span-8 row-span-5"
                                            fontSize={fontSizePx}
                                            highContrast={accessibility.highContrast}
                                            reducedMotion={accessibility.reduceMotion}
                                        />
                                    )}
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
                                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
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
                                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                onClick={() => setIsAccessibilityOpen(false)}
                            >
                                Done
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2">
                    {metadataError && (
                        <p className="pointer-events-auto rounded-md border border-red-400/70 bg-red-700 px-3 py-2 text-sm text-red-50 shadow-lg">
                            {metadataError}
                        </p>
                    )}
                    {infoMessage && (
                        <p className="pointer-events-auto rounded-md border border-emerald-400/70 bg-emerald-700 px-3 py-2 text-sm text-emerald-50 shadow-lg">
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

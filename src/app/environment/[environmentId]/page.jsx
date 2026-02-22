"use client";

import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useParams, useSearchParams } from "next/navigation";
import { FileManager } from "@/components/files/FileManager";
import { FileViewer } from "@/components/files/FileViewer";
import { Console } from "@/components/files/Console";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CirclePlay, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    ApiError,
    EnvironmentApiClient,
} from "@/lib/environments/EnvironmentApiClient";

const environmentApiClient = new EnvironmentApiClient();

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
    const hasSeededInstructionsRef = useRef(false);
    const isReady = environment?.ws?.readyState === 1;

    const shortEnvironmentId = useMemo(() => {
        if (!environmentId) {
            return "unknown";
        }

        return environmentId.slice(0, 8);
    }, [environmentId]);

    const backHref = useMemo(() => {
        const requestedReturn = searchParams.get("returnTo");
        if (!requestedReturn || !requestedReturn.startsWith("/")) {
            return "/";
        }

        return requestedReturn;
    }, [searchParams]);

    const backLabel = backHref.startsWith("/classroom")
        ? "Back to classroom"
        : "Back";

    const displayedName = environment?.name || environmentName;

    const runProgram = () => {
        if (!environment?.ws || !Array.isArray(environment?.files)) {
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
    };

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
                setEnvironmentName(loadedName);
                setEnvironment((prev) => ({
                    ...prev,
                    id: environmentId,
                    name: loadedName,
                    permissions: {
                        readOnlyInstructions: Boolean(
                            payload?.access?.instructionsReadOnly,
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
        const shouldSeedInstructions = searchParams.get("seedInstructions") === "1";
        if (!shouldSeedInstructions || hasSeededInstructionsRef.current || !isReady) {
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
    }, [environment, isReady, searchParams, setEnvironment]);

    return (
        <div className="h-screen bg-zinc-950 text-zinc-100">
            <main className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-3 py-3 md:px-4">
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
                                        isReady ? "bg-emerald-400" : "bg-amber-300"
                                    }`}
                                />
                                {isReady ? "Connected" : "Connecting"}
                            </span>
                            <Button
                                onClick={runProgram}
                                disabled={!isReady || isRunning || isMetaLoading}
                                size="sm"
                                className="h-8 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                            >
                                {isRunning ? (
                                    <>
                                        <LoaderCircle className="size-4 animate-spin" />
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

                    {metadataError && (
                        <p className="border-t border-zinc-800 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                            {metadataError}
                        </p>
                    )}
                </header>

                {isReady ? (
                    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
                        <aside className="min-h-0 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                            <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                                <span>Files</span>
                                <span>{environment?.files?.length || 0}</span>
                            </div>
                            <FileManager />
                        </aside>

                        <section className="min-h-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                            <div className="grid h-full grid-cols-8 grid-rows-12">
                                <FileViewer />
                                <Console />
                            </div>
                        </section>
                    </div>
                ) : (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-8 py-10 text-center">
                            <LoaderCircle className="mx-auto size-7 animate-spin text-zinc-300" />
                            <p className="mt-3 text-sm text-zinc-300">
                                Connecting to {displayedName}...
                            </p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

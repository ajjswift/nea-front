"use client";

import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatRunDuration(durationMs) {
    if (!Number.isFinite(durationMs)) {
        return "n/a";
    }
    if (durationMs < 1000) {
        return `${durationMs} ms`;
    }
    return `${(durationMs / 1000).toFixed(2)} s`;
}

export function Console({ className = "col-span-8 row-span-5" }) {
    const { environment, setEnvironment } = useEnvironment();
    const outputRef = useRef(null);
    const inputRef = useRef(null);
    const runFeedback = environment?.runFeedback || null;
    const helper = runFeedback?.helper || null;
    const isReadOnlyEnvironment = Boolean(
        environment?.permissions?.readOnlyEnvironment,
    );
    const canSendInput = Boolean(environment.isRunning && !isReadOnlyEnvironment);

    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [environment.console]);

    useEffect(() => {
        setEnvironment((prev) => ({
            ...prev,
            consoleRef: inputRef,
        }));
    }, [setEnvironment]);

    const handleSubmit = (e) => {
        e.preventDefault();

        const input = environment.consoleInput ?? "";

        if (!environment.ws || environment.ws.readyState !== 1 || !canSendInput) {
            return;
        }

        setEnvironment((prev) => ({
            ...prev,
            consoleInput: "", // clear input after submit
        }));

        // Send input to the WebSocket
        environment.ws.send(
            JSON.stringify({
                type: "stdin",
                data: input + "\n",
            }),
        );
    };

    const handleConsoleChange = (e) => {
        setEnvironment((prev) => ({
            ...prev,
            consoleInput: e.target.value,
        }));
    };

    const handleKeyDown = (e) => {
        // Allow Ctrl+C to send interrupt signal
        if (e.ctrlKey && e.key === "c") {
            e.preventDefault();

            if (environment.ws && environment.isRunning && !isReadOnlyEnvironment) {
                environment.ws.send(
                    JSON.stringify({
                        type: "stop",
                        data: "",
                    }),
                );
            }
        }
    };

    const handleJumpToError = () => {
        if (!Number.isFinite(helper?.line)) {
            return;
        }

        setEnvironment((prev) => ({
            ...prev,
            editorJump: {
                line: helper.line,
                column: 1,
                at: Date.now(),
                source: "runtime",
            },
        }));
    };

    return (
        <div className={cn("bg-black border-t-2 border-zinc-800 flex flex-col", className)}>
            {/* Console Header */}
            <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-300">
                    Console
                </span>
                {environment.isRunning && (
                    <span className="text-xs text-green-500 animate-pulse">
                        ● Running
                    </span>
                )}
            </div>

            {runFeedback && (
                <div className="border-b border-zinc-800 bg-zinc-950/70 px-4 py-2 text-xs text-zinc-400">
                    <div className="flex flex-wrap items-center gap-3">
                        <span>Status: {runFeedback.status || "idle"}</span>
                        <span>Duration: {formatRunDuration(runFeedback.durationMs)}</span>
                        {runFeedback.exitCode !== null &&
                        runFeedback.exitCode !== undefined ? (
                            <span>Exit: {runFeedback.exitCode}</span>
                        ) : null}
                    </div>
                    {helper ? (
                        <div className="mt-2 rounded border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-amber-100">
                            <p className="font-medium">{helper.title}</p>
                            <p className="mt-1 text-amber-100/90">{helper.explanation}</p>
                            <p className="mt-1 text-amber-100/90">
                                Try this: {helper.suggestion}
                                {Number.isFinite(helper.line)
                                    ? ` (check line ${helper.line})`
                                    : ""}
                            </p>
                            {Number.isFinite(helper.line) ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="mt-2 h-7 border-amber-200/40 bg-amber-50/10 text-amber-50 hover:bg-amber-50/20"
                                    onClick={handleJumpToError}
                                >
                                    Jump to line {helper.line}
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            )}

            {/* Output Area */}
            <div
                ref={outputRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm text-zinc-300 whitespace-pre-wrap break-words"
                style={{
                    fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                }}
            >
                {environment.console ||
                    "No output yet. Run your program to see output here."}
            </div>

            {/* Input Area */}
            <form
                onSubmit={handleSubmit}
                className="border-t border-zinc-800 bg-zinc-950 flex items-center"
            >
                <span className="px-4 text-zinc-400 font-mono">$</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={environment.consoleInput ?? ""}
                    onChange={handleConsoleChange}
                    onKeyDown={handleKeyDown}
                    disabled={!canSendInput}
                    placeholder={
                        canSendInput
                            ? "Type input and press Enter..."
                            : isReadOnlyEnvironment
                              ? "View-only environment"
                              : "Run a program to enable input"
                    }
                    className="flex-1 bg-transparent px-2 py-3 text-zinc-400 font-mono outline-none disabled:text-zinc-600 disabled:cursor-not-allowed"
                    style={{
                        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                    }}
                />
            </form>
        </div>
    );
}

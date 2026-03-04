"use client";

import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

const VIRTUAL_OVERSCAN_LINES = 80;
const AUTO_SCROLL_THRESHOLD_PX = 24;
const AUTO_SCROLL_TOP_THRESHOLD_PX = 24;
const SEGMENT_MAX_LINES = 200_000;
const SEGMENT_SHIFT_LINES = 50_000;
const LARGE_LOG_TOP_JUMP_THRESHOLD = 25_000;
const CONSOLE_HORIZONTAL_PADDING_PX = 32;
const MONOSPACE_CHAR_WIDTH_RATIO = 0.62;

function wrapLogicalLine(line, maxCharsPerLine) {
    const value = typeof line === "string" ? line : `${line ?? ""}`;
    if (maxCharsPerLine <= 0 || value.length <= maxCharsPerLine) {
        return [value];
    }

    const wrapped = [];
    for (let index = 0; index < value.length; index += maxCharsPerLine) {
        wrapped.push(value.slice(index, index + maxCharsPerLine));
    }
    return wrapped;
}

function wrapLogicalLineToRows(line, maxCharsPerLine, logicalIndex) {
    const chunks = wrapLogicalLine(line, maxCharsPerLine);
    return chunks.map((chunk, chunkIndex) => ({
        text: chunk,
        logicalIndex,
        isLogicalStart: chunkIndex === 0,
    }));
}

function wrapAllLogicalLinesToRows(lines, maxCharsPerLine) {
    if (!Array.isArray(lines) || lines.length === 0) {
        return [];
    }

    const wrappedRows = [];
    for (let logicalIndex = 0; logicalIndex < lines.length; logicalIndex += 1) {
        wrappedRows.push(
            ...wrapLogicalLineToRows(
                lines[logicalIndex],
                maxCharsPerLine,
                logicalIndex,
            ),
        );
    }
    return wrappedRows;
}

function getWrappedLineCount(line, maxCharsPerLine) {
    return wrapLogicalLine(line, maxCharsPerLine).length;
}

function formatRunDuration(durationMs) {
    if (!Number.isFinite(durationMs)) {
        return "n/a";
    }
    if (durationMs < 1000) {
        return `${durationMs} ms`;
    }
    return `${(durationMs / 1000).toFixed(2)} s`;
}

export function Console({
    className = "col-span-8 row-span-5",
    fontSize = 14,
    reducedMotion = false,
    highContrast = false,
}) {
    const { environment, setEnvironment } = useEnvironment();
    const outputRef = useRef(null);
    const inputRef = useRef(null);
    const previousConsoleRef = useRef("");
    const logicalLinesRef = useRef([]);
    const wrappedTailCountRef = useRef(1);
    const lastWrapColumnsRef = useRef(0);
    const shouldStickToBottomRef = useRef(true);
    const shiftingSegmentRef = useRef(false);
    const segmentStartLineRef = useRef(0);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [isAtTop, setIsAtTop] = useState(true);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [segmentStartLine, setSegmentStartLine] = useState(0);
    const [consoleRows, setConsoleRows] = useState([]);
    const runFeedback = environment?.runFeedback || null;
    const helper = runFeedback?.helper || null;
    const isReadOnlyEnvironment = Boolean(
        environment?.permissions?.readOnlyEnvironment,
    );
    const canSendInput = Boolean(environment.isRunning && !isReadOnlyEnvironment);
    const normalizedFontSize = Math.max(12, Number(fontSize) || 14);
    const lineHeightPx = Math.max(18, Math.round(normalizedFontSize * 1.45));
    const logicalLineDigitsEstimate = Math.max(
        2,
        `${Math.max(1, logicalLinesRef.current.length)}`.length,
    );
    const reservedGutterChars = logicalLineDigitsEstimate + 2;
    const maxCharsPerVisualLine = Math.max(
        20,
        Math.floor(
            Math.max(0, viewportWidth - CONSOLE_HORIZONTAL_PADDING_PX) /
                Math.max(1, normalizedFontSize * MONOSPACE_CHAR_WIDTH_RATIO),
        ) - reservedGutterChars,
    );
    const consoleText = environment.console || "";

    useEffect(() => {
        const previousConsole = previousConsoleRef.current;
        const wrapColumnsChanged =
            lastWrapColumnsRef.current !== maxCharsPerVisualLine;
        const shouldRebuildAll =
            wrapColumnsChanged ||
            !previousConsole ||
            !consoleText.startsWith(previousConsole);

        if (!consoleText) {
            previousConsoleRef.current = "";
            logicalLinesRef.current = [];
            wrappedTailCountRef.current = 1;
            lastWrapColumnsRef.current = maxCharsPerVisualLine;
            setConsoleRows([]);
            return;
        }

        if (shouldRebuildAll) {
            const rebuiltLogicalLines = consoleText.split("\n");
            previousConsoleRef.current = consoleText;
            logicalLinesRef.current = rebuiltLogicalLines;
            wrappedTailCountRef.current = getWrappedLineCount(
                rebuiltLogicalLines[rebuiltLogicalLines.length - 1] ?? "",
                maxCharsPerVisualLine,
            );
            lastWrapColumnsRef.current = maxCharsPerVisualLine;
            setConsoleRows(
                wrapAllLogicalLinesToRows(
                    rebuiltLogicalLines,
                    maxCharsPerVisualLine,
                ),
            );
            return;
        }

        const appendedChunk = consoleText.slice(previousConsole.length);
        if (!appendedChunk) {
            return;
        }

        previousConsoleRef.current = consoleText;
        lastWrapColumnsRef.current = maxCharsPerVisualLine;

        const appendedParts = appendedChunk.split("\n");
        const nextLogicalLines =
            logicalLinesRef.current.length > 0 ? [...logicalLinesRef.current] : [""];
        const lastLogicalIndex = nextLogicalLines.length - 1;

        nextLogicalLines[lastLogicalIndex] =
            `${nextLogicalLines[lastLogicalIndex] ?? ""}${appendedParts[0] ?? ""}`;

        for (let index = 1; index < appendedParts.length; index += 1) {
            nextLogicalLines.push(appendedParts[index] ?? "");
        }

        logicalLinesRef.current = nextLogicalLines;

        setConsoleRows((prevWrappedRows) => {
            if (prevWrappedRows.length === 0) {
                return wrapAllLogicalLinesToRows(
                    nextLogicalLines,
                    maxCharsPerVisualLine,
                );
            }

            const nextWrappedRows = [...prevWrappedRows];
            const previousTailCount = Math.max(1, wrappedTailCountRef.current || 1);
            if (nextWrappedRows.length >= previousTailCount) {
                nextWrappedRows.splice(
                    nextWrappedRows.length - previousTailCount,
                    previousTailCount,
                );
            } else {
                nextWrappedRows.length = 0;
            }

            const firstUpdatedLogicalIndex =
                nextLogicalLines.length - appendedParts.length;
            for (
                let logicalIndex = firstUpdatedLogicalIndex;
                logicalIndex < nextLogicalLines.length;
                logicalIndex += 1
            ) {
                const wrapped = wrapLogicalLineToRows(
                    nextLogicalLines[logicalIndex],
                    maxCharsPerVisualLine,
                    logicalIndex,
                );
                nextWrappedRows.push(...wrapped);
            }

            wrappedTailCountRef.current = getWrappedLineCount(
                nextLogicalLines[nextLogicalLines.length - 1] ?? "",
                maxCharsPerVisualLine,
            );

            return nextWrappedRows;
        });
    }, [consoleText, maxCharsPerVisualLine]);
    const totalRowCount = consoleRows.length;
    const totalLogicalLineCount = logicalLinesRef.current.length;
    const lineNumberDigits = Math.max(
        2,
        `${Math.max(1, totalLogicalLineCount)}`.length,
    );
    const segmentEndLine = Math.min(
        totalRowCount,
        segmentStartLine + SEGMENT_MAX_LINES,
    );
    const maxSegmentStartLine = Math.max(0, totalRowCount - SEGMENT_MAX_LINES);
    const segmentEdgeThresholdPx = lineHeightPx * (VIRTUAL_OVERSCAN_LINES / 2);
    const firstVisibleLine =
        segmentStartLine + Math.floor(scrollTop / lineHeightPx);
    const lastVisibleLine =
        segmentStartLine + Math.ceil((scrollTop + viewportHeight) / lineHeightPx);
    const visibleStart = Math.max(
        segmentStartLine,
        firstVisibleLine - VIRTUAL_OVERSCAN_LINES,
    );
    const visibleEnd = Math.min(
        segmentEndLine,
        lastVisibleLine + VIRTUAL_OVERSCAN_LINES,
    );
    const visibleRows = consoleRows.slice(visibleStart, visibleEnd);
    const topSpacerHeight = (visibleStart - segmentStartLine) * lineHeightPx;
    const bottomSpacerHeight = Math.max(
        0,
        (segmentEndLine - visibleEnd) * lineHeightPx,
    );
    const currentVisibleLogicalLine = visibleRows[0]?.logicalIndex;
    const currentLineIndicator = totalLogicalLineCount
        ? Math.min(
              totalLogicalLineCount,
              Math.max(
                  1,
                  (Number.isFinite(currentVisibleLogicalLine)
                      ? currentVisibleLogicalLine
                      : 0) + 1,
              ),
          )
        : 0;
    const showJumpToTop =
        totalLogicalLineCount >= LARGE_LOG_TOP_JUMP_THRESHOLD && !isAtTop;

    const isElementAtTop = useCallback(
        (element, segmentStart = segmentStartLineRef.current) => {
            return (
                segmentStart === 0 &&
                element.scrollTop <= AUTO_SCROLL_TOP_THRESHOLD_PX
            );
        },
        [],
    );

    const isElementAtBottom = useCallback(
        (element, segmentStart = segmentStartLineRef.current) => {
            const localAtBottom =
                element.scrollHeight - (element.scrollTop + element.clientHeight) <=
                AUTO_SCROLL_THRESHOLD_PX;
            const segmentEnd = Math.min(
                totalRowCount,
                segmentStart + SEGMENT_MAX_LINES,
            );
            return localAtBottom && segmentEnd >= totalRowCount;
        },
        [totalRowCount],
    );

    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (outputRef.current) {
            if (shouldStickToBottomRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
            }
            const atTop = isElementAtTop(outputRef.current);
            const atBottom = isElementAtBottom(outputRef.current);
            setIsAtTop(atTop);
            shouldStickToBottomRef.current = atBottom;
            setIsAtBottom(atBottom);
            setScrollTop(outputRef.current.scrollTop);
        }
    }, [environment.console, isElementAtBottom, isElementAtTop]);

    useEffect(() => {
        segmentStartLineRef.current = segmentStartLine;
    }, [segmentStartLine]);

    useEffect(() => {
        setSegmentStartLine((prevStart) => {
            if (totalRowCount === 0) {
                return 0;
            }

            if (shouldStickToBottomRef.current) {
                return maxSegmentStartLine;
            }

            return Math.min(prevStart, maxSegmentStartLine);
        });
    }, [maxSegmentStartLine, totalRowCount]);

    useEffect(() => {
        if (!outputRef.current) {
            return undefined;
        }

        const element = outputRef.current;
        const updateViewport = () => {
            setViewportHeight(element.clientHeight);
            setViewportWidth(element.clientWidth);
            setScrollTop(element.scrollTop);
            const atTop = isElementAtTop(element);
            const atBottom = isElementAtBottom(element);
            setIsAtTop(atTop);
            shouldStickToBottomRef.current = atBottom;
            setIsAtBottom(atBottom);
        };

        updateViewport();

        if (typeof ResizeObserver === "undefined") {
            return undefined;
        }

        const observer = new ResizeObserver(() => {
            updateViewport();
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [isElementAtBottom, isElementAtTop]);

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

    const handleOutputScroll = useCallback((event) => {
        if (shiftingSegmentRef.current) {
            return;
        }

        const element = event.currentTarget;
        const atTop = isElementAtTop(element);
        const atBottom = isElementAtBottom(element);
        setIsAtTop(atTop);
        shouldStickToBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
        setScrollTop(element.scrollTop);

        const currentSegmentStart = segmentStartLineRef.current;
        const currentSegmentEnd = Math.min(
            totalRowCount,
            currentSegmentStart + SEGMENT_MAX_LINES,
        );

        if (
            currentSegmentStart > 0 &&
            element.scrollTop <= segmentEdgeThresholdPx
        ) {
            const shiftLines = Math.min(SEGMENT_SHIFT_LINES, currentSegmentStart);
            const nextSegmentStart = currentSegmentStart - shiftLines;
            const nextScrollTop = element.scrollTop + shiftLines * lineHeightPx;

            shiftingSegmentRef.current = true;
            segmentStartLineRef.current = nextSegmentStart;
            setSegmentStartLine(nextSegmentStart);

            requestAnimationFrame(() => {
                if (outputRef.current) {
                    outputRef.current.scrollTop = nextScrollTop;
                    setScrollTop(nextScrollTop);
                    const shiftedAtTop = isElementAtTop(
                        outputRef.current,
                        nextSegmentStart,
                    );
                    const shiftedAtBottom = isElementAtBottom(
                        outputRef.current,
                        nextSegmentStart,
                    );
                    setIsAtTop(shiftedAtTop);
                    shouldStickToBottomRef.current = shiftedAtBottom;
                    setIsAtBottom(shiftedAtBottom);
                }
                shiftingSegmentRef.current = false;
            });
            return;
        }

        if (
            currentSegmentEnd < totalRowCount &&
            element.scrollTop + element.clientHeight >=
                element.scrollHeight - segmentEdgeThresholdPx
        ) {
            const shiftLines = Math.min(
                SEGMENT_SHIFT_LINES,
                totalRowCount - currentSegmentEnd,
            );
            const nextSegmentStart = currentSegmentStart + shiftLines;
            const nextScrollTop = Math.max(
                0,
                element.scrollTop - shiftLines * lineHeightPx,
            );

            shiftingSegmentRef.current = true;
            segmentStartLineRef.current = nextSegmentStart;
            setSegmentStartLine(nextSegmentStart);

            requestAnimationFrame(() => {
                if (outputRef.current) {
                    outputRef.current.scrollTop = nextScrollTop;
                    setScrollTop(nextScrollTop);
                    const shiftedAtTop = isElementAtTop(
                        outputRef.current,
                        nextSegmentStart,
                    );
                    const shiftedAtBottom = isElementAtBottom(
                        outputRef.current,
                        nextSegmentStart,
                    );
                    setIsAtTop(shiftedAtTop);
                    shouldStickToBottomRef.current = shiftedAtBottom;
                    setIsAtBottom(shiftedAtBottom);
                }
                shiftingSegmentRef.current = false;
            });
        }
    }, [
        isElementAtBottom,
        isElementAtTop,
        lineHeightPx,
        segmentEdgeThresholdPx,
        totalRowCount,
    ]);

    const handleJumpToBottom = useCallback(() => {
        if (!outputRef.current) {
            return;
        }

        const nextSegmentStart = Math.max(0, totalRowCount - SEGMENT_MAX_LINES);
        segmentStartLineRef.current = nextSegmentStart;
        setSegmentStartLine(nextSegmentStart);

        const element = outputRef.current;
        shouldStickToBottomRef.current = true;
        requestAnimationFrame(() => {
            if (!outputRef.current) {
                return;
            }

            outputRef.current.scrollTop = outputRef.current.scrollHeight;
            const atTop = isElementAtTop(outputRef.current, nextSegmentStart);
            const atBottom = isElementAtBottom(outputRef.current);
            setIsAtTop(atTop);
            shouldStickToBottomRef.current = atBottom;
            setIsAtBottom(atBottom);
            setScrollTop(outputRef.current.scrollTop);
        });
    }, [isElementAtBottom, isElementAtTop, totalRowCount]);

    const handleJumpToTop = useCallback(() => {
        if (!outputRef.current) {
            return;
        }

        const nextSegmentStart = 0;
        segmentStartLineRef.current = nextSegmentStart;
        setSegmentStartLine(nextSegmentStart);
        shouldStickToBottomRef.current = false;

        requestAnimationFrame(() => {
            if (!outputRef.current) {
                return;
            }

            outputRef.current.scrollTop = 0;
            const atTop = isElementAtTop(outputRef.current, nextSegmentStart);
            const atBottom = isElementAtBottom(outputRef.current, nextSegmentStart);
            setIsAtTop(atTop);
            setIsAtBottom(atBottom);
            setScrollTop(0);
        });
    }, [isElementAtBottom, isElementAtTop]);

    return (
        <div
            className={cn(
                "bg-black border-t-2 border-zinc-800 flex flex-col",
                highContrast ? "contrast-125" : "",
                className,
            )}
        >
            {/* Console Header */}
            <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-300">
                    Console
                </span>
                {environment.isRunning && (
                    <span
                        className={`text-xs text-green-500 ${
                            reducedMotion ? "" : "animate-pulse"
                        }`}
                    >
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
            <div className="relative flex-1 min-h-0">
                <div
                    ref={outputRef}
                    onScroll={handleOutputScroll}
                    className="h-full min-h-0 overflow-auto p-4 font-mono text-sm text-zinc-300 [scrollbar-width:thin] [scrollbar-color:rgb(63_63_70)_rgb(24_24_27)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-zinc-900/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb:hover]:bg-zinc-600"
                    style={{
                        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                        fontSize: `${normalizedFontSize}px`,
                    }}
                >
                    {totalRowCount === 0 ? (
                        "No output yet. Run your program to see output here."
                    ) : (
                        <div
                            style={{
                                paddingTop: `${topSpacerHeight}px`,
                                paddingBottom: `${bottomSpacerHeight}px`,
                            }}
                        >
                            {visibleRows.map((row, index) => (
                                <div
                                    key={visibleStart + index}
                                    className="flex items-start"
                                    style={{
                                        minHeight: `${lineHeightPx}px`,
                                        lineHeight: `${lineHeightPx}px`,
                                    }}
                                >
                                    <span
                                        className="shrink-0 select-none pr-3 text-right text-zinc-500"
                                        style={{
                                            width: `${lineNumberDigits + 1}ch`,
                                        }}
                                    >
                                        {row.isLogicalStart
                                            ? (row.logicalIndex + 1).toLocaleString()
                                            : "\u00A0"}
                                    </span>
                                    <span className="whitespace-pre">
                                        {row.text.length > 0 ? row.text : "\u00A0"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {totalRowCount > 0 ? (
                    <div className="pointer-events-none absolute bottom-3 right-3 flex items-end gap-2">
                        <div className="pointer-events-auto rounded-full border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-1 text-[11px] text-zinc-300 shadow-sm backdrop-blur-sm">
                            Line {currentLineIndicator.toLocaleString()} of{" "}
                            {totalLogicalLineCount.toLocaleString()}
                        </div>
                        <div className="pointer-events-auto flex flex-col gap-1.5">
                            {showJumpToTop ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="secondary"
                                    className="h-8 w-8 rounded-full border border-zinc-700 bg-zinc-900/95 text-zinc-100 hover:bg-zinc-800"
                                    onClick={handleJumpToTop}
                                    aria-label="Jump to top"
                                    title="Jump to top"
                                >
                                    <ChevronUp className="size-4" />
                                </Button>
                            ) : null}
                            {!isAtBottom ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="secondary"
                                    className="h-8 w-8 rounded-full border border-zinc-700 bg-zinc-900/95 text-zinc-100 hover:bg-zinc-800"
                                    onClick={handleJumpToBottom}
                                    aria-label="Jump to bottom"
                                    title="Jump to bottom"
                                >
                                    <ChevronDown className="size-4" />
                                </Button>
                            ) : null}
                        </div>
                    </div>
                ) : null}
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
                        fontSize: `${normalizedFontSize}px`,
                    }}
                />
            </form>
        </div>
    );
}

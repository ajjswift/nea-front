import { useEnvironment } from "@/layout/EnvironmentLayout";
import { Editor } from "@monaco-editor/react";
import { getFileExtension, getProgrammingLanguage } from "./fileUtils";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { EnvironmentApiClient } from "@/lib/environments/EnvironmentApiClient";

const stringToColor = (str) => {
    if (!str) {
        return "#9CA3AF";
    }

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
};

function isInstructionsFile(fileName) {
    return (fileName || "").toLowerCase() === "instructions.md";
}

function isVirtualInstructionsFile(file) {
    return Boolean(file?.isVirtualInstructions);
}

function normalizeRequiredFiles(value) {
    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Array.isArray(value.requiredFiles)
    ) {
        return normalizeRequiredFiles(value.requiredFiles);
    }

    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Array.isArray(value.required_files)
    ) {
        return normalizeRequiredFiles(value.required_files);
    }

    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
}

function escapeHtml(text) {
    return (text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const environmentApiClient = new EnvironmentApiClient();

function getLintIssueExplanation(message) {
    const normalized = `${message || ""}`.toLowerCase();

    if (
        normalized.includes("unexpected indentation") ||
        normalized.includes("indentationerror")
    ) {
        return "This line is indented when Python does not expect a block. Remove the extra spaces or add a block statement (for example: if, for, while, def) above it.";
    }

    if (normalized.includes("expected an indented block")) {
        return "Python expected a block after a statement ending with ':' but the next line was not indented. Indent the next line by 4 spaces.";
    }

    if (
        normalized.includes("was never closed") ||
        normalized.includes("unclosed") ||
        normalized.includes("eol while scanning string literal")
    ) {
        return "A bracket, quote, or string was opened but not closed. Check nearby (), [], {}, and quote characters.";
    }

    if (
        normalized.includes("invalid syntax") ||
        normalized.includes("syntaxerror") ||
        normalized.includes("failed to parse")
    ) {
        return "There is a Python syntax problem on or near this line. Check punctuation, missing colons, and matching brackets.";
    }

    if (normalized.includes("undefined name")) {
        return "Python cannot find this variable name. Make sure it is defined before use and spelled consistently.";
    }

    if (normalized.includes("typeerror")) {
        return "A value is being used with an incompatible type. Check the types involved in this operation.";
    }

    if (normalized.includes("nameerror")) {
        return "A variable or function name is being used before it exists in scope.";
    }

    return "Check the line shown, then run Format and Lint again. Fixing the first error often clears later ones.";
}

function getLintFailureExplanation(error) {
    const status = Number(error?.status);
    const message = error?.message || "Could not lint Python source.";
    const normalized = `${message}`.toLowerCase();

    if (
        normalized.includes("failed to fetch") ||
        normalized.includes("networkerror")
    ) {
        return {
            message,
            explanation:
                "The lint service could not be reached. Check your connection and try again.",
        };
    }

    if (status === 400) {
        return {
            message,
            explanation:
                "The request was rejected. Make sure you are linting a valid .py file and try again.",
        };
    }

    if (status === 401 || status === 403) {
        return {
            message,
            explanation:
                "You do not have permission to lint this environment right now.",
        };
    }

    if (status === 404) {
        return {
            message,
            explanation:
                "The environment could not be found. Refresh and open the environment again.",
        };
    }

    if (status >= 500) {
        return {
            message,
            explanation:
                "The lint service had a temporary server issue. Wait a moment and try again.",
        };
    }

    return {
        message,
        explanation:
            "Lint could not complete. Try formatting first, then run lint again.",
    };
}

function mapLintDiagnostics(diagnostics) {
    if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
        return [
            {
                line: null,
                column: null,
                level: "ok",
                message: "No lint issues found.",
                explanation: null,
            },
        ];
    }

    return diagnostics.slice(0, 50).map((diagnostic) => {
        const code =
            typeof diagnostic?.code === "string"
                ? diagnostic.code
                : typeof diagnostic?.rule === "string"
                  ? diagnostic.rule
                  : "";
        const message =
            typeof diagnostic?.message === "string"
                ? diagnostic.message
                : "Lint issue found.";
        const line = Number.isFinite(diagnostic?.location?.row)
            ? diagnostic.location.row
            : null;
        const column = Number.isFinite(diagnostic?.location?.column)
            ? diagnostic.location.column
            : null;

        return {
            line,
            column,
            level: "warning",
            message: code ? `[${code}] ${message}` : message,
            explanation: getLintIssueExplanation(message),
        };
    });
}

function renderInlineMarkdown(text) {
    let html = escapeHtml(text);

    html = html.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_m, label, url) => {
            return `<a href="${url}" target="_blank" rel="noreferrer" class="text-blue-300 underline">${label}</a>`;
        },
    );
    html = html.replace(
        /`([^`]+)`/g,
        '<code class="rounded bg-zinc-800 px-1 py-0.5 text-zinc-100">$1</code>',
    );
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    return html;
}

function renderMarkdownToHtml(markdown) {
    const normalized = (markdown || "").replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");

    const html = [];
    let inCodeBlock = false;
    let inUnorderedList = false;
    let inOrderedList = false;

    const closeLists = () => {
        if (inUnorderedList) {
            html.push("</ul>");
            inUnorderedList = false;
        }
        if (inOrderedList) {
            html.push("</ol>");
            inOrderedList = false;
        }
    };

    for (const rawLine of lines) {
        const line = rawLine ?? "";

        if (line.trim().startsWith("```")) {
            closeLists();
            if (!inCodeBlock) {
                inCodeBlock = true;
                html.push(
                    '<pre class="overflow-x-auto rounded-md bg-zinc-900 p-3 text-zinc-100"><code>',
                );
            } else {
                inCodeBlock = false;
                html.push("</code></pre>");
            }
            continue;
        }

        if (inCodeBlock) {
            html.push(`${escapeHtml(line)}\n`);
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            closeLists();
            const level = headingMatch[1].length;
            const headingContent = renderInlineMarkdown(headingMatch[2]);
            html.push(
                `<h${level} class=\"font-semibold text-zinc-100\">${headingContent}</h${level}>`,
            );
            continue;
        }

        const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
        if (unorderedMatch) {
            if (!inUnorderedList) {
                closeLists();
                inUnorderedList = true;
                html.push('<ul class="list-disc pl-5">');
            }
            html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
            continue;
        }

        const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
        if (orderedMatch) {
            if (!inOrderedList) {
                closeLists();
                inOrderedList = true;
                html.push('<ol class="list-decimal pl-5">');
            }
            html.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
            continue;
        }

        if (line.trim() === "") {
            closeLists();
            html.push('<div class="h-2"></div>');
            continue;
        }

        closeLists();
        html.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }

    closeLists();
    if (inCodeBlock) {
        html.push("</code></pre>");
    }

    return html.join("\n");
}

export function FileViewer({
    className = "col-span-8 row-span-7",
    editorFontSize = 14,
    highContrast = false,
    reducedMotion = false,
}) {
    const { environment, setEnvironment } = useEnvironment();
    const [remoteCursors, setRemoteCursors] = useState([]);
    const [markdownMode, setMarkdownMode] = useState("rich");
    const [lintHints, setLintHints] = useState([]);
    const [isFormatting, setIsFormatting] = useState(false);
    const [isLinting, setIsLinting] = useState(false);

    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const decorationsRef = useRef([]);
    const isApplyingRemoteChangeRef = useRef(false);
    const currentFileIdRef = useRef(null);
    const previousFileIdRef = useRef(null);
    const currentFileReadOnlyRef = useRef(false);
    const viewedFileIdRef = useRef(null);
    const consumedJumpAtRef = useRef(null);
    const followedCursorMarkerRef = useRef("");

    const [editorInstance, setEditorInstance] = useState(null);

    const currentFile =
        environment?.files?.find((f) => f.id === environment.currentFile) ||
        (environment?.files?.length > 0 && environment.files[0]) ||
        null;
    const currentFileId = currentFile?.id ?? null;
    const currentFileContent = currentFile?.content ?? "";

    const fileExtension = (getFileExtension(currentFile?.name) || "").toLowerCase();
    const isMarkdownFile = fileExtension === "md";
    const isInstructionsMarkdown =
        isMarkdownFile && isInstructionsFile(currentFile?.name);
    const isVirtualInstructionsMarkdown =
        isInstructionsMarkdown && isVirtualInstructionsFile(currentFile);
    const isAssignmentEnvironment = Boolean(
        environment?.access?.isAssignmentEnvironment,
    );
    const assignmentTestCases = Array.isArray(environment?.access?.testCases)
        ? environment.access.testCases
        : Array.isArray(environment?.access?.test_cases_json)
          ? environment.access.test_cases_json
          : [];
    const checklistRequiredFiles = normalizeRequiredFiles(
        environment?.access?.checklist || environment?.access?.checklist_json,
    );
    const shouldShowInstructionsContext =
        isInstructionsMarkdown &&
        (isAssignmentEnvironment ||
            assignmentTestCases.length > 0 ||
            checklistRequiredFiles.length > 0);
    const isInstructionsReadOnly =
        (Boolean(environment?.permissions?.readOnlyInstructions) ||
            isVirtualInstructionsMarkdown) &&
        isInstructionsMarkdown;
    const isEnvironmentReadOnly = Boolean(
        environment?.permissions?.readOnlyEnvironment,
    );
    const isCurrentFileReadOnly =
        Boolean(isInstructionsReadOnly || isEnvironmentReadOnly);

    const shouldShowRawEditor =
        !isMarkdownFile || (!isCurrentFileReadOnly && markdownMode === "raw");
    const shouldShowRichMarkdown =
        isMarkdownFile && (isCurrentFileReadOnly || markdownMode === "rich");

    useEffect(() => {
        currentFileIdRef.current = environment?.currentFile;
    }, [environment?.currentFile]);

    useEffect(() => {
        currentFileReadOnlyRef.current = isCurrentFileReadOnly;
    }, [isCurrentFileReadOnly]);

    useEffect(() => {
        if (currentFileId && viewedFileIdRef.current !== currentFileId) {
            setMarkdownMode(isMarkdownFile ? "rich" : "raw");
            setLintHints([]);
            viewedFileIdRef.current = currentFileId;
        }
    }, [currentFileId, isMarkdownFile]);

    useEffect(() => {
        if (shouldShowRawEditor) {
            return;
        }

        setEditorInstance(null);
        editorRef.current = null;
        monacoRef.current = null;
        decorationsRef.current = [];
        previousFileIdRef.current = null;
    }, [shouldShowRawEditor]);

    useEffect(() => {
        if (!editorInstance || !currentFileId) return;

        if (currentFileId !== previousFileIdRef.current) {
            editorInstance.setValue(currentFileContent);
            previousFileIdRef.current = currentFileId;
        }
    }, [currentFileId, currentFileContent, editorInstance]);

    const applyFileContentUpdate = (fileId, nextContent) => {
        if (!fileId || currentFileReadOnlyRef.current) {
            return;
        }

        setEnvironment((prev) => {
            const previousFiles = Array.isArray(prev.files) ? prev.files : [];
            const updatedFiles = previousFiles.map((file) =>
                file.id === fileId
                    ? { ...file, content: nextContent }
                    : file,
            );

            const didSend = prev.ws?.readyState === 1;
            if (didSend) {
                prev.ws.send(
                    JSON.stringify({
                        type: "fileUpdate",
                        data: {
                            fileId,
                            changes: [],
                            files: updatedFiles,
                            userId: prev.userId,
                        },
                    }),
                );
            }

            const pendingCount = didSend
                ? (Number.isFinite(prev?.sync?.pendingCount)
                      ? prev.sync.pendingCount
                      : 0) + 1
                : Number.isFinite(prev?.sync?.pendingCount)
                  ? prev.sync.pendingCount
                  : 0;

            return {
                ...prev,
                files: updatedFiles,
                sync: {
                    pendingCount,
                    lastSavedAt: prev?.sync?.lastSavedAt || null,
                    status: didSend
                        ? "saving"
                        : prev?.sync?.status || "offline",
                },
            };
        });
    };

    const handleFormatFile = async () => {
        if (isCurrentFileReadOnly || !currentFile) {
            return;
        }

        if (fileExtension !== "py") {
            setLintHints([
                {
                    line: null,
                    level: "info",
                    message: "Format currently targets Python files (.py).",
                },
            ]);
            return;
        }

        if (!environment?.id) {
            setLintHints([
                {
                    line: null,
                    level: "error",
                    message: "Environment metadata is still loading. Try again.",
                },
            ]);
            return;
        }

        const requestedFileId = currentFile.id;
        const requestedFileName = currentFile.name;
        const requestedSource = currentFile.content || "";

        setIsFormatting(true);
        try {
            const payload = await environmentApiClient.formatPythonFile(
                environment.id,
                {
                    fileName: requestedFileName,
                    source: requestedSource,
                },
            );
            if (currentFileIdRef.current !== requestedFileId) {
                return;
            }

            const nextContent =
                typeof payload?.formattedContent === "string"
                    ? payload.formattedContent
                    : requestedSource;

            applyFileContentUpdate(requestedFileId, nextContent);
            if (editorRef.current && editorRef.current.getValue() !== nextContent) {
                editorRef.current.setValue(nextContent);
            }

            setLintHints([
                {
                    line: null,
                    level: "ok",
                    message: payload?.repairedIndentation
                        ? "Formatted (fixed indentation)."
                        : "Formatted.",
                },
            ]);
        } catch (error) {
            if (currentFileIdRef.current !== requestedFileId) {
                return;
            }

            setLintHints([
                {
                    line: null,
                    level: "error",
                    message: error?.message || "Could not format Python source.",
                },
            ]);
        } finally {
            setIsFormatting(false);
        }
    };

    const handleRunLint = async () => {
        if (!currentFile) {
            return;
        }

        if (fileExtension !== "py") {
            setLintHints([
                {
                    line: null,
                    level: "info",
                    message: "Lint currently supports Python files (.py) only.",
                },
            ]);
            return;
        }

        if (!environment?.id) {
            setLintHints([
                {
                    line: null,
                    level: "error",
                    message: "Environment metadata is still loading. Try again.",
                },
            ]);
            return;
        }

        const requestedFileId = currentFile.id;
        const requestedFileName = currentFile.name;
        const requestedSource = currentFile.content || "";

        setIsLinting(true);
        try {
            const payload = await environmentApiClient.lintPythonFile(
                environment.id,
                {
                    fileName: requestedFileName,
                    source: requestedSource,
                },
            );

            if (currentFileIdRef.current !== requestedFileId) {
                return;
            }

            setLintHints(mapLintDiagnostics(payload?.diagnostics || []));
        } catch (error) {
            if (currentFileIdRef.current !== requestedFileId) {
                return;
            }

            const failure = getLintFailureExplanation(error);
            setLintHints([
                {
                    line: null,
                    level: "error",
                    message: failure.message,
                    explanation: failure.explanation,
                },
            ]);
        } finally {
            setIsLinting(false);
        }
    };

    useEffect(() => {
        if (!editorInstance || !environment?.ws || !shouldShowRawEditor) return;

        const editor = editorInstance;

        const cursorDisposable = editor.onDidChangeCursorPosition((event) => {
            const position = event.position;
            if (!editor.getModel() || !currentFileIdRef.current) return;

            environment.ws.send(
                JSON.stringify({
                    type: "cursorUpdate",
                    data: {
                        userId: environment.userId,
                        userName: environment.viewerName,
                        fileId: currentFileIdRef.current,
                        position,
                    },
                }),
            );
        });

        const contentDisposable = editor.onDidChangeModelContent((event) => {
            if (isApplyingRemoteChangeRef.current || currentFileReadOnlyRef.current) {
                return;
            }

            const changes = event.changes.map((change) => ({
                range: {
                    startLineNumber: change.range.startLineNumber,
                    startColumn: change.range.startColumn,
                    endLineNumber: change.range.endLineNumber,
                    endColumn: change.range.endColumn,
                },
                text: change.text,
                rangeLength: change.rangeLength,
            }));

            const updatedContent = editor.getValue();
            const fileId = currentFileIdRef.current;

            setEnvironment((prev) => {
                if (!fileId) {
                    return prev;
                }

                const previousFiles = Array.isArray(prev.files) ? prev.files : [];
                const updatedFiles = previousFiles.map((file) =>
                    file.id === fileId
                        ? { ...file, content: updatedContent }
                        : file,
                );

                const didSend = prev.ws?.readyState === 1;
                if (didSend) {
                    prev.ws.send(
                        JSON.stringify({
                            type: "fileUpdate",
                            data: {
                                fileId,
                                changes,
                                files: updatedFiles,
                                userId: prev.userId,
                            },
                        }),
                    );
                }

                const pendingCount = didSend
                    ? (Number.isFinite(prev?.sync?.pendingCount)
                          ? prev.sync.pendingCount
                          : 0) + 1
                    : Number.isFinite(prev?.sync?.pendingCount)
                      ? prev.sync.pendingCount
                      : 0;

                return {
                    ...prev,
                    files: updatedFiles,
                    sync: {
                        pendingCount,
                        lastSavedAt: prev?.sync?.lastSavedAt || null,
                        status: didSend
                            ? "saving"
                            : prev?.sync?.status || "offline",
                    },
                };
            });
        });

        return () => {
            cursorDisposable.dispose();
            contentDisposable.dispose();
        };
    }, [
        editorInstance,
        environment?.ws,
        environment?.userId,
        environment?.viewerName,
        setEnvironment,
        shouldShowRawEditor,
    ]);

    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        setEditorInstance(editor);
    };

    const jumpToEditorLocation = (line, column = 1) => {
        const targetLine = Number(line);
        if (!Number.isFinite(targetLine) || targetLine < 1) {
            return;
        }

        const safeColumn = Math.max(1, Number(column) || 1);
        const editor = editorRef.current;
        if (!editor) {
            return;
        }

        editor.revealLineInCenter(targetLine);
        editor.setPosition({ lineNumber: targetLine, column: safeColumn });
        editor.focus();
    };

    useEffect(() => {
        if (!environment?.pendingFileUpdate) {
            return;
        }

        const update = environment.pendingFileUpdate;

        if (update.userId === environment.userId) {
            setEnvironment((prev) => ({ ...prev, pendingFileUpdate: null }));
            return;
        }

        if (!editorRef.current || !monacoRef.current || !shouldShowRawEditor) {
            setEnvironment((prev) => ({
                ...prev,
                files: Array.isArray(update.files) ? update.files : prev.files,
                pendingFileUpdate: null,
            }));
            return;
        }

        const editor = editorRef.current;
        const monaco = monacoRef.current;

        isApplyingRemoteChangeRef.current = true;

        try {
            const targetFile = update.files?.find(
                (f) => f.id === environment.currentFile,
            );

            if (targetFile && targetFile.id === update.fileId) {
                if (update.changes) {
                    const edits = update.changes.map((change) => ({
                        range: new monaco.Range(
                            change.range.startLineNumber,
                            change.range.startColumn,
                            change.range.endLineNumber,
                            change.range.endColumn,
                        ),
                        text: change.text,
                        forceMoveMarkers: true,
                    }));

                    editor.executeEdits("remote", edits);

                    if (editor.getValue() !== targetFile.content) {
                        editor.setValue(targetFile.content);
                    }
                } else if (targetFile.content !== editor.getValue()) {
                    editor.setValue(targetFile.content);
                }
            }

            setEnvironment((prev) => ({
                ...prev,
                files: Array.isArray(update.files) ? update.files : prev.files,
                pendingFileUpdate: null,
            }));
        } finally {
            isApplyingRemoteChangeRef.current = false;
        }
    }, [
        environment?.pendingFileUpdate,
        environment?.currentFile,
        environment?.userId,
        setEnvironment,
        shouldShowRawEditor,
    ]);

    useEffect(() => {
        if (Array.isArray(environment?.remoteCursors)) {
            setRemoteCursors(environment.remoteCursors);
        } else {
            setRemoteCursors([]);
        }
    }, [environment?.remoteCursors]);

    useEffect(() => {
        const jump = environment?.editorJump;
        if (!jump || !Number.isFinite(jump?.line)) {
            return;
        }

        const jumpAt = jump?.at ?? `${jump.line}:${jump.column || 1}`;
        if (consumedJumpAtRef.current === jumpAt) {
            return;
        }

        if (!shouldShowRawEditor || !editorRef.current) {
            return;
        }

        consumedJumpAtRef.current = jumpAt;
        jumpToEditorLocation(jump.line, jump.column || 1);
    }, [environment?.editorJump, shouldShowRawEditor]);

    useEffect(() => {
        const followStudentId = environment?.followMode?.studentId;
        const isFollowEnabled = Boolean(environment?.followMode?.enabled);
        if (!isFollowEnabled || !followStudentId) {
            followedCursorMarkerRef.current = "";
            return;
        }

        const followedCursor = remoteCursors.find(
            (cursor) => cursor?.id === followStudentId && cursor?.position,
        );
        if (!followedCursor) {
            return;
        }

        const fileId = followedCursor.fileId || environment?.currentFile;
        const position = followedCursor.position;
        if (!fileId || !position) {
            return;
        }

        const marker = `${fileId}:${position.lineNumber}:${position.column}`;
        if (followedCursorMarkerRef.current === marker) {
            return;
        }
        followedCursorMarkerRef.current = marker;

        if (environment?.currentFile !== fileId) {
            setEnvironment((prev) => ({ ...prev, currentFile: fileId }));
            return;
        }

        if (!shouldShowRawEditor || !editorRef.current) {
            return;
        }

        jumpToEditorLocation(position.lineNumber, position.column || 1);
    }, [
        environment?.followMode,
        environment?.currentFile,
        remoteCursors,
        setEnvironment,
        shouldShowRawEditor,
    ]);

    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco || !Array.isArray(remoteCursors)) return;

        const activeCursors = remoteCursors.filter(
            (c) =>
                c.id !== environment.userId &&
                c.fileId === environment.currentFile &&
                c.position,
        );

        const decorations = activeCursors.map((c) => {
            const color = stringToColor(c.id);
            const styleId = `cursor-style-${c.id}`;
            if (!document.getElementById(styleId)) {
                const style = document.createElement("style");
                style.id = styleId;
                style.textContent = `
                  .remote-cursor-${c.id} { background-color: ${color}; width: 2px !important; }
                  .remote-cursor-label-${c.id} { background-color: ${color}; color: white; padding: 0 4px; font-size: 10px; white-space: nowrap; }
                `;
                document.head.appendChild(style);
            }

            return {
                range: new monaco.Range(
                    c.position.lineNumber,
                    c.position.column,
                    c.position.lineNumber,
                    c.position.column,
                ),
                options: {
                    className: `remote-cursor-${c.id}`,
                    beforeContentClassName: `remote-cursor-${c.id}`,
                    after: {
                        content: c.userName || "User",
                        inlineClassName: `remote-cursor-label-${c.id}`,
                    },
                },
            };
        });

        decorationsRef.current = editor.deltaDecorations(
            decorationsRef.current,
            decorations,
        );

        return () => {
            if (editor && decorationsRef.current?.length > 0) {
                decorationsRef.current = editor.deltaDecorations(
                    decorationsRef.current,
                    [],
                );
            }
        };
    }, [remoteCursors, environment?.currentFile, environment?.userId]);

    return (
        <div
            className={cn(
                "flex h-full w-full flex-col overflow-hidden",
                highContrast ? "contrast-125" : "",
                className,
            )}
        >
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
                <div className="min-w-0 truncate">{currentFile?.name || "No file selected"}</div>
                <div className="flex items-center gap-1">
                    {isMarkdownFile && (
                        <>
                            <button
                                type="button"
                                onClick={() => setMarkdownMode("rich")}
                                className={`rounded px-2 py-1 ${
                                    shouldShowRichMarkdown
                                        ? "bg-zinc-700 text-zinc-100"
                                        : "hover:bg-zinc-800"
                                }`}
                            >
                                Rich
                            </button>
                            {!isCurrentFileReadOnly && (
                                <button
                                    type="button"
                                    onClick={() => setMarkdownMode("raw")}
                                    className={`rounded px-2 py-1 ${
                                        shouldShowRawEditor
                                            ? "bg-zinc-700 text-zinc-100"
                                            : "hover:bg-zinc-800"
                                    }`}
                                >
                                    Raw
                                </button>
                            )}
                        </>
                    )}
                    <button
                        type="button"
                        onClick={handleFormatFile}
                        disabled={
                            isCurrentFileReadOnly ||
                            !currentFile ||
                            isFormatting ||
                            isLinting
                        }
                        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isFormatting ? "Formatting..." : "Format"}
                    </button>
                    <button
                        type="button"
                        onClick={handleRunLint}
                        disabled={
                            isCurrentFileReadOnly ||
                            !currentFile ||
                            isFormatting ||
                            isLinting
                        }
                        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isLinting ? "Linting..." : "Lint"}
                    </button>
                </div>
            </div>

            {lintHints.length > 0 && (
                <div className="border-b border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs">
                    <p className="mb-1 font-medium text-zinc-300">Lint hints</p>
                    <div className="space-y-1 text-zinc-400">
                        {lintHints.map((hint, index) => (
                            <div
                                key={`${hint.line || "n"}-${index}`}
                                className={
                                    hint.level === "error"
                                        ? "text-red-300"
                                        : hint.level === "ok"
                                          ? "text-emerald-300"
                                          : "text-zinc-300"
                                }
                            >
                                {hint.line ? (
                                    <button
                                        type="button"
                                        className="text-left underline decoration-dotted underline-offset-2 hover:text-zinc-100"
                                        onClick={() =>
                                            jumpToEditorLocation(
                                                hint.line,
                                                hint.column || 1,
                                            )
                                        }
                                    >
                                        {`Line ${hint.line}${hint.column ? `:${hint.column}` : ""}: ${hint.message}`}
                                    </button>
                                ) : (
                                    hint.message
                                )}
                                {hint.explanation ? (
                                    <p className="mt-0.5 text-zinc-500">
                                        {hint.explanation}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {shouldShowInstructionsContext ? (
                <div className="border-b border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs">
                    <p className="mb-1 font-medium text-zinc-300">
                        Assignment context
                    </p>
                    {checklistRequiredFiles.length > 0 ? (
                        <div className="mb-2 rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1.5">
                            <p className="text-zinc-400">
                                Checklist required files:
                            </p>
                            <p className="mt-1 text-zinc-200">
                                {checklistRequiredFiles.join(", ")}
                            </p>
                        </div>
                    ) : (
                        <div className="mb-2 rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1.5">
                            <p className="text-zinc-400">
                                Checklist required files:
                            </p>
                            <p className="mt-1 text-zinc-500">
                                No required files configured.
                            </p>
                        </div>
                    )}
                    {assignmentTestCases.length > 0 ? (
                        <div className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1.5">
                            <p className="text-zinc-400">Built-in test cases:</p>
                            <div className="mt-1 space-y-1">
                                {assignmentTestCases.map((testCase, index) => (
                                    <p
                                        key={testCase?.id || `case-${index}`}
                                        className="text-zinc-200"
                                    >
                                        {index + 1}.{" "}
                                        {testCase?.name
                                            ? testCase.name
                                            : `Test ${index + 1}`}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1.5">
                            <p className="text-zinc-400">Built-in test cases:</p>
                            <p className="mt-1 text-zinc-500">
                                No test cases configured.
                            </p>
                        </div>
                    )}
                </div>
            ) : null}

            <div className="flex-1 overflow-hidden">
                {shouldShowRichMarkdown ? (
                    <div className="h-full overflow-auto bg-zinc-950 p-4 text-sm leading-7 text-zinc-200">
                        {currentFileContent.trim() ? (
                            <div
                                className="space-y-2"
                                dangerouslySetInnerHTML={{
                                    __html: renderMarkdownToHtml(currentFileContent),
                                }}
                            />
                        ) : (
                            <p className="text-zinc-500">No content yet.</p>
                        )}
                    </div>
                ) : (
                    <Editor
                        width="100%"
                        height="100%"
                        theme="vs-dark"
                        language={getProgrammingLanguage(currentFile?.name)}
                        onMount={handleEditorMount}
                        options={{
                            minimap: { enabled: false },
                            automaticLayout: true,
                            readOnly: isCurrentFileReadOnly,
                            fontSize: Math.max(12, Number(editorFontSize) || 14),
                            lineHeight: Math.max(
                                18,
                                Math.round((Number(editorFontSize) || 14) * 1.6),
                            ),
                            smoothScrolling: !reducedMotion,
                        }}
                    />
                )}
            </div>
        </div>
    );
}

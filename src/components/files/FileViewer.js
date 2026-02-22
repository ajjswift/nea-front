import { useEnvironment } from "@/layout/EnvironmentLayout";
import { Editor } from "@monaco-editor/react";
import { getFileExtension, getProgrammingLanguage } from "./fileUtils";
import { useEffect, useRef, useState } from "react";

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

function escapeHtml(text) {
    return (text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(text) {
    let html = escapeHtml(text);

    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
        return `<a href="${url}" target="_blank" rel="noreferrer" class="text-blue-300 underline">${label}</a>`;
    });
    html = html.replace(/`([^`]+)`/g, "<code class=\"rounded bg-zinc-800 px-1 py-0.5 text-zinc-100\">$1</code>");
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
                html.push('<pre class="overflow-x-auto rounded-md bg-zinc-900 p-3 text-zinc-100"><code>');
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
            html.push(`<h${level} class=\"font-semibold text-zinc-100\">${headingContent}</h${level}>`);
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

export function FileViewer() {
    const { environment, setEnvironment } = useEnvironment();
    const [remoteCursors, setRemoteCursors] = useState([]);
    const [markdownMode, setMarkdownMode] = useState("rich");

    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const decorationsRef = useRef([]);
    const isApplyingRemoteChangeRef = useRef(false);
    const currentFileIdRef = useRef(null);
    const previousFileIdRef = useRef(null);
    const currentFileReadOnlyRef = useRef(false);
    const viewedFileIdRef = useRef(null);

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
    const isInstructionsReadOnly =
        Boolean(environment?.permissions?.readOnlyInstructions) &&
        isInstructionsMarkdown;

    const shouldShowRawEditor =
        !isMarkdownFile || (!isInstructionsReadOnly && markdownMode === "raw");
    const shouldShowRichMarkdown =
        isMarkdownFile && (isInstructionsReadOnly || markdownMode === "rich");

    useEffect(() => {
        currentFileIdRef.current = environment?.currentFile;
    }, [environment?.currentFile]);

    useEffect(() => {
        currentFileReadOnlyRef.current = isInstructionsReadOnly;
    }, [isInstructionsReadOnly]);

    useEffect(() => {
        if (currentFileId && viewedFileIdRef.current !== currentFileId) {
            setMarkdownMode(isMarkdownFile ? "rich" : "raw");
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
                        fileId: currentFileIdRef.current,
                        position,
                    },
                })
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
                        : file
                );

                if (prev.ws) {
                    prev.ws.send(
                        JSON.stringify({
                            type: "fileUpdate",
                            data: {
                                fileId: fileId,
                                changes: changes,
                                files: updatedFiles,
                                userId: prev.userId,
                            },
                        })
                    );
                }

                return { ...prev, files: updatedFiles };
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
        setEnvironment,
        shouldShowRawEditor,
    ]);

    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        setEditorInstance(editor);
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
                (f) => f.id === environment.currentFile
            );

            if (targetFile && targetFile.id === update.fileId) {
                if (update.changes) {
                    const edits = update.changes.map((change) => ({
                        range: new monaco.Range(
                            change.range.startLineNumber,
                            change.range.startColumn,
                            change.range.endLineNumber,
                            change.range.endColumn
                        ),
                        text: change.text,
                        forceMoveMarkers: true,
                    }));

                    editor.executeEdits("remote", edits);

                    if (editor.getValue() !== targetFile.content) {
                        editor.setValue(targetFile.content);
                    }
                } else {
                    if (targetFile.content !== editor.getValue()) {
                        editor.setValue(targetFile.content);
                    }
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
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco || !Array.isArray(remoteCursors)) return;

        const activeCursors = remoteCursors.filter(
            (c) =>
                c.id !== environment.userId &&
                c.fileId === environment.currentFile &&
                c.position
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
                    c.position.column
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
            decorations
        );

        return () => {
            if (editor && decorationsRef.current?.length > 0) {
                decorationsRef.current = editor.deltaDecorations(
                    decorationsRef.current,
                    []
                );
            }
        };
    }, [remoteCursors, environment?.currentFile, environment?.userId]);

    return (
        <div className="col-span-8 row-span-7 flex h-full w-full flex-col">
            {isMarkdownFile && (
                <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
                    <div className="flex items-center gap-2">
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
                        {!isInstructionsReadOnly && (
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
                    </div>
                    {isInstructionsReadOnly && (
                        <span>Read-only in assignment environment</span>
                    )}
                </div>
            )}

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
                            readOnly: isInstructionsReadOnly,
                        }}
                    />
                )}
            </div>
        </div>
    );
}

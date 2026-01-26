import { useEnvironment } from "@/layout/EnvironmentLayout";
import { Editor } from "@monaco-editor/react";
import { getProgrammingLanguage } from "./fileUtils";
import { useEffect, useState, useRef } from "react";

const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
};

export function FileViewer() {
    const { environment, setEnvironment } = useEnvironment();
    const [remoteCursors, setRemoteCursors] = useState({});

    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const decorationsRef = useRef([]);
    const isApplyingRemoteChangeRef = useRef(false);
    const currentFileIdRef = useRef(null);
    const previousFileIdRef = useRef(null);

    const [editorInstance, setEditorInstance] = useState(null);

    const currentFile =
        environment?.files?.find((f) => f.id === environment.currentFile) ||
        (environment?.files?.length > 0 && environment.files[0]) ||
        null;

    useEffect(() => {
        currentFileIdRef.current = environment?.currentFile;
    }, [environment?.currentFile]);

    useEffect(() => {
        if (!editorInstance || !currentFile) return;

        if (currentFile.id !== previousFileIdRef.current) {
            editorInstance.setValue(currentFile.content || "");
            previousFileIdRef.current = currentFile.id;
        }
    }, [currentFile?.id, currentFile?.content, editorInstance]);

    useEffect(() => {
        if (!editorInstance || !environment?.ws) return;

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
            if (isApplyingRemoteChangeRef.current) return;

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
                const updatedFiles = prev.files.map((file) =>
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
    }, [editorInstance, environment?.ws, environment?.userId, setEnvironment]);

    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        setEditorInstance(editor);
    };

    useEffect(() => {
        if (
            !environment?.pendingFileUpdate ||
            !editorRef.current ||
            !monacoRef.current
        )
            return;

        const update = environment.pendingFileUpdate;

        // Don't apply own changes
        if (update.userId === environment.userId) {
            setEnvironment((prev) => ({ ...prev, pendingFileUpdate: null }));
            return;
        }

        const editor = editorRef.current;
        const monaco = monacoRef.current;

        isApplyingRemoteChangeRef.current = true;

        try {
            // Find the specific file content in the update
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
                files: update.files,
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
    ]);

    // Cursor Decorations Logic
    useEffect(() => {
        if (environment?.remoteCursors) {
            setRemoteCursors(environment.remoteCursors);
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
        <div className="col-span-8 row-span-8 h-full w-full">
            <Editor
                width="100%"
                height="100%"
                theme="vs-dark"
                language={getProgrammingLanguage(currentFile?.name)}
                onMount={handleEditorMount}
                options={{
                    minimap: { enabled: false },
                    automaticLayout: true,
                }}
            />
        </div>
    );
}

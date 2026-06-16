import { useEnvironment } from "@/layout/EnvironmentLayout";
import { getFileIcon } from "./fileUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faDownload,
    faFileCirclePlus,
    faTrash,
    faUpload,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getFileExtension, getFileName, isValidFileName } from "./fileUtils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { replaceFilesInDoc } from "@/lib/collaboration/yjsEnvironment";

function isInstructionsFile(fileName) {
    return (fileName || "").toLowerCase() === "instructions.md";
}

function isVirtualInstructionsFile(file) {
    return Boolean(file?.isVirtualInstructions);
}

function getDisplayFileName(fileName, hideMarkdownSuffix = false) {
    if (!hideMarkdownSuffix) {
        return fileName;
    }

    return (fileName || "").replace(/\.md$/i, "");
}

function buildUniqueFileName(fileName, usedNames) {
    const normalizedFileName = (fileName || "").trim();
    if (!normalizedFileName || !usedNames.has(normalizedFileName)) {
        return normalizedFileName;
    }

    const extension = getFileExtension(normalizedFileName);
    const baseName = getFileName(normalizedFileName) || "imported-file";
    let index = 1;

    while (true) {
        const candidate = extension
            ? `${baseName} (${index}).${extension}`
            : `${baseName} (${index})`;
        if (!usedNames.has(candidate)) {
            return candidate;
        }
        index += 1;
    }
}

function normalizeImportedFileName(fileName, usedNames) {
    const trimmed = (fileName || "").trim();
    let candidate = trimmed;

    if (!candidate) {
        candidate = "imported-file.txt";
    } else if (!isValidFileName(candidate)) {
        candidate = candidate.startsWith(".")
            ? `imported${candidate}`
            : `imported-${candidate.replace(/\s+/g, "-")}`;
    }

    if (!isValidFileName(candidate)) {
        candidate = "imported-file.txt";
    }

    return buildUniqueFileName(candidate, usedNames);
}

function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

function decodeTextFile(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
        return "";
    }

    if (bytes.includes(0)) {
        return null;
    }

    try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        return decoder.decode(bytes);
    } catch {
        return null;
    }
}

function buildImportedFilePayload(id, name, buffer) {
    const bytes = new Uint8Array(buffer);
    const content = decodeTextFile(bytes);

    if (content !== null) {
        return {
            id,
            name,
            content,
        };
    }

    return {
        id,
        name,
        content: "",
        rawData: {
            encoding: "base64",
            value: bytesToBase64(bytes),
        },
        isBinary: true,
    };
}

function base64ToBlob(base64Value) {
    const binary = atob(base64Value);
    const chunkSize = 0x8000;
    const arrays = [];

    for (let index = 0; index < binary.length; index += chunkSize) {
        const chunk = binary.slice(index, index + chunkSize);
        const bytes = new Uint8Array(chunk.length);

        for (let offset = 0; offset < chunk.length; offset += 1) {
            bytes[offset] = chunk.charCodeAt(offset);
        }

        arrays.push(bytes);
    }

    return new Blob(arrays);
}

export function FileManager() {
    const { environment, setEnvironment } = useEnvironment();
    const [newFileOpen, setNewFileOpen] = useState(false);
    const importInputRef = useRef(null);
    const isReadOnlyInstructions = Boolean(
        environment?.permissions?.readOnlyInstructions,
    );
    const isEnvironmentReadOnly = Boolean(
        environment?.permissions?.readOnlyEnvironment,
    );
    const isAssignmentEnvironment = Boolean(
        environment?.access?.isAssignmentEnvironment,
    );

    const changeCurrentFile = (id) => {
        setEnvironment((prev) => ({ ...prev, currentFile: id }));
    };

    const downloadFile = (file) => {
        if (!file?.name) {
            return;
        }

        const blob =
            file?.rawData?.encoding === "base64" &&
            typeof file?.rawData?.value === "string"
                ? base64ToBlob(file.rawData.value)
                : new Blob([typeof file?.content === "string" ? file.content : ""]);
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);
    };

    const createFile = (fileName) => {
        if (isEnvironmentReadOnly) {
            return;
        }

        const normalizedFileName = (fileName || "").trim();

        if (!normalizedFileName || !isValidFileName(normalizedFileName)) {
            return;
        }

        const newId = crypto.randomUUID();
        setEnvironment((prev) => {
            const previousFiles = Array.isArray(prev.files) ? prev.files : [];
            const updatedFiles = [
                ...previousFiles,
                {
                    id: newId,
                    name: normalizedFileName,
                    content: "",
                },
            ];

            if (prev.ydoc) {
                replaceFilesInDoc(prev.ydoc, updatedFiles);
            }

            return {
                ...prev,
                files: updatedFiles,
                currentFile: newId,
            };
        });

        setNewFileOpen(false);
    };

    const deleteFile = (fileId) => {
        if (isEnvironmentReadOnly) {
            return;
        }

        setEnvironment((prev) => {
            const previousFiles = Array.isArray(prev.files) ? prev.files : [];
            const targetFile = previousFiles.find((file) => file.id === fileId);
            if (
                prev?.permissions?.readOnlyInstructions &&
                isInstructionsFile(targetFile?.name)
            ) {
                return prev;
            }
            if (isVirtualInstructionsFile(targetFile)) {
                return prev;
            }

            const updatedFiles = previousFiles.filter((f) => f.id !== fileId);

            if (prev.ydoc) {
                replaceFilesInDoc(prev.ydoc, updatedFiles);
            }

            const nextCurrentFile =
                prev.currentFile === fileId
                    ? updatedFiles[0]?.id || null
                    : prev.currentFile;

            return {
                ...prev,
                files: updatedFiles,
                currentFile: nextCurrentFile,
            };
        });
    };

    const renameFile = (fileId, newName) => {
        if (isEnvironmentReadOnly) {
            return;
        }

        const normalizedNewName = (newName || "").trim();

        if (!normalizedNewName || !isValidFileName(normalizedNewName)) {
            return;
        }

        setEnvironment((prev) => {
            const previousFiles = Array.isArray(prev.files) ? prev.files : [];
            const targetFile = previousFiles.find((file) => file.id === fileId);
            if (
                prev?.permissions?.readOnlyInstructions &&
                isInstructionsFile(targetFile?.name)
            ) {
                return prev;
            }
            if (isVirtualInstructionsFile(targetFile)) {
                return prev;
            }

            const updatedFiles = previousFiles.map((f) =>
                f.id === fileId ? { ...f, name: normalizedNewName } : f,
            );

            if (prev.ydoc) {
                replaceFilesInDoc(prev.ydoc, updatedFiles);
            }

            return {
                ...prev,
                files: updatedFiles,
            };
        });
    };

    const importFiles = async (inputFiles) => {
        if (isEnvironmentReadOnly || !inputFiles?.length) {
            return;
        }

        const importedFiles = [];
        const usedNames = new Set(
            (Array.isArray(environment?.files) ? environment.files : [])
                .map((file) => file?.name)
                .filter(Boolean),
        );

        for (const inputFile of Array.from(inputFiles)) {
            const normalizedName = normalizeImportedFileName(
                inputFile?.name,
                usedNames,
            );
            const buffer = await inputFile.arrayBuffer();

            usedNames.add(normalizedName);
            importedFiles.push(
                buildImportedFilePayload(
                    crypto.randomUUID(),
                    normalizedName,
                    buffer,
                ),
            );
        }

        if (!importedFiles.length) {
            return;
        }

        setEnvironment((prev) => {
            const previousFiles = Array.isArray(prev.files) ? prev.files : [];
            const updatedFiles = [...previousFiles, ...importedFiles];
            if (prev.ydoc) {
                replaceFilesInDoc(prev.ydoc, updatedFiles);
            }

            return {
                ...prev,
                files: updatedFiles,
                currentFile: importedFiles[importedFiles.length - 1].id,
                sync: {
                    pendingCount: 0,
                    lastSavedAt: prev?.sync?.lastSavedAt || null,
                    status: prev.ydoc ? "saved" : prev?.sync?.status || "offline",
                },
            };
        });
    };

    const currentFile = environment.currentFile;
    const files = Array.isArray(environment?.files) ? environment.files : [];
    const pinnedInstructionsFile = isAssignmentEnvironment
        ? files.find((file) => isInstructionsFile(file?.name))
        : null;
    const listedFiles = pinnedInstructionsFile
        ? files.filter((file) => file.id !== pinnedInstructionsFile.id)
        : files;

    return (
        <div className="flex flex-col">
            {pinnedInstructionsFile ? (
                <ContextMenu key={pinnedInstructionsFile.id}>
                    <ContextMenuTrigger>
                        <div
                            style={{ cursor: "pointer" }}
                            onClick={() => changeCurrentFile(pinnedInstructionsFile.id)}
                            className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                                currentFile === pinnedInstructionsFile.id
                                    ? "bg-zinc-700/60 text-zinc-100"
                                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                            }`}
                        >
                            <FontAwesomeIcon
                                icon={getFileIcon(pinnedInstructionsFile.name)}
                                className="w-3.5 shrink-0 text-zinc-500"
                            />
                            <span className="min-w-0 truncate">{getDisplayFileName(pinnedInstructionsFile.name, true)}</span>
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                        <ContextMenuItem
                            onSelect={() => downloadFile(pinnedInstructionsFile)}
                        >
                            <FontAwesomeIcon icon={faDownload} className="w-3.5 shrink-0" />
                            Download
                        </ContextMenuItem>
                        {isReadOnlyInstructions &&
                        isInstructionsFile(pinnedInstructionsFile.name) ? (
                            <ContextMenuItem disabled>
                                Locked in assignment
                            </ContextMenuItem>
                        ) : isVirtualInstructionsFile(pinnedInstructionsFile) ? (
                            <ContextMenuItem disabled>
                                Locked in assignment
                            </ContextMenuItem>
                        ) : isEnvironmentReadOnly ? (
                            <ContextMenuItem disabled>
                                View-only environment
                            </ContextMenuItem>
                        ) : (
                            <>
                                <RenameContextWindow
                                    renameFile={renameFile}
                                    file={pinnedInstructionsFile}
                                />
                                <DeleteContextWindow
                                    deleteFile={deleteFile}
                                    file={pinnedInstructionsFile}
                                />
                            </>
                        )}
                    </ContextMenuContent>
                </ContextMenu>
            ) : null}

            {pinnedInstructionsFile ? (
                <div className="mx-2 my-1 h-px bg-zinc-800"></div>
            ) : null}

            <NewFileDialog
                newFileOpen={newFileOpen}
                setNewFileOpen={setNewFileOpen}
                createFile={createFile}
                disabled={isEnvironmentReadOnly}
            />

            <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-500 outline-none transition-colors hover:bg-zinc-800/50 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => importInputRef.current?.click()}
                disabled={isEnvironmentReadOnly}
            >
                <FontAwesomeIcon icon={faUpload} className="w-3.5 shrink-0" />
                <span>Import files</span>
            </button>
            <input
                ref={importInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={async (event) => {
                    try {
                        await importFiles(event.target.files);
                    } finally {
                        event.target.value = "";
                    }
                }}
            />

            {listedFiles.map((file) => (
                <ContextMenu key={file.id}>
                    <ContextMenuTrigger>
                        <div
                            style={{ cursor: "pointer" }}
                            onClick={() => changeCurrentFile(file.id)}
                            className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                                currentFile === file.id
                                    ? "bg-zinc-700/60 text-zinc-100"
                                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                            }`}
                        >
                            <FontAwesomeIcon
                                icon={getFileIcon(file.name)}
                                className="w-3.5 shrink-0 text-zinc-500"
                            />
                            <span className="min-w-0 truncate">{getDisplayFileName(
                                file.name,
                                isAssignmentEnvironment && isInstructionsFile(file.name),
                            )}</span>
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                        <ContextMenuItem onSelect={() => downloadFile(file)}>
                            <FontAwesomeIcon icon={faDownload} className="w-3.5 shrink-0" />
                            Download
                        </ContextMenuItem>
                        {isReadOnlyInstructions &&
                        isInstructionsFile(file.name) ? (
                            <ContextMenuItem disabled>
                                Locked in assignment
                            </ContextMenuItem>
                        ) : isVirtualInstructionsFile(file) ? (
                            <ContextMenuItem disabled>
                                Locked in assignment
                            </ContextMenuItem>
                        ) : isEnvironmentReadOnly ? (
                            <ContextMenuItem disabled>
                                View-only environment
                            </ContextMenuItem>
                        ) : (
                            <>
                                <RenameContextWindow
                                    renameFile={renameFile}
                                    file={file}
                                />
                                <DeleteContextWindow
                                    deleteFile={deleteFile}
                                    file={file}
                                />
                            </>
                        )}
                    </ContextMenuContent>
                </ContextMenu>
            ))}
        </div>
    );
}

function NewFileDialog({ newFileOpen, setNewFileOpen, createFile, disabled }) {
    const [fileName, setFileName] = useState("");

    const isValid = isValidFileName(fileName);

    useEffect(() => {
        if (!newFileOpen) {
            setFileName("");
        }
    }, [newFileOpen]);

    return (
        <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
            <DialogTrigger asChild>
                <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-500 outline-none transition-colors hover:bg-zinc-800/50 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setNewFileOpen(true)}
                    disabled={disabled}
                >
                    <FontAwesomeIcon icon={faFileCirclePlus} className="w-3.5 shrink-0" />
                    <span>New file</span>
                </button>
            </DialogTrigger>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create a new File</DialogTitle>
                    <DialogDescription>
                        Enter the name of the file that you’d like to create.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2">
                    <Label htmlFor="fileNameInput" className="text-zinc-300">
                        File Name
                    </Label>

                    <div
                        className={cn(
                            "flex items-center gap-2 h-9 rounded-md border bg-transparent px-2.5 py-1 text-sm font-normal shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30 border-input w-full",
                        )}
                    >
                        <FontAwesomeIcon
                            icon={getFileIcon(fileName)}
                            className="text-zinc-400 text-lg shrink-0"
                        />
                        <input
                            id="fileNameInput"
                            value={fileName}
                            onChange={(e) => setFileName(e.target.value)}
                            placeholder="example.txt"
                            className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        className={"px-3"}
                        onClick={() => setNewFileOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="bg-zinc-100 px-5 text-zinc-900 hover:bg-white"
                        onClick={() => createFile(fileName)}
                        disabled={!isValid || fileName.trim().length === 0}
                    >
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteContextWindow({ file, deleteFile }) {
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    return (
        <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <DialogTrigger asChild>
                <ContextMenuItem
                    className="flex gap-2 cursor-pointer"
                    onSelect={(e) => e.preventDefault()}
                >
                    <FontAwesomeIcon icon={faTrash} /> Delete
                </ContextMenuItem>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Are you absolutely sure?</DialogTitle>
                    <DialogDescription>
                        This action cannot be undone. This will permanently
                        delete{" "}
                        <span className="font-bold text-foreground">
                            {file.name}
                        </span>
                        .
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setIsConfirmOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            deleteFile(file.id);
                            setIsConfirmOpen(false);
                        }}
                    >
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RenameContextWindow({ file, renameFile }) {
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const [renamedFileName, setRenamedFileName] = useState("");

    const isValid = isValidFileName(renamedFileName);

    const updateFileName = (e) => {
        setRenamedFileName(e.target.value);
    };

    const renameEFile = () => {
        renameFile(file.id, renamedFileName);
        setIsConfirmOpen(false);
    };

    useEffect(() => {
        setRenamedFileName(file.name);
    }, [file.name]);

    return (
        <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <DialogTrigger asChild>
                <ContextMenuItem
                    className="flex gap-2 cursor-pointer"
                    onSelect={(e) => e.preventDefault()}
                >
                    <FontAwesomeIcon icon={faPenToSquare} /> Rename
                </ContextMenuItem>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rename File</DialogTitle>
                    <DialogDescription>
                        What would you like to rename{" "}
                        <span className="font-bold text-foreground">
                            {file.name}
                        </span>{" "}
                        to?
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2">
                    <Label htmlFor="fileNameInput" className="text-zinc-300">
                        File Name
                    </Label>

                    <div
                        className={cn(
                            "flex items-center gap-2 h-9 rounded-md border bg-transparent px-2.5 py-1 text-sm font-normal shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30 border-input w-full",
                        )}
                    >
                        <FontAwesomeIcon
                            icon={getFileIcon(renamedFileName)}
                            className="text-zinc-400 text-lg shrink-0"
                        />
                        <input
                            id="fileNameInput"
                            value={renamedFileName}
                            onChange={updateFileName}
                            placeholder="example.txt"
                            className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        className={"px-3"}
                        onClick={() => setIsConfirmOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="bg-zinc-100 px-5 text-zinc-900 hover:bg-white"
                        onClick={() => renameEFile()}
                        disabled={
                            !isValid || renamedFileName.trim().length === 0
                        }
                    >
                        Rename
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

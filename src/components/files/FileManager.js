import { useEnvironment } from "@/layout/EnvironmentLayout";
import { getFileIcon } from "./fileUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileCirclePlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isValidFileName } from "./fileUtils";
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

export function FileManager() {
    const { environment, setEnvironment } = useEnvironment();
    const [newFileOpen, setNewFileOpen] = useState(false);
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

            if (prev.ws?.readyState === 1) {
                prev.ws.send(
                    JSON.stringify({
                        type: "fileUpdate",
                        data: {
                            fileId: newId,
                            changes: [],
                            files: updatedFiles,
                            userId: prev.userId,
                        },
                    }),
                );
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

            if (prev.ws?.readyState === 1) {
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

            if (prev.ws?.readyState === 1) {
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

            return {
                ...prev,
                files: updatedFiles,
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
        <div className="flex flex-col gap-2 font-light">
            {pinnedInstructionsFile ? (
                <ContextMenu key={pinnedInstructionsFile.id}>
                    <ContextMenuTrigger>
                        <div
                            style={{ cursor: "pointer" }}
                            onClick={() => changeCurrentFile(pinnedInstructionsFile.id)}
                            className={`flex gap-3 items-center ${
                                currentFile === pinnedInstructionsFile.id
                                    ? "font-bold"
                                    : ""
                            }`}
                        >
                            <FontAwesomeIcon
                                icon={getFileIcon(pinnedInstructionsFile.name)}
                                className="scale-110"
                            />
                            {getDisplayFileName(pinnedInstructionsFile.name, true)}
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
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
                <div className="w-full my-3 h-[1px] bg-zinc-700"></div>
            ) : null}

            <NewFileDialog
                newFileOpen={newFileOpen}
                setNewFileOpen={setNewFileOpen}
                createFile={createFile}
                disabled={isEnvironmentReadOnly}
            />

            {listedFiles.map((file) => (
                <ContextMenu key={file.id}>
                    <ContextMenuTrigger>
                        <div
                            style={{ cursor: "pointer" }}
                            onClick={() => changeCurrentFile(file.id)}
                            className={`flex gap-3 items-center ${
                                currentFile === file.id ? "font-bold" : ""
                            }`}
                        >
                            <FontAwesomeIcon
                                icon={getFileIcon(file.name)}
                                className="scale-110"
                            />
                            {getDisplayFileName(
                                file.name,
                                isAssignmentEnvironment && isInstructionsFile(file.name),
                            )}
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
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
                                {/* Note: We removed the wrapping ContextMenuItem here.
                                The DeleteContextWindow now renders it. */}
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
                    className="flex items-center gap-2 cursor-pointer outline-none"
                    onClick={() => setNewFileOpen(true)}
                    disabled={disabled}
                >
                    <FontAwesomeIcon icon={faFileCirclePlus} />
                    <span>New File</span>
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
                        className={"bg-white px-5"}
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
                    // IMPORTANT: Prevent default closing behavior on select
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
                        className={"bg-white px-5"}
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

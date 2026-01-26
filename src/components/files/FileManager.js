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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";

export function FileManager() {
    const { environment, setEnvironment } = useEnvironment();
    const [newFileOpen, setNewFileOpen] = useState(false);

    const changeCurrentFile = (id) => {
        setEnvironment((prev) => ({ ...prev, currentFile: id }));
    };

    const createFile = (fileName) => {
        const newId = crypto.randomUUID();
        setEnvironment((prev) => ({
            ...prev,
            files: [
                ...environment.files,
                {
                    id: newId,
                    name: fileName,
                    content: "",
                },
            ],
        }));

        changeCurrentFile(newId);
        setNewFileOpen(false);
    };

    const deleteFile = (fileId) => {
        if (environment.currentFile === fileId) {
            setEnvironment((prev) => ({ ...prev, currentFile: null }));
        }
        setEnvironment((prev) => ({
            ...prev,
            files: prev.files.filter((f) => f.id !== fileId),
        }));
    };

    const renameFile = (fileId, newName) => {
        const newfiles = environment.files.map((f) =>
            f.id === fileId ? { ...f, name: newName } : f
        );
        setEnvironment((prev) => ({
            ...prev,
            files: newfiles,
        }));
        environment.ws.send(
            JSON.stringify({
                type: "fileUpdate",
                data: newfiles,
            })
        );
    };

    const currentFile = environment.currentFile;

    return (
        <div className="flex flex-col gap-2 font-light">
            <NewFileDialog
                newFileOpen={newFileOpen}
                setNewFileOpen={setNewFileOpen}
                createFile={createFile}
            />

            <div className="w-full my-3 h-[1px] bg-zinc-700"></div>

            {environment?.files?.map((file) => (
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
                            {file.name}
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
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
                    </ContextMenuContent>
                </ContextMenu>
            ))}
        </div>
    );
}

function NewFileDialog({ newFileOpen, setNewFileOpen, createFile }) {
    const [fileName, setFileName] = useState("");
    const [isDisabled, setDisabled] = useState(false);
    const [isInvalid, setInvalid] = useState(false);

    const isValid = isValidFileName(fileName);

    return (
        <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
            <DialogTrigger asChild>
                <button
                    className="flex items-center gap-2 cursor-pointer outline-none"
                    onClick={() => setNewFileOpen(true)}
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
                            isInvalid &&
                                "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50",
                            isDisabled &&
                                "opacity-50 pointer-events-none cursor-not-allowed"
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
                            disabled={isDisabled}
                            aria-invalid={isInvalid}
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
    const [isDisabled, setDisabled] = useState(false);
    const [isInvalid, setInvalid] = useState(false);

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
                            isInvalid &&
                                "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50",
                            isDisabled &&
                                "opacity-50 pointer-events-none cursor-not-allowed"
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
                            disabled={isDisabled}
                            aria-invalid={isInvalid}
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

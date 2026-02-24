"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useParams } from "next/navigation";
import axios from "axios";

const PYTHON_ERROR_HINTS = {
    SyntaxError: {
        title: "Syntax issue",
        explanation:
            "Python could not understand the structure of your code at this line.",
        suggestion:
            "Check punctuation, brackets, quotes, and missing colons near the reported line.",
    },
    NameError: {
        title: "Unknown name",
        explanation:
            "You used a variable or function name that Python does not know yet.",
        suggestion: "Make sure the name is spelled correctly and defined before use.",
    },
    TypeError: {
        title: "Type mismatch",
        explanation: "An operation is being used with incompatible value types.",
        suggestion:
            "Check what each variable contains right before the failing line.",
    },
    ValueError: {
        title: "Invalid value",
        explanation:
            "The value is the right type, but its content is not valid for this operation.",
        suggestion:
            "Inspect input values and conversions (e.g. int(), float(), list indexing).",
    },
    IndexError: {
        title: "Index out of range",
        explanation: "You tried to access a list position that does not exist.",
        suggestion: "Check list length and loop/index boundaries.",
    },
    KeyError: {
        title: "Missing dictionary key",
        explanation: "The dictionary does not contain the key you requested.",
        suggestion: "Use `.get()` or check key existence before indexing.",
    },
    AttributeError: {
        title: "Missing attribute",
        explanation: "You called a method/attribute that does not exist on that object.",
        suggestion:
            "Print the object's type and verify the method/property name.",
    },
    IndentationError: {
        title: "Indentation problem",
        explanation: "Python blocks are defined by indentation, and this one is invalid.",
        suggestion:
            "Use consistent spaces (prefer 4 spaces per level), not mixed tabs/spaces.",
    },
    ModuleNotFoundError: {
        title: "Module not found",
        explanation: "Python cannot import the module in this environment.",
        suggestion:
            "Check import spelling and whether the library is available in the runtime.",
    },
    ZeroDivisionError: {
        title: "Division by zero",
        explanation: "A denominator evaluated to zero.",
        suggestion: "Guard division with an if-check before calculating.",
    },
};

function mergePresenceUsers(currentUsers, incomingUser) {
    const normalizedIncomingId = incomingUser?.id;
    if (!normalizedIncomingId) {
        return Array.isArray(currentUsers) ? currentUsers : [];
    }

    const current = Array.isArray(currentUsers) ? currentUsers : [];
    const existingIndex = current.findIndex((entry) => entry.id === normalizedIncomingId);
    if (existingIndex === -1) {
        return [...current, incomingUser];
    }

    const updated = [...current];
    updated[existingIndex] = {
        ...updated[existingIndex],
        ...incomingUser,
    };
    return updated;
}

function normalizePresenceList(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((entry) => Boolean(entry?.id));
}

function parseLastPythonError(consoleText = "") {
    const normalized = `${consoleText || ""}`;
    const match = normalized.match(
        /(SyntaxError|NameError|TypeError|ValueError|IndexError|KeyError|AttributeError|IndentationError|ModuleNotFoundError|ZeroDivisionError):\s*(.+)/g,
    );
    if (!match || match.length === 0) {
        return null;
    }

    const lastLine = match.at(-1) || "";
    const typeMatch = lastLine.match(
        /(SyntaxError|NameError|TypeError|ValueError|IndexError|KeyError|AttributeError|IndentationError|ModuleNotFoundError|ZeroDivisionError):\s*(.+)/,
    );
    if (!typeMatch) {
        return null;
    }

    const lineMatch = normalized.match(/line (\d+)/g);
    const lastLineRef = lineMatch?.length
        ? Number((lineMatch.at(-1) || "").replace(/[^\d]/g, ""))
        : null;

    return {
        type: typeMatch[1],
        message: typeMatch[2],
        line: Number.isFinite(lastLineRef) ? lastLineRef : null,
    };
}

function createFriendlyHintFromConsole(consoleText, fallbackErrorText = "") {
    const pythonError = parseLastPythonError(consoleText);
    if (pythonError) {
        const hint = PYTHON_ERROR_HINTS[pythonError.type];
        if (hint) {
            return {
                ...hint,
                type: pythonError.type,
                message: pythonError.message,
                line: pythonError.line,
            };
        }
    }

    if (fallbackErrorText) {
        return {
            title: "Runtime error",
            explanation: "The program failed before completing successfully.",
            suggestion:
                "Read the latest console output, then test one small fix at a time.",
            type: "RuntimeError",
            message: fallbackErrorText,
            line: null,
        };
    }

    return null;
}

function formatDuration(startedAt, endedAt) {
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
        return null;
    }
    return Math.max(0, endedAt - startedAt);
}

export function EnvironmentManager() {
    const params = useParams();
    const environmentId = Array.isArray(params.environmentId)
        ? params.environmentId[0]
        : params.environmentId;
    const { environment, setEnvironment } = useEnvironment();
    const [clientId] = useState(() => {
        if (
            typeof window !== "undefined" &&
            typeof window.crypto?.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        return `${Date.now()}-${Math.random()}`;
    });

    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const manualDisconnectRef = useRef(false);
    const viewerNameRef = useRef("");
    const [wsUri, setWsUri] = useState(null);

    useEffect(() => {
        viewerNameRef.current =
            typeof environment?.viewerName === "string"
                ? environment.viewerName
                : "";
    }, [environment?.viewerName]);

    useEffect(() => {
        let cancelled = false;

        const fetchWsUri = async () => {
            try {
                const res = await axios.get("/api/config/wsuri");
                if (!cancelled) {
                    setWsUri(res?.data?.URI || null);
                }
            } catch (err) {
                console.error("Failed to fetch WebSocket URI:", err);
            }
        };

        fetchWsUri();
        return () => {
            cancelled = true;
        };
    }, []);

    const connectWebSocket = useCallback(() => {
        if (!environmentId || !wsUri) return;

        manualDisconnectRef.current = false;
        const nameParam = viewerNameRef.current
            ? `&name=${encodeURIComponent(viewerNameRef.current)}`
            : "";
        const ws = new WebSocket(
            `${wsUri}?env=${environmentId}&client=${clientId}${nameParam}`,
        );
        wsRef.current = ws;

        ws.onopen = () => {
            if (wsRef.current !== ws) {
                try {
                    ws.close();
                } catch {
                    // Ignore close errors.
                }
                return;
            }
            reconnectAttemptsRef.current = 0;
            setEnvironment((prev) => ({
                ...prev,
                ws,
                sync: {
                    pendingCount: prev?.sync?.pendingCount || 0,
                    lastSavedAt: prev?.sync?.lastSavedAt || null,
                    status: "saved",
                },
            }));
        };

        ws.onmessage = (event) => {
            if (wsRef.current !== ws) {
                return;
            }

            let parsedData;
            try {
                parsedData = JSON.parse(event.data);
            } catch (error) {
                console.error("Invalid websocket message payload:", error);
                return;
            }

            switch (parsedData.type) {
                case "welcome":
                    setEnvironment((prev) => ({
                        ...prev,
                        id: environmentId,
                        files: Array.isArray(parsedData?.data?.files)
                            ? [...parsedData.data.files]
                            : [],
                        clientId,
                        userId: parsedData?.data?.userId || clientId,
                        viewerName:
                            prev.viewerName ||
                            parsedData?.data?.userName ||
                            viewerNameRef.current ||
                            "User",
                        onlineUsers: Array.isArray(parsedData?.data?.onlineUsers)
                            ? parsedData.data.onlineUsers
                            : prev.onlineUsers || [],
                        remoteCursors: [],
                        sync: {
                            pendingCount: 0,
                            lastSavedAt: prev?.sync?.lastSavedAt || null,
                            status: "saved",
                        },
                    }));
                    break;

                case "programOutput":
                    setEnvironment((prev) => ({
                        ...prev,
                        console: (prev.console || "") + parsedData.data,
                    }));
                    break;

                case "stdinEcho":
                    setEnvironment((prev) => ({
                        ...prev,
                        console: (prev.console || "") + (parsedData?.data?.input || ""),
                    }));
                    break;

                case "programExit":
                    setEnvironment((prev) => {
                        const startedAt =
                            prev?.runFeedback?.startedAt || Date.now();
                        const endedAt = Date.now();
                        const durationMs = formatDuration(startedAt, endedAt);
                        const exitCode = parsedData?.data?.exitCode;
                        const nextConsole =
                            (prev.console || "") +
                            `\n[Process exited with code ${exitCode}]\n`;
                        const helper =
                            exitCode === 0
                                ? null
                                : createFriendlyHintFromConsole(nextConsole);

                        return {
                            ...prev,
                            console: nextConsole,
                            isRunning: false,
                            runFeedback: {
                                status: exitCode === 0 ? "completed" : "error",
                                startedAt,
                                endedAt,
                                durationMs,
                                exitCode,
                                helper,
                            },
                        };
                    });
                    break;

                case "programError":
                    setEnvironment((prev) => {
                        const startedAt =
                            prev?.runFeedback?.startedAt || Date.now();
                        const endedAt = Date.now();
                        const durationMs = formatDuration(startedAt, endedAt);
                        const nextConsole =
                            (prev.console || "") +
                            `\n[Error: ${parsedData.data}]\n`;
                        const helper = createFriendlyHintFromConsole(
                            nextConsole,
                            parsedData.data,
                        );

                        return {
                            ...prev,
                            console: nextConsole,
                            isRunning: false,
                            runFeedback: {
                                status: "error",
                                startedAt,
                                endedAt,
                                durationMs,
                                exitCode: null,
                                helper,
                            },
                        };
                    });
                    break;

                case "stopped":
                    setEnvironment((prev) => {
                        const startedAt =
                            prev?.runFeedback?.startedAt || Date.now();
                        const endedAt = Date.now();
                        const durationMs = formatDuration(startedAt, endedAt);

                        return {
                            ...prev,
                            console:
                                (prev.console || "") +
                                `\n[Session stopped: ${parsedData.data.reason}]\n`,
                            isRunning: false,
                            lastStopped: parsedData.data.time,
                            runFeedback: {
                                status: "stopped",
                                startedAt,
                                endedAt,
                                durationMs,
                                exitCode: null,
                                helper: null,
                            },
                        };
                    });
                    break;

                case "fileUpdate": {
                    const fileUpdate = parsedData.data;
                    if (!Array.isArray(fileUpdate?.files)) {
                        break;
                    }

                    setEnvironment((prev) => {
                        const pendingCount = Number.isFinite(prev?.sync?.pendingCount)
                            ? prev.sync.pendingCount
                            : 0;

                        return {
                            ...prev,
                            files: fileUpdate.files,
                            pendingFileUpdate: fileUpdate,
                            sync: {
                                pendingCount,
                                lastSavedAt: prev?.sync?.lastSavedAt || null,
                                status: pendingCount > 0 ? "saving" : "saved",
                            },
                        };
                    });
                    break;
                }

                case "fileUpdateAck": {
                    setEnvironment((prev) => {
                        const pendingCount = Math.max(
                            0,
                            (Number.isFinite(prev?.sync?.pendingCount)
                                ? prev.sync.pendingCount
                                : 0) - 1,
                        );
                        const updatedAt =
                            Number.isFinite(parsedData?.data?.updatedAt)
                                ? parsedData.data.updatedAt
                                : Date.now();

                        return {
                            ...prev,
                            sync: {
                                pendingCount,
                                lastSavedAt: pendingCount === 0
                                    ? updatedAt
                                    : prev?.sync?.lastSavedAt || null,
                                status: pendingCount > 0 ? "saving" : "saved",
                            },
                        };
                    });
                    break;
                }

                case "runProcessingStarted":
                    setEnvironment((prev) => {
                        if (parsedData.data.time <= (prev.lastStopped || 0)) {
                            return prev;
                        }

                        return {
                            ...prev,
                            isRunning: true,
                            console: "",
                            runFeedback: {
                                status: "running",
                                startedAt: parsedData.data.time,
                                endedAt: null,
                                durationMs: null,
                                exitCode: null,
                                helper: null,
                            },
                        };
                    });
                    break;

                case "cursorRemove": {
                    const cursorId = parsedData.data.id;
                    setEnvironment((prev) => ({
                        ...prev,
                        remoteCursors: (prev.remoteCursors || []).filter(
                            (cursor) => cursor.id !== cursorId,
                        ),
                    }));
                    break;
                }

                case "cursorUpdate": {
                    const rawCursor = parsedData.data;
                    const incomingId = rawCursor.userId || rawCursor.id;

                    if (!incomingId) {
                        break;
                    }

                    setEnvironment((prev) => {
                        const newCursor = {
                            ...rawCursor,
                            id: incomingId,
                        };

                        const currentCursors = Array.isArray(prev.remoteCursors)
                            ? prev.remoteCursors
                            : [];

                        const index = currentCursors.findIndex(
                            (c) => c.id === newCursor.id,
                        );

                        let updatedCursors;
                        if (index !== -1) {
                            updatedCursors = [...currentCursors];
                            updatedCursors[index] = newCursor;
                        } else {
                            updatedCursors = [...currentCursors, newCursor];
                        }

                        return {
                            ...prev,
                            remoteCursors: updatedCursors,
                        };
                    });
                    break;
                }

                case "presenceUpdate":
                    setEnvironment((prev) => ({
                        ...prev,
                        onlineUsers: mergePresenceUsers(
                            prev.onlineUsers,
                            parsedData.data,
                        ),
                    }));
                    break;

                case "presenceRemove":
                    setEnvironment((prev) => ({
                        ...prev,
                        onlineUsers: Array.isArray(prev.onlineUsers)
                            ? prev.onlineUsers.filter(
                                  (entry) => entry.id !== parsedData?.data?.id,
                              )
                            : [],
                    }));
                    break;

                case "presenceSnapshot":
                    setEnvironment((prev) => {
                        const onlineUsers = normalizePresenceList(
                            parsedData?.data?.onlineUsers,
                        );
                        const activeIds = new Set(
                            onlineUsers.map((entry) => entry.id),
                        );
                        const remoteCursors = Array.isArray(prev.remoteCursors)
                            ? prev.remoteCursors.filter(
                                  (cursor) => activeIds.has(cursor?.id),
                              )
                            : [];

                        return {
                            ...prev,
                            onlineUsers,
                            remoteCursors,
                        };
                    });
                    break;

                case "pong":
                    break;

                default:
                    break;
            }
        };

        ws.onerror = (error) => {
            if (wsRef.current !== ws) {
                return;
            }
            console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
            if (wsRef.current !== ws) {
                return;
            }

            setEnvironment((prev) => {
                const selfId = prev?.userId;
                const onlineUsers = Array.isArray(prev?.onlineUsers)
                    ? prev.onlineUsers.filter((entry) => entry?.id === selfId)
                    : [];
                return {
                    ...prev,
                    ws: null,
                    onlineUsers,
                    remoteCursors: [],
                    sync: {
                        pendingCount: 0,
                        lastSavedAt: prev?.sync?.lastSavedAt || null,
                        status: "offline",
                    },
                };
            });
            wsRef.current = null;

            if (!manualDisconnectRef.current) {
                const retryDelay = Math.min(
                    1000 * Math.pow(2, reconnectAttemptsRef.current),
                    10000,
                );

                reconnectTimeoutRef.current = setTimeout(() => {
                    reconnectAttemptsRef.current += 1;
                    connectWebSocket();
                }, retryDelay);
            }
        };
    }, [environmentId, wsUri, setEnvironment, clientId]);

    useEffect(() => {
        if (!environmentId || !wsUri) return;

        connectWebSocket();

        return () => {
            manualDisconnectRef.current = true;
            if (reconnectTimeoutRef.current)
                clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) wsRef.current.close();
            wsRef.current = null;
        };
    }, [environmentId, wsUri, connectWebSocket]);

    useEffect(() => {
        if (!environment?.ws || environment.ws.readyState !== 1) {
            return;
        }

        if (!environment?.viewerName) {
            return;
        }

        environment.ws.send(
            JSON.stringify({
                type: "presenceUpdate",
                data: {
                    userName: environment.viewerName,
                },
            }),
        );
    }, [environment?.viewerName, environment?.ws]);

    useEffect(() => {
        if (!environment?.ws || environment.ws.readyState !== 1) {
            return;
        }

        const intervalId = setInterval(() => {
            if (environment.ws.readyState !== 1) {
                return;
            }

            environment.ws.send(
                JSON.stringify({
                    type: "ping",
                    data: { time: Date.now() },
                }),
            );
        }, 15000);

        return () => clearInterval(intervalId);
    }, [environment?.ws]);

    useEffect(() => {
        setEnvironment((prev) => {
            if (
                prev.currentFile ||
                !Array.isArray(prev.files) ||
                prev.files.length === 0
            ) {
                return prev;
            }

            return {
                ...prev,
                currentFile: prev.files[0].id,
            };
        });
    }, [environment?.files, environment?.currentFile, setEnvironment]);

    return null;
}

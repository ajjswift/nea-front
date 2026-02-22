"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useParams } from "next/navigation";
import axios from "axios";

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
    const [wsUri, setWsUri] = useState(null);

    // Fetch WebSocket URL **once** on page load
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

    // Manage WebSocket + autoreconnect
    const connectWebSocket = useCallback(() => {
        if (!environmentId || !wsUri) return;

        manualDisconnectRef.current = false;
        const ws = new WebSocket(
            `${wsUri}?env=${environmentId}&client=${clientId}`,
        );
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WebSocket connected");
            reconnectAttemptsRef.current = 0;
            setEnvironment((prev) => ({ ...prev, ws }));
        };

        ws.onmessage = (event) => {
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
                        clientId: clientId,
                        userId: parsedData.data.userId || clientId,
                    }));
                    break;

                case "programOutput":
                    setEnvironment((prev) => ({
                        ...prev,
                        console: (prev.console || "") + parsedData.data,
                    }));
                    break;

                case "programExit":
                    setEnvironment((prev) => ({
                        ...prev,
                        console:
                            (prev.console || "") +
                            `\n[Process exited with code ${parsedData.data.exitCode}]\n`,
                        isRunning: false,
                    }));
                    break;

                case "programError":
                    setEnvironment((prev) => ({
                        ...prev,
                        console:
                            (prev.console || "") +
                            `\n[Error: ${parsedData.data}]\n`,
                        isRunning: false,
                    }));
                    break;

                case "stopped":
                    setEnvironment((prev) => ({
                        ...prev,
                        console:
                            (prev.console || "") +
                            `\n[Session stopped: ${parsedData.data.reason}]\n`,
                        isRunning: false,
                        lastStopped: parsedData.data.time,
                    }));
                    break;

                case "fileUpdate":
                    const fileUpdate = parsedData.data;
                    if (!Array.isArray(fileUpdate?.files)) {
                        break;
                    }

                    setEnvironment((prev) => ({
                        ...prev,
                        files: fileUpdate.files,
                        pendingFileUpdate: fileUpdate,
                    }));
                    break;

                case "runProcessingStarted":
                    setEnvironment((prev) => {
                        if (parsedData.data.time <= (prev.lastStopped || 0)) {
                            return prev;
                        }

                        console.log("Set running to true, cleared terminal");
                        return {
                            ...prev,
                            isRunning: true,
                            console: "",
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
                        console.warn(
                            "Received cursorUpdate without a userId/id",
                            rawCursor,
                        );
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

                default:
                    console.warn("Unknown message type:", parsedData.type);
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
        };

        ws.onclose = (event) => {
            console.log("WebSocket disconnected:", event.reason || "no reason");
            setEnvironment((prev) => ({ ...prev, ws: null }));
            wsRef.current = null;

            // Auto-reconnect only if this wasn't an intentional close.
            if (!manualDisconnectRef.current && !event.wasClean) {
                const retryDelay = Math.min(
                    1000 * Math.pow(2, reconnectAttemptsRef.current),
                    10000,
                );
                console.log(`Reconnecting in ${retryDelay / 1000}s...`);

                reconnectTimeoutRef.current = setTimeout(() => {
                    reconnectAttemptsRef.current += 1;
                    connectWebSocket();
                }, retryDelay);
            }
        };
    }, [environmentId, wsUri, setEnvironment, clientId]);

    // Connect and handle cleanup
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
        setEnvironment((prev) => {
            if (prev.currentFile || !Array.isArray(prev.files) || prev.files.length === 0) {
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

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useParams } from "next/navigation";
import axios from "axios";

export function EnvironmentManager() {
    const params = useParams();
    const environmentId = params.environmentId;
    const { environment, setEnvironment } = useEnvironment();

    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
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

        const clientId = crypto.randomUUID();

        const ws = new WebSocket(
            `${wsUri}?env=${environmentId}&client=${clientId}`,
        );
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WebSocket connected");
            setReconnectAttempts(0);
            setEnvironment((prev) => ({ ...prev, ws }));
        };

        ws.onmessage = (event) => {
            const parsedData = JSON.parse(event.data);
            console.log(parsedData);

            switch (parsedData.type) {
                case "welcome":
                    setEnvironment((prev) => ({
                        ...prev,
                        files: [...parsedData.data.files],
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
                    }));
                    break;

                case "fileUpdate":
                    const fileUpdate = parsedData.data;

                    setEnvironment((prev) => ({
                        ...prev,
                        files: fileUpdate.files,
                        pendingFileUpdate: fileUpdate,
                    }));
                    break;

                case "runProcessingStarted":
                    if (
                        parsedData.data.time > (environment?.lastStopped || 0)
                    ) {
                        setEnvironment((prev) => ({
                            ...prev,
                            isRunning: true,
                            console: "",
                        }));
                        console.log("Set running to true, cleared terminal");
                    }

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

                case "stopped":
                    setEnvironment((prev) => ({
                        ...prev,
                        lastStopped: parsedData.data.time,
                    }));
                    break;

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

            // Auto-reconnect only if not a clean close
            if (!event.wasClean) {
                const retryDelay = Math.min(
                    1000 * Math.pow(2, reconnectAttempts),
                    10000,
                );
                console.log(`Reconnecting in ${retryDelay / 1000}s...`);

                reconnectTimeoutRef.current = setTimeout(() => {
                    setReconnectAttempts((x) => x + 1);
                    connectWebSocket();
                }, retryDelay);
            }
        };
    }, [environmentId, wsUri, setEnvironment, reconnectAttempts]);

    // Connect and handle cleanup
    useEffect(() => {
        if (!environmentId || !wsUri) return;

        connectWebSocket();

        return () => {
            if (reconnectTimeoutRef.current)
                clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) wsRef.current.close();
            wsRef.current = null;
        };
    }, [environmentId, wsUri, connectWebSocket]);

    useEffect(() => {
        if (!environment.currentFile && environment?.files?.length > 0) {
            setEnvironment((prev) => ({
                ...prev,
                currentFile: environment.files[0].id,
            }));
        }
    }, [environment, setEnvironment]);

    return null;
}

"use client";

import { useEffect, useMemo, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export const ENVIRONMENT_FILES_KEY = "files";

export function buildEnvironmentRoomId(environmentId) {
    const normalized = `${environmentId || ""}`.trim();
    if (!normalized) {
        return "";
    }
    return `environment:${normalized}`;
}

export function getYjsServerUrl(wsUri) {
    const normalized = `${wsUri || ""}`.replace(/\/+$/, "");
    return normalized ? `${normalized}/yjs` : "";
}

export function getFilesArray(doc) {
    return doc.getArray(ENVIRONMENT_FILES_KEY);
}

export function readFilesFromDoc(doc) {
    return getFilesArray(doc).toArray().map((file) => ({ ...file }));
}

export function replaceFilesInDoc(doc, files, origin = "local") {
    const nextFiles = Array.isArray(files) ? files : [];
    const yFiles = getFilesArray(doc);

    doc.transact(() => {
        yFiles.delete(0, yFiles.length);
        yFiles.insert(0, nextFiles.map((file) => ({ ...file })));
    }, origin);
}

function mapAwarenessStates(states, localClientId) {
    return Array.from(states.entries())
        .map(([clientId, state]) => ({
            id: state?.user?.id || `${clientId}`,
            userName: state?.user?.name || "User",
            cursor: state?.cursor || null,
            yClientId: clientId,
        }))
        .filter((entry) => entry.yClientId !== localClientId);
}

export function useYjsEnvironmentCollaboration({
    environmentId,
    wsUri,
    token,
    userId,
    userName,
    setEnvironment,
}) {
    const docRef = useRef(null);
    const providerRef = useRef(null);
    const isApplyingYjsUpdateRef = useRef(false);
    const roomId = useMemo(
        () => buildEnvironmentRoomId(environmentId),
        [environmentId],
    );
    const serverUrl = useMemo(() => getYjsServerUrl(wsUri), [wsUri]);

    useEffect(() => {
        if (!roomId || !serverUrl || !token) {
            return undefined;
        }

        const doc = new Y.Doc();
        const provider = new WebsocketProvider(serverUrl, roomId, doc, {
            params: { token },
        });
        const files = getFilesArray(doc);

        docRef.current = doc;
        providerRef.current = provider;

        const applyFilesToState = () => {
            const nextFiles = readFilesFromDoc(doc);
            isApplyingYjsUpdateRef.current = true;
            setEnvironment((prev) => ({
                ...prev,
                ydoc: doc,
                yProvider: provider,
                yRoomId: roomId,
                files: nextFiles,
                sync: {
                    pendingCount: 0,
                    lastSavedAt: Date.now(),
                    status: provider.wsconnected ? "saved" : "connecting",
                },
            }));
            queueMicrotask(() => {
                isApplyingYjsUpdateRef.current = false;
            });
        };

        const updateAwarenessState = () => {
            const awarenessEntries = mapAwarenessStates(
                provider.awareness.getStates(),
                doc.clientID,
            );
            setEnvironment((prev) => ({
                ...prev,
                onlineUsers: [
                    {
                        id: userId || `${doc.clientID}`,
                        userName: userName || "User",
                    },
                    ...awarenessEntries.map((entry) => ({
                        id: entry.id,
                        userName: entry.userName,
                    })),
                ],
                remoteCursors: awarenessEntries
                    .filter((entry) => entry.cursor)
                    .map((entry) => ({
                        id: entry.id,
                        userName: entry.userName,
                        ...entry.cursor,
                    })),
            }));
        };

        const setStatus = ({ status }) => {
            setEnvironment((prev) => ({
                ...prev,
                ydoc: doc,
                yProvider: provider,
                yRoomId: roomId,
                sync: {
                    pendingCount: 0,
                    lastSavedAt: prev?.sync?.lastSavedAt || null,
                    status: status === "connected" ? "saved" : "connecting",
                },
            }));
        };

        provider.awareness.setLocalStateField("user", {
            id: userId || `${doc.clientID}`,
            name: userName || "User",
        });
        files.observe(applyFilesToState);
        provider.awareness.on("change", updateAwarenessState);
        provider.on("status", setStatus);

        setEnvironment((prev) => ({
            ...prev,
            ydoc: doc,
            yProvider: provider,
            yRoomId: roomId,
            sync: {
                pendingCount: 0,
                lastSavedAt: prev?.sync?.lastSavedAt || null,
                status: "connecting",
            },
        }));
        updateAwarenessState();

        return () => {
            files.unobserve(applyFilesToState);
            provider.awareness.off("change", updateAwarenessState);
            provider.off("status", setStatus);
            provider.awareness.setLocalState(null);
            provider.destroy();
            doc.destroy();
            if (docRef.current === doc) {
                docRef.current = null;
                providerRef.current = null;
            }
            setEnvironment((prev) => ({
                ...prev,
                ydoc: null,
                yProvider: null,
                yRoomId: null,
                onlineUsers: [],
                remoteCursors: [],
                sync: {
                    pendingCount: 0,
                    lastSavedAt: prev?.sync?.lastSavedAt || null,
                    status: "offline",
                },
            }));
        };
    }, [roomId, serverUrl, token, userId, userName, setEnvironment]);

    useEffect(() => {
        const provider = providerRef.current;
        const doc = docRef.current;
        if (!provider || !doc) {
            return;
        }

        provider.awareness.setLocalStateField("user", {
            id: userId || `${doc.clientID}`,
            name: userName || "User",
        });
    }, [userId, userName]);

    return {
        docRef,
        providerRef,
        isApplyingYjsUpdateRef,
        roomId,
    };
}

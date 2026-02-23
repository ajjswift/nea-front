import { NextResponse } from "next/server";
import db from "@/utils/pg";
import { SessionService } from "@/lib/auth/SessionService";
import { EnvironmentRepository } from "@/lib/environments/EnvironmentRepository";
import { EnvironmentService } from "@/lib/environments/EnvironmentService";
import { ClassroomRepository } from "@/lib/classroom/ClassroomRepository";
import { ClassroomService } from "@/lib/classroom/ClassroomService";

const sessionService = new SessionService(db);
const environmentRepository = new EnvironmentRepository(db);
const environmentService = new EnvironmentService(environmentRepository);
const classroomRepository = new ClassroomRepository(db);
const classroomService = new ClassroomService({
    classroomRepository,
    database: db,
});

const SUPPORTED_ACTIONS = new Set(["format", "lint"]);

function isMissingTableError(error) {
    return error?.code === "42P01";
}

function normalizeEnvironmentId(params) {
    const rawValue = params?.environmentId;
    return Array.isArray(rawValue) ? rawValue[0] : rawValue;
}

function normalizeRequestPayload(payload = {}) {
    const action =
        typeof payload?.action === "string" ? payload.action.trim().toLowerCase() : "";
    const fileName =
        typeof payload?.fileName === "string" ? payload.fileName.trim() : "";
    const source =
        typeof payload?.source === "string" ? payload.source : `${payload?.source ?? ""}`;

    if (!SUPPORTED_ACTIONS.has(action)) {
        throw new Error("action must be one of: format, lint.");
    }

    if (!fileName) {
        throw new Error("fileName is required.");
    }

    if (!fileName.toLowerCase().endsWith(".py")) {
        throw new Error("Only Python files (.py) are supported.");
    }

    if (Buffer.byteLength(source, "utf8") > 250000) {
        throw new Error("Source is too large.");
    }

    return { action, fileName, source };
}

function resolveSocketInternalEndpoint(action) {
    const wsUrl = process.env.WEBSOCKET_URL;
    if (!wsUrl) {
        return null;
    }

    try {
        const parsed = new URL(wsUrl);
        if (parsed.protocol === "ws:") {
            parsed.protocol = "http:";
        } else if (parsed.protocol === "wss:") {
            parsed.protocol = "https:";
        }

        parsed.pathname = `/internal/python/${action}`;
        parsed.search = "";
        return parsed.toString();
    } catch {
        return null;
    }
}

async function resolveAccessContext(request, environmentId) {
    const user = await sessionService.getAuthenticatedUser(request);

    let assignmentContext = null;
    try {
        assignmentContext =
            await classroomRepository.findAssignmentEnvironmentContext(environmentId);
    } catch (error) {
        if (!isMissingTableError(error)) {
            throw error;
        }
        assignmentContext = null;
    }

    const isAssignmentEnvironment = Boolean(assignmentContext);

    if (!user) {
        return {
            user: null,
            assignmentContext,
            isAssignmentEnvironment,
            canView: isAssignmentEnvironment,
            canEdit: false,
        };
    }

    let canView = false;
    const ownedEnvironment = await environmentService.getForUser(
        user.userId,
        environmentId,
    );

    if (ownedEnvironment) {
        canView = true;
    } else if (user.role === "teacher") {
        canView = await classroomService.canTeacherAccessEnvironment(
            user,
            environmentId,
        );
    }

    if (
        !canView &&
        isAssignmentEnvironment &&
        user.role === "student" &&
        assignmentContext?.student_id === user.userId
    ) {
        canView = true;
    }

    return {
        user,
        assignmentContext,
        isAssignmentEnvironment,
        canView,
        canEdit: canView,
    };
}

export async function POST(request, { params }) {
    try {
        const resolvedParams = await params;
        const environmentId = normalizeEnvironmentId(resolvedParams);
        if (!environmentId) {
            return NextResponse.json(
                { error: "Environment ID is required." },
                { status: 400 },
            );
        }

        let body = {};
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON payload." },
                { status: 400 },
            );
        }

        let payload;
        try {
            payload = normalizeRequestPayload(body);
        } catch (error) {
            return NextResponse.json(
                { error: error.message || "Invalid request payload." },
                { status: 400 },
            );
        }

        const access = await resolveAccessContext(request, environmentId);
        if (!access.canView) {
            return NextResponse.json({ error: "Environment not found." }, { status: 404 });
        }

        if (payload.action === "format" && !access.canEdit) {
            return NextResponse.json({ error: "Forbidden." }, { status: 403 });
        }

        const endpoint = resolveSocketInternalEndpoint(payload.action);
        if (!endpoint) {
            return NextResponse.json(
                { error: "Python tooling is unavailable because WEBSOCKET_URL is not configured." },
                { status: 500 },
            );
        }

        const proxyResponse = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName: payload.fileName,
                source: payload.source,
            }),
            cache: "no-store",
        });

        let proxyPayload = null;
        try {
            proxyPayload = await proxyResponse.json();
        } catch {
            proxyPayload = null;
        }

        if (!proxyResponse.ok) {
            return NextResponse.json(
                { error: proxyPayload?.error || "Python tooling request failed." },
                { status: proxyResponse.status || 500 },
            );
        }

        return NextResponse.json(proxyPayload || {}, { status: 200 });
    } catch (error) {
        console.error("Python tools request failed:", error);

        if (isMissingTableError(error)) {
            return NextResponse.json(
                {
                    error: "Required classroom tables are missing.",
                },
                { status: 500 },
            );
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

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

function isMissingTableError(error) {
    return error?.code === "42P01";
}

function normalizeEnvironmentId(params) {
    const rawValue = params?.environmentId;
    return Array.isArray(rawValue) ? rawValue[0] : rawValue;
}

function normalizeTestCases(value) {
    const rawCases = Array.isArray(value) ? value : [];
    return rawCases
        .map((entry, index) => ({
            id:
                typeof entry?.id === "string" && entry.id.trim()
                    ? entry.id.trim()
                    : `case-${index + 1}`,
            name:
                typeof entry?.name === "string" && entry.name.trim()
                    ? entry.name.trim().slice(0, 120)
                    : `Test ${index + 1}`,
            input:
                typeof entry?.input === "string"
                    ? entry.input.slice(0, 4000)
                    : "",
            expectedOutput:
                typeof entry?.expectedOutput === "string"
                    ? entry.expectedOutput.slice(0, 8000)
                    : "",
        }))
        .slice(0, 25);
}

function normalizeFiles(value) {
    const rawFiles = Array.isArray(value) ? value : [];
    if (rawFiles.length === 0) {
        throw new Error("files are required.");
    }

    return rawFiles
        .map((file) => {
            const name =
                typeof file?.name === "string" ? file.name.trim().slice(0, 160) : "";
            if (!name) {
                return null;
            }

            return {
                name,
                content:
                    typeof file?.content === "string"
                        ? file.content.slice(0, 150000)
                        : `${file?.content ?? ""}`.slice(0, 150000),
            };
        })
        .filter(Boolean)
        .slice(0, 60);
}

function resolveSocketInternalEndpoint() {
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

        parsed.pathname = "/internal/python/run-tests";
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
            canView: isAssignmentEnvironment,
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
        canView,
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

        const access = await resolveAccessContext(request, environmentId);
        if (!access.canView) {
            return NextResponse.json({ error: "Environment not found." }, { status: 404 });
        }

        if (!access.assignmentContext) {
            return NextResponse.json(
                { error: "Assignment tests are only available in assignment environments." },
                { status: 400 },
            );
        }

        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        let files = [];
        try {
            files = normalizeFiles(body?.files);
        } catch (error) {
            return NextResponse.json(
                { error: error.message || "Invalid files payload." },
                { status: 400 },
            );
        }

        const testCases = normalizeTestCases(access.assignmentContext.test_cases_json);
        if (testCases.length === 0) {
            return NextResponse.json(
                {
                    summary: {
                        total: 0,
                        passed: 0,
                        failed: 0,
                    },
                    results: [],
                },
                { status: 200 },
            );
        }

        const endpoint = resolveSocketInternalEndpoint();
        if (!endpoint) {
            return NextResponse.json(
                {
                    error: "Test runner is unavailable because WEBSOCKET_URL is not configured.",
                },
                { status: 500 },
            );
        }

        const proxyResponse = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                files,
                testCases,
                entryFile:
                    typeof body?.entryFile === "string" ? body.entryFile.trim() : "",
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
                { error: proxyPayload?.error || "Test run failed." },
                { status: proxyResponse.status || 500 },
            );
        }

        return NextResponse.json(proxyPayload || {}, { status: 200 });
    } catch (error) {
        console.error("Assignment tests request failed:", error);

        if (isMissingTableError(error)) {
            return NextResponse.json(
                { error: "Required classroom tables are missing." },
                { status: 500 },
            );
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

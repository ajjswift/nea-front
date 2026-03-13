import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db from "@/utils/pg";
import { SessionService } from "@/lib/auth/SessionService";
import { EnvironmentRepository } from "@/lib/environments/EnvironmentRepository";
import { EnvironmentService } from "@/lib/environments/EnvironmentService";
import { ClassroomRepository } from "@/lib/classroom/ClassroomRepository";
import { ClassroomService } from "@/lib/classroom/ClassroomService";
import {
    frontendCacheKeys,
    frontendCacheService,
} from "@/lib/cache/FrontendCache";

const sessionService = new SessionService(db);
const environmentRepository = new EnvironmentRepository(db);
const environmentService = new EnvironmentService(environmentRepository);
const classroomRepository = new ClassroomRepository(db);
const classroomService = new ClassroomService({
    classroomRepository,
    database: db,
});

const ANON_NAME_COOKIE = "anon_viewer_name";
const ANON_ID_COOKIE = "anon_viewer_id";
const ANON_ADJECTIVES = [
    "Curious",
    "Calm",
    "Bright",
    "Helpful",
    "Focused",
    "Swift",
    "Keen",
    "Steady",
    "Bold",
    "Patient",
];
const ANON_NOUNS = [
    "Otter",
    "Fox",
    "Falcon",
    "Lynx",
    "Panda",
    "Robin",
    "Seal",
    "Koala",
    "Wolf",
    "Badger",
];

function missingTableResponse() {
    return NextResponse.json(
        {
            error: "Required tables are missing. Ensure environments and classroom tables are created.",
        },
        { status: 500 },
    );
}

function isMissingTableError(error) {
    return error?.code === "42P01";
}

function normalizeCookieValue(value, maxLength = 80) {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim().slice(0, maxLength);
}

function generateAnonymousName() {
    const adjective =
        ANON_ADJECTIVES[Math.floor(Math.random() * ANON_ADJECTIVES.length)];
    const noun = ANON_NOUNS[Math.floor(Math.random() * ANON_NOUNS.length)];
    const number = Math.floor(100 + Math.random() * 900);
    return `${adjective} ${noun} ${number}`;
}

function getAnonymousViewerFromRequest(request) {
    const existingName = normalizeCookieValue(
        request.cookies.get(ANON_NAME_COOKIE)?.value,
    );
    const existingId = normalizeCookieValue(
        request.cookies.get(ANON_ID_COOKIE)?.value,
        120,
    );

    if (existingName && existingId) {
        return {
            viewer: {
                id: existingId,
                username: existingName,
                role: "anonymous",
                anonymous: true,
            },
            shouldPersist: false,
        };
    }

    return {
        viewer: {
            id: `anon-${randomUUID()}`,
            username: generateAnonymousName(),
            role: "anonymous",
            anonymous: true,
        },
        shouldPersist: true,
    };
}

function normalizeJsonArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    return [];
}

function normalizeJsonObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? parsed
                : {};
        } catch {
            return {};
        }
    }

    return {};
}

export async function GET(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        const resolvedParams = await params;
        const rawEnvironmentId = resolvedParams?.environmentId;
        const environmentId = Array.isArray(rawEnvironmentId)
            ? rawEnvironmentId[0]
            : rawEnvironmentId;

        if (!environmentId) {
            return NextResponse.json(
                { error: "Environment ID is required." },
                { status: 400 },
            );
        }

        let assignmentContext = null;
        try {
            assignmentContext =
                await classroomRepository.findAssignmentEnvironmentContext(
                    environmentId,
                );
        } catch (error) {
            if (!isMissingTableError(error)) {
                throw error;
            }
            assignmentContext = null;
        }

        const isAssignmentEnvironment = Boolean(assignmentContext);
        let assignmentFeedbackComments = [];
        if (isAssignmentEnvironment) {
            try {
                const commentRows =
                    await classroomRepository.listAssignmentFeedbackCommentsForEnvironment(
                        environmentId,
                    );
                assignmentFeedbackComments = commentRows
                    .map((row) => classroomService.mapAssignmentFeedbackComment(row))
                    .filter(Boolean);
            } catch (error) {
                if (!isMissingTableError(error)) {
                    throw error;
                }
                assignmentFeedbackComments = [];
            }
        }
        const anonymousViewer = !user
            ? getAnonymousViewerFromRequest(request)
            : null;

        let environment = null;
        if (user) {
            const cacheKey = frontendCacheKeys.environmentDetail(
                user.userId,
                environmentId,
            );
            const cachedPayload = await frontendCacheService.getJson(cacheKey);
            if (cachedPayload) {
                return NextResponse.json(cachedPayload, { status: 200 });
            }

            environment = await environmentService.getForUser(
                user.userId,
                environmentId,
            );

            if (!environment && user.role === "teacher") {
                const canAccess = await classroomService.canTeacherAccessEnvironment(
                    user,
                    environmentId,
                );

                if (canAccess) {
                    environment = await environmentRepository.findById(environmentId);
                }
            }

            if (!environment) {
                environment = await environmentRepository.findById(environmentId);
            }

            if (!environment) {
                return NextResponse.json(
                    { error: "Environment not found." },
                    { status: 404 },
                );
            }

            const isAssignmentStudentOwner =
                isAssignmentEnvironment &&
                user.role === "student" &&
                assignmentContext?.student_id === user.userId;
            const isAssignmentTeacherViewer =
                isAssignmentEnvironment &&
                user.role === "teacher" &&
                assignmentContext?.teacher_id === user.userId;
            const isSubmittedStudentEnvironment =
                isAssignmentStudentOwner &&
                assignmentContext?.submission_status === "submitted";
            const canResetToTemplate = Boolean(
                assignmentContext?.template_environment_id &&
                    (isAssignmentStudentOwner || isAssignmentTeacherViewer),
            );
            const latestTestRun = classroomService.parseLatestTestRun(
                assignmentContext?.latest_test_run_json,
            );

            const payload = {
                environment: environment.toJSON(),
                viewer: {
                    id: user.userId,
                    username: user.username,
                    role: user.role || "student",
                    anonymous: false,
                },
                access: {
                    viewerUserId: user.userId,
                    viewerRole: user.role || "student",
                    isAssignmentEnvironment,
                    assignmentEnvironmentId:
                        assignmentContext?.assignment_environment_id || null,
                    assignmentId: assignmentContext?.assignment_id || null,
                    assignmentTitle: assignmentContext?.assignment_title || null,
                    assignmentDescription:
                        assignmentContext?.assignment_description || null,
                    assignmentDueAt: assignmentContext?.due_at || null,
                    classId: assignmentContext?.class_id || null,
                    templateEnvironmentId:
                        assignmentContext?.template_environment_id || null,
                    testCases: normalizeJsonArray(
                        assignmentContext?.test_cases_json,
                    ),
                    checklist: normalizeJsonObject(
                        assignmentContext?.checklist_json,
                    ),
                    submissionStatus:
                        assignmentContext?.submission_status || "not_started",
                    submissionUpdatedAt:
                        assignmentContext?.submission_updated_at || null,
                    submittedAt: assignmentContext?.submitted_at || null,
                    reviewedAt: assignmentContext?.reviewed_at || null,
                    latestTestRun,
                    teacherComments: assignmentFeedbackComments,
                    canManageTeacherComments: Boolean(
                        isAssignmentTeacherViewer,
                    ),
                    canUpdateSubmissionStatus: Boolean(
                        isAssignmentStudentOwner || isAssignmentTeacherViewer,
                    ),
                    instructionsReadOnly: Boolean(isAssignmentStudentOwner),
                    environmentReadOnly: Boolean(isSubmittedStudentEnvironment),
                    canResetToTemplate,
                },
            };

            await frontendCacheService.setJson(cacheKey, payload, 20);
            return NextResponse.json(payload, { status: 200 });
        }

        environment = await environmentRepository.findById(environmentId);
        if (!environment) {
            return NextResponse.json(
                { error: "Environment not found." },
                { status: 404 },
            );
        }

        const payload = {
            environment: environment.toJSON(),
            viewer: anonymousViewer.viewer,
            access: {
                viewerUserId: anonymousViewer.viewer.id,
                viewerRole: anonymousViewer.viewer.role,
                isAssignmentEnvironment,
                assignmentEnvironmentId:
                    assignmentContext?.assignment_environment_id || null,
                assignmentId: assignmentContext?.assignment_id || null,
                assignmentTitle: assignmentContext?.assignment_title || null,
                assignmentDescription:
                    assignmentContext?.assignment_description || null,
                assignmentDueAt: assignmentContext?.due_at || null,
                classId: assignmentContext?.class_id || null,
                templateEnvironmentId:
                    assignmentContext?.template_environment_id || null,
                testCases: normalizeJsonArray(assignmentContext?.test_cases_json),
                checklist: normalizeJsonObject(assignmentContext?.checklist_json),
                submissionStatus:
                    assignmentContext?.submission_status || "not_started",
                submissionUpdatedAt:
                    assignmentContext?.submission_updated_at || null,
                submittedAt: assignmentContext?.submitted_at || null,
                reviewedAt: assignmentContext?.reviewed_at || null,
                latestTestRun: classroomService.parseLatestTestRun(
                    assignmentContext?.latest_test_run_json,
                ),
                teacherComments: assignmentFeedbackComments,
                canManageTeacherComments: false,
                canUpdateSubmissionStatus: false,
                instructionsReadOnly: false,
                environmentReadOnly: false,
                canResetToTemplate: false,
            },
        };

        const response = NextResponse.json(payload, { status: 200 });
        if (anonymousViewer.shouldPersist) {
            response.cookies.set(ANON_NAME_COOKIE, anonymousViewer.viewer.username, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60 * 24 * 365,
            });
            response.cookies.set(ANON_ID_COOKIE, anonymousViewer.viewer.id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60 * 24 * 365,
            });
        }

        return response;
    } catch (error) {
        console.error("Failed to fetch environment by id:", error);

        if (isMissingTableError(error)) {
            return missingTableResponse();
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

export async function PATCH(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required." },
                { status: 401 },
            );
        }

        const resolvedParams = await params;
        const rawEnvironmentId = resolvedParams?.environmentId;
        const environmentId = Array.isArray(rawEnvironmentId)
            ? rawEnvironmentId[0]
            : rawEnvironmentId;

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
            body = {};
        }

        const environment = await environmentService.renameForUser(
            user.userId,
            environmentId,
            body,
        );

        if (!environment) {
            return NextResponse.json(
                { error: "Environment not found." },
                { status: 404 },
            );
        }

        await frontendCacheInvalidator.invalidateEnvironmentForUser(user.userId);

        return NextResponse.json(
            { environment: environment.toJSON() },
            { status: 200 },
        );
    } catch (error) {
        console.error("Failed to update environment:", error);

        if (error?.name === "ValidationError") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (isMissingTableError(error)) {
            return missingTableResponse();
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

export async function DELETE(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required." },
                { status: 401 },
            );
        }

        const resolvedParams = await params;
        const rawEnvironmentId = resolvedParams?.environmentId;
        const environmentId = Array.isArray(rawEnvironmentId)
            ? rawEnvironmentId[0]
            : rawEnvironmentId;

        if (!environmentId) {
            return NextResponse.json(
                { error: "Environment ID is required." },
                { status: 400 },
            );
        }

        const deleted = await environmentService.deleteForUser(
            user.userId,
            environmentId,
        );

        if (!deleted) {
            return NextResponse.json(
                { error: "Environment not found." },
                { status: 404 },
            );
        }

        await frontendCacheInvalidator.invalidateEnvironmentForUser(user.userId);

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error) {
        console.error("Failed to delete environment:", error);

        if (isMissingTableError(error)) {
            return missingTableResponse();
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

import { NextResponse } from "next/server";
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

function unauthorizedResponse() {
    return NextResponse.json(
        {
            error: "Authentication required.",
        },
        { status: 401 },
    );
}

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

export async function GET(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);

        if (!user) {
            return unauthorizedResponse();
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

        const cacheKey = frontendCacheKeys.environmentDetail(
            user.userId,
            environmentId,
        );
        const cachedPayload = await frontendCacheService.getJson(cacheKey);
        if (cachedPayload) {
            return NextResponse.json(cachedPayload, { status: 200 });
        }

        let environment = await environmentService.getForUser(
            user.userId,
            environmentId,
        );
        let assignmentContext = null;

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
            return NextResponse.json(
                { error: "Environment not found." },
                { status: 404 },
            );
        }

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
        const isAssignmentStudentOwner =
            isAssignmentEnvironment &&
            user.role === "student" &&
            assignmentContext.student_id === user.userId;

        const payload = {
            environment: environment.toJSON(),
            access: {
                viewerUserId: user.userId,
                viewerRole: user.role || "student",
                isAssignmentEnvironment,
                assignmentId: assignmentContext?.assignment_id || null,
                classId: assignmentContext?.class_id || null,
                instructionsReadOnly: Boolean(isAssignmentStudentOwner),
            },
        };

        await frontendCacheService.setJson(cacheKey, payload, 20);
        return NextResponse.json(payload, { status: 200 });
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

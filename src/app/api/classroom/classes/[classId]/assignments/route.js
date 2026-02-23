import { NextResponse } from "next/server";
import db from "@/utils/pg";
import { SessionService } from "@/lib/auth/SessionService";
import { ClassroomRepository } from "@/lib/classroom/ClassroomRepository";
import {
    ClassroomAuthorizationError,
    ClassroomNotFoundError,
    ClassroomService,
    ClassroomValidationError,
} from "@/lib/classroom/ClassroomService";
import {
    frontendCacheInvalidator,
    frontendCacheKeys,
    frontendCacheService,
} from "@/lib/cache/FrontendCache";

const sessionService = new SessionService(db);
const classroomRepository = new ClassroomRepository(db);
const classroomService = new ClassroomService({
    classroomRepository,
    database: db,
});

function unauthorizedResponse() {
    return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
    );
}

function normalizeClassId(params) {
    const value = params?.classId;
    return Array.isArray(value) ? value[0] : value;
}

function toErrorResponse(error) {
    if (error instanceof ClassroomValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ClassroomAuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof ClassroomNotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error?.code === "42P01") {
        return NextResponse.json(
            {
                error: "Classroom tables are missing. Create classroom tables before using this feature.",
            },
            { status: 500 },
        );
    }

    return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
    );
}

export async function GET(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        classroomService.ensureTeacher(user);

        const resolvedParams = await params;
        const classId = normalizeClassId(resolvedParams);
        if (!classId) {
            return NextResponse.json({ error: "Class ID is required." }, { status: 400 });
        }

        const classRow = await classroomRepository.getClassByIdForTeacher(
            classId,
            user.userId,
        );
        if (!classRow) {
            throw new ClassroomNotFoundError("Class not found.");
        }

        const assignmentRows = await frontendCacheService.getOrSetJson(
            frontendCacheKeys.classAssignments(user.userId, classId),
            async () =>
                classroomRepository.listAssignmentsForClass(classId, user.userId),
            20,
        );
        const assignments = classroomService.mapAssignments(assignmentRows);

        return NextResponse.json({ assignments }, { status: 200 });
    } catch (error) {
        console.error("Failed to get assignments:", error);
        return toErrorResponse(error);
    }
}

export async function POST(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const resolvedParams = await params;
        const classId = normalizeClassId(resolvedParams);
        if (!classId) {
            return NextResponse.json({ error: "Class ID is required." }, { status: 400 });
        }

        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const assignment = await classroomService.createAssignmentForClass(
            user,
            classId,
            body,
        );
        await frontendCacheInvalidator.invalidateAfterClassroomMutation();

        return NextResponse.json({ assignment }, { status: 201 });
    } catch (error) {
        console.error("Failed to create assignment:", error);
        return toErrorResponse(error);
    }
}

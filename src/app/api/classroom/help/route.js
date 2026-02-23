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

function normalizeClassId(value) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    return normalized || null;
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

export async function GET(request) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const classId = normalizeClassId(
            request.nextUrl.searchParams.get("classId"),
        );
        const helpRequests = await frontendCacheService.getOrSetJson(
            frontendCacheKeys.teacherHelpQueue(user.userId, classId || "all"),
            async () => classroomService.listTeacherHelpQueue(user, classId),
            10,
        );

        return NextResponse.json({ requests: helpRequests }, { status: 200 });
    } catch (error) {
        console.error("Failed to fetch teacher help queue:", error);
        return toErrorResponse(error);
    }
}

export async function POST(request) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const result = await classroomService.requestStudentHelp(user, body);
        await Promise.all([
            frontendCacheInvalidator.invalidateAfterClassroomMutation(),
            frontendCacheService.deleteByPrefix("classroom:help:"),
        ]);

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error("Failed to create help request:", error);
        return toErrorResponse(error);
    }
}

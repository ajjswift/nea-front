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
import { frontendCacheInvalidator } from "@/lib/cache/FrontendCache";

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

function normalizeEnvironmentId(params) {
    const value = params?.environmentId;
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
            { error: "Required classroom tables are missing." },
            { status: 500 },
        );
    }

    return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
    );
}

export async function POST(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

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
            body = {};
        }

        const comments = await classroomService.createTeacherFeedbackComment(
            user,
            environmentId,
            body,
        );
        await frontendCacheInvalidator.invalidateAfterClassroomMutation();

        return NextResponse.json({ comments }, { status: 201 });
    } catch (error) {
        console.error("Failed to create assignment feedback comment:", error);
        return toErrorResponse(error);
    }
}

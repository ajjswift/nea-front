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

function normalizeHelpRequestId(params) {
    const value = params?.helpRequestId;
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

export async function PATCH(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const resolvedParams = await params;
        const helpRequestId = normalizeHelpRequestId(resolvedParams);
        if (!helpRequestId) {
            return NextResponse.json(
                { error: "Help request ID is required." },
                { status: 400 },
            );
        }

        const resolvedRequest = await classroomService.resolveHelpRequest(
            user,
            helpRequestId,
        );

        await Promise.all([
            frontendCacheInvalidator.invalidateAfterClassroomMutation(),
            frontendCacheService.deleteByPrefix("classroom:help:"),
        ]);

        return NextResponse.json({ request: resolvedRequest }, { status: 200 });
    } catch (error) {
        console.error("Failed to resolve help request:", error);
        return toErrorResponse(error);
    }
}

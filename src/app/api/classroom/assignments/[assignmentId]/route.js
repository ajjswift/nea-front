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

function normalizeAssignmentId(params) {
    const value = params?.assignmentId;
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
        const assignmentId = normalizeAssignmentId(resolvedParams);
        if (!assignmentId) {
            return NextResponse.json(
                { error: "Assignment ID is required." },
                { status: 400 },
            );
        }

        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const assignment = await classroomService.updateAssignment(
            user,
            assignmentId,
            body,
        );

        return NextResponse.json({ assignment }, { status: 200 });
    } catch (error) {
        console.error("Failed to update assignment:", error);
        return toErrorResponse(error);
    }
}

export async function DELETE(request, { params }) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const resolvedParams = await params;
        const assignmentId = normalizeAssignmentId(resolvedParams);
        if (!assignmentId) {
            return NextResponse.json(
                { error: "Assignment ID is required." },
                { status: 400 },
            );
        }

        const assignment = await classroomService.deleteAssignment(
            user,
            assignmentId,
        );

        return NextResponse.json(
            {
                assignment,
                deletedEnvironmentCount: assignment.deletedEnvironmentCount,
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("Failed to delete assignment:", error);
        return toErrorResponse(error);
    }
}

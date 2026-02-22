import { NextResponse } from "next/server";
import db from "@/utils/pg";
import { SessionService } from "@/lib/auth/SessionService";
import { ClassroomRepository } from "@/lib/classroom/ClassroomRepository";
import {
    ClassroomAuthorizationError,
    ClassroomService,
    ClassroomValidationError,
} from "@/lib/classroom/ClassroomService";

const sessionService = new SessionService(db);
const classroomRepository = new ClassroomRepository(db);
const classroomService = new ClassroomService({
    classroomRepository,
    database: db,
});

function isMissingTableError(error) {
    return error?.code === "42P01";
}

function unauthorizedResponse() {
    return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
    );
}

function missingTableResponse() {
    return NextResponse.json(
        {
            error: "Classroom tables are missing. Create classroom tables before using this feature.",
        },
        { status: 500 },
    );
}

function toClassroomErrorResponse(error) {
    if (error instanceof ClassroomValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ClassroomAuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (isMissingTableError(error)) {
        return missingTableResponse();
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

        const classes = await classroomService.getTeacherDashboard(user);
        return NextResponse.json({ classes }, { status: 200 });
    } catch (error) {
        console.error("Failed to list classes:", error);
        return toClassroomErrorResponse(error);
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

        const createdClass = await classroomService.createClassForTeacher(
            user,
            body,
        );
        return NextResponse.json({ class: createdClass }, { status: 201 });
    } catch (error) {
        console.error("Failed to create class:", error);
        return toClassroomErrorResponse(error);
    }
}

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

        const students = await classroomRepository.listClassStudents(
            classId,
            user.userId,
        );

        return NextResponse.json(
            {
                students: students.map((student) => ({
                    id: student.id,
                    username: student.username,
                    role: student.role,
                    enrolledAt: student.enrolled_at,
                })),
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("Failed to get class students:", error);
        return toErrorResponse(error);
    }
}

export async function PUT(request, { params }) {
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

        const students = await classroomService.assignStudentsToClass(
            user,
            classId,
            body,
        );
        return NextResponse.json({ students }, { status: 200 });
    } catch (error) {
        console.error("Failed to set class students:", error);
        return toErrorResponse(error);
    }
}

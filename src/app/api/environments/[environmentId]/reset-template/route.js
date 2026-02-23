import { NextResponse } from "next/server";
import db from "@/utils/pg";
import { get as getRedisValue } from "@/utils/redis";
import { SessionService } from "@/lib/auth/SessionService";
import { ClassroomRepository } from "@/lib/classroom/ClassroomRepository";
import {
    ClassroomAuthorizationError,
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
        {
            error: "Authentication required.",
        },
        { status: 401 },
    );
}

function normalizeEnvironmentId(params) {
    const rawValue = params?.environmentId;
    return Array.isArray(rawValue) ? rawValue[0] : rawValue;
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

        const context = await classroomRepository.findAssignmentEnvironmentContext(
            environmentId,
        );
        if (!context) {
            return NextResponse.json(
                { error: "Environment is not linked to an assignment." },
                { status: 400 },
            );
        }

        if (!context.template_environment_id) {
            return NextResponse.json(
                { error: "This assignment has no template environment to reset from." },
                { status: 400 },
            );
        }

        const isStudentOwner =
            user.role === "student" && context.student_id === user.userId;
        const isTeacherOwner =
            user.role === "teacher" && context.teacher_id === user.userId;
        if (!isStudentOwner && !isTeacherOwner) {
            return NextResponse.json({ error: "Forbidden." }, { status: 403 });
        }

        await classroomService.cloneTemplateFiles(
            context.template_environment_id,
            environmentId,
        );

        const files = await getRedisValue(`e::${environmentId}::files`);
        await frontendCacheInvalidator.invalidateAfterClassroomMutation();

        return NextResponse.json(
            {
                ok: true,
                environmentId,
                templateEnvironmentId: context.template_environment_id,
                files: Array.isArray(files) ? files : [],
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("Failed to reset environment to template:", error);

        if (error instanceof ClassroomValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ClassroomAuthorizationError) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        if (error?.code === "42P01") {
            return NextResponse.json(
                {
                    error: "Required classroom tables are missing.",
                },
                { status: 500 },
            );
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

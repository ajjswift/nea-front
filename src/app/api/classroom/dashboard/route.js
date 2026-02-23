import { NextResponse } from "next/server";
import db from "@/utils/pg";
import { SessionService } from "@/lib/auth/SessionService";
import { ClassroomRepository } from "@/lib/classroom/ClassroomRepository";
import {
    ClassroomAuthorizationError,
    ClassroomService,
} from "@/lib/classroom/ClassroomService";
import {
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

export async function GET(request) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const dashboardRole = user.role === "teacher" ? "teacher" : "student";
        const payload = await frontendCacheService.getOrSetJson(
            frontendCacheKeys.classroomDashboard(dashboardRole, user.userId),
            async () => {
                const classes =
                    dashboardRole === "teacher"
                        ? await classroomService.getTeacherDashboard(user)
                        : await classroomService.getStudentDashboard(user);

                return {
                    user: {
                        id: user.userId,
                        username: user.username,
                        role: dashboardRole,
                    },
                    role: dashboardRole,
                    classes,
                };
            },
            20,
        );

        return NextResponse.json(payload, { status: 200 });
    } catch (error) {
        console.error("Failed to fetch classroom dashboard:", error);

        if (error instanceof ClassroomAuthorizationError) {
            return NextResponse.json({ error: error.message }, { status: 403 });
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
}

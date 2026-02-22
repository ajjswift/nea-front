import { NextResponse } from "next/server";
import db from "@/utils/pg";
import { SessionService } from "@/lib/auth/SessionService";
import { EnvironmentRepository } from "@/lib/environments/EnvironmentRepository";
import {
    EnvironmentService,
    ValidationError,
} from "@/lib/environments/EnvironmentService";

const sessionService = new SessionService(db);
const environmentRepository = new EnvironmentRepository(db);
const environmentService = new EnvironmentService(environmentRepository);

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
            error: "The environments table is missing. Create it before using this feature.",
        },
        { status: 500 },
    );
}

function isMissingTableError(error) {
    return error?.code === "42P01";
}

export async function GET(request) {
    try {
        const user = await sessionService.getAuthenticatedUser(request);

        if (!user) {
            return unauthorizedResponse();
        }

        const environments = await environmentService.listForUser(user.userId);
        return NextResponse.json(
            {
                user: {
                    id: user.userId,
                    username: user.username,
                    role: user.role || "student",
                },
                environments: environments.map((environment) => environment.toJSON()),
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("Failed to load environments:", error);

        if (isMissingTableError(error)) {
            return missingTableResponse();
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
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

        const environment = await environmentService.createForUser(
            user.userId,
            body,
        );

        return NextResponse.json(
            {
                environment: environment.toJSON(),
            },
            { status: 201 },
        );
    } catch (error) {
        console.error("Failed to create environment:", error);

        if (error instanceof ValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (isMissingTableError(error)) {
            return missingTableResponse();
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

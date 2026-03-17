import { NextResponse } from "next/server";
import db from "@/utils/pg";
import { SessionService } from "@/lib/auth/SessionService";

const sessionService = new SessionService(db);

function clearSessionCookie(response) {
    response.cookies.set("session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
        expires: new Date(0),
        path: "/",
    });
}

export async function POST(request) {
    try {
        const cookieValue = request.cookies.get("session")?.value;
        const sessionPayload = sessionService.parseSessionCookie(cookieValue);

        if (sessionPayload?.sessionId && sessionPayload?.userId) {
            await db.query(
                "DELETE FROM session WHERE id = $1 AND user_id = $2",
                [sessionPayload.sessionId, sessionPayload.userId],
            );
        }

        const response = NextResponse.json(
            { message: "User logged out successfully" },
            { status: 200 },
        );
        clearSessionCookie(response);
        return response;
    } catch (error) {
        console.error("Logout Error:", error);

        const response = NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
        clearSessionCookie(response);
        return response;
    }
}

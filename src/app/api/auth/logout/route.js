import { NextResponse } from "next/server";
import db from "@/utils/pg";
import { SessionService } from "@/lib/auth/SessionService";

const sessionService = new SessionService(db);

function clearSessionCookie(response) {
    // Overwrite the session cookie with an expired value so the browser removes it immediately.
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
        // Read the session cookie sent with the request so we know which server-side session to clear.
        const cookieValue = request.cookies.get("session")?.value;

        // Parse the cookie payload into a structured object that contains the session identifiers.
        const sessionPayload = sessionService.parseSessionCookie(cookieValue);

        // Only try to delete the stored session when both identifiers are present and valid.
        if (sessionPayload?.sessionId && sessionPayload?.userId) {
            await db.query(
                "DELETE FROM session WHERE id = $1 AND user_id = $2",
                [sessionPayload.sessionId, sessionPayload.userId],
            );
        }

        // Respond successfully even if there was no matching database session, then clear the browser cookie.
        const response = NextResponse.json(
            { message: "User logged out successfully" },
            { status: 200 },
        );
        clearSessionCookie(response);
        return response;
    } catch (error) {
        console.error("Logout Error:", error);

        // Even if something fails server-side, still clear the cookie so the client is logged out locally.
        const response = NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
        clearSessionCookie(response);
        return response;
    }
}

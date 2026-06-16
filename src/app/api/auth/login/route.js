import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/utils/pg";

export async function POST(request) {
    try {
        // This block safely awaits and parses the JSON body, storing it in the body variable.
        // This is necessary, as if there is malformed javascript, it could crash the application.
        // Using error handling here allows me to safely check whether the request body contains valid JSON data, sending an appropriate 400 response if not.
        let body = {};
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }

        const username =
            typeof body?.username === "string" ? body.username.trim() : ""; // Checks whether the username is a string, in which case removes any trailing spaces in the string. If not, sets username to an empty string.
        const password =
            typeof body?.password === "string" ? body.password : ""; // Checks whether the password is a string, in which case sets the password variable to the password, else an empty string.

        // If either the username or password are falsy, return a 400 for missing fields.
        //  Falsy values include empty strings, so if they're not the correct data type, an appropriate error message is sent.
        if (!username || !password) {
            return NextResponse.json(
                { error: "Missing fields" },
                { status: 400 },
            );
        }

        if (username.length > 64 || password.length > 256) {
            // If the username or password are too long, return a 400.
            return NextResponse.json(
                { error: "Invalid credentials format" },
                { status: 400 },
            );
        }

        const userDB = await db.query(
            `SELECT id, username, password_hash FROM users WHERE username = $1`,
            [username],
        );

        if (userDB?.rows?.length === 0) {
            return NextResponse.json(
                {
                    message: "Invalid username or password",
                },
                { status: 403 },
            );
        }

        const userRecord = userDB?.rows[0];
        const hash = userRecord.password_hash;

        let role = "student";
        try {
            const roleQuery = await db.query(
                `SELECT role FROM user_profiles WHERE user_id = $1 LIMIT 1`,
                [userRecord.id],
            );
            role = roleQuery.rows?.[0]?.role || "student";
        } catch (error) {
            if (error?.code !== "42P01") {
                throw error;
            }
        }

        if (!(await bcrypt.compare(password, hash))) {
            return NextResponse.json(
                {
                    message: "Invalid username or password",
                },
                { status: 403 },
            );
        }

        const response = NextResponse.json(
            {
                message: "User logged-in successfully",
                userId: userRecord.id,
                role,
            },
            { status: 200 },
        );

        const session = await db.query(
            "INSERT INTO session (user_id) VALUES ($1) RETURNING id",
            [userRecord.id],
        );

        const sessionId = session.rows[0].id;

        response.cookies.set(
            "session",
            JSON.stringify({
                username,
                userId: userRecord.id,
                sessionId: sessionId,
                role,
            }),
            {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                maxAge: 30 * 24 * 60 * 60,
                path: "/",
            },
        );

        return response;
    } catch (error) {
        console.error("Signin Error:", error);

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

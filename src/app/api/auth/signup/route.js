import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/utils/pg";

export async function POST(request) {
    try {
        // This block safely awaits and parses the JSON body, storing it in the body variable.
        // This is necessary, as malformed JSON would otherwise throw and skip our intended 400 response.
        // Using error handling here lets the route fail gracefully when the request body is invalid.
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
            typeof body?.username === "string" ? body.username.trim() : ""; // Checks whether the username is a string, in which case removes leading and trailing spaces. If not, sets username to an empty string.
        const password =
            typeof body?.password === "string" ? body.password : ""; // Checks whether the password is a string, in which case sets the password variable to that value. If not, sets password to an empty string.
        const role = body?.role === "teacher" ? "teacher" : "student"; // Only allow the teacher role explicitly. Any other value falls back to student.

        // If either required field is missing or invalid, return a 400 response.
        if (!username || !password) {
            return NextResponse.json(
                { error: "Missing fields" },
                { status: 400 },
            );
        }

        // Enforce a sensible username length before attempting to write to the database.
        if (username.length < 3 || username.length > 64) {
            return NextResponse.json(
                { error: "Username must be between 3 and 64 characters." },
                { status: 400 },
            );
        }

        // Require a minimum password length while also rejecting unusually long passwords.
        if (password.length < 8 || password.length > 84) {
            return NextResponse.json(
                { error: "Password must be between 8 and 84 characters." },
                { status: 400 },
            );
        }

        // Hash the password before storing it so the raw password is never saved in the database.
        const passwordHash = await bcrypt.hash(password, 12);

        // Wrap account creation in a transaction so the user and profile records are created together.
        const userId = await db.withTransaction(async (client) => {
            const createdUser = await client.query(
                "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
                [username, passwordHash],
            );

            const nextUserId = createdUser.rows[0].id;

            // Create the related profile row so role information exists immediately after signup.
            await client.query(
                `
                    INSERT INTO user_profiles (user_id, role, created_at, updated_at)
                    VALUES ($1, $2, NOW(), NOW())
                `,
                [nextUserId, role],
            );

            return nextUserId;
        });

        // Return the created user's id and role so the client can react to a successful signup.
        return NextResponse.json(
            {
                message: "User created successfully",
                userId,
                role,
            },
            { status: 201 },
        );
    } catch (error) {
        console.error("Registration Error:", error);

        // Handle unique constraint violation, which most likely means the username is already in use.
        if (error.code === "23505") {
            return NextResponse.json(
                { error: "Username already taken" },
                { status: 409 },
            );
        }

        // If the profile table does not exist yet, return a more specific setup-related error.
        if (error.code === "42P01") {
            return NextResponse.json(
                {
                    error: "Classroom tables are not initialized. Create user_profiles first.",
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

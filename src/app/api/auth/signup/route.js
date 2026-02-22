import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/utils/pg";

export async function POST(request) {
    let client = null;

    try {
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
            typeof body?.username === "string" ? body.username.trim() : "";
        const password = typeof body?.password === "string" ? body.password : "";
        const role = body?.role === "teacher" ? "teacher" : "student";

        if (!username || !password) {
            return NextResponse.json(
                { error: "Missing fields" },
                { status: 400 },
            );
        }

        if (username.length < 3 || username.length > 64) {
            return NextResponse.json(
                { error: "Username must be between 3 and 64 characters." },
                { status: 400 },
            );
        }

        if (password.length < 8 || password.length > 256) {
            return NextResponse.json(
                { error: "Password must be between 8 and 256 characters." },
                { status: 400 },
            );
        }

        const passwordHash = await bcrypt.hash(password, 12);
        client = await db.getClient();
        await client.query("BEGIN");

        const createdUser = await client.query(
            "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
            [username, passwordHash],
        );

        const userId = createdUser.rows[0].id;
        await client.query(
            `
                INSERT INTO user_profiles (user_id, role, created_at, updated_at)
                VALUES ($1, $2, NOW(), NOW())
            `,
            [userId, role],
        );

        await client.query("COMMIT");

        return NextResponse.json(
            {
                message: "User created successfully",
                userId,
                role,
            },
            { status: 201 },
        );
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK");
        }
        console.error("Registration Error:", error);

        // Handle unique constraint violation (e.g., username already exists)
        if (error.code === "23505") {
            return NextResponse.json(
                { error: "Username already taken" },
                { status: 409 },
            );
        }

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
    } finally {
        client?.release();
    }
}

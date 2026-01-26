import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/utils/pg";

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json(
                { error: "Missing fields" },
                { status: 400 },
            );
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // Postgres uses $1, $2, etc. for parameters
        await db.query(
            "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
            [username, passwordHash],
        );

        return NextResponse.json(
            { message: "User created successfully" },
            { status: 201 },
        );
    } catch (error) {
        console.error("Registration Error:", error);

        // Handle unique constraint violation (e.g., username already exists)
        if (error.code === "23505") {
            return NextResponse.json(
                { error: "Username already taken" },
                { status: 409 },
            );
        }

        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

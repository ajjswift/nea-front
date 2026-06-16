"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoaderCircle } from "lucide-react";

export default function Signup() {
    const router = useRouter();

    // Store the values entered into the sign-up form so the inputs stay controlled.
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("student");

    // Track whether the request is currently being sent so the button can be disabled.
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Hold any server-side or network error so it can be shown to the user.
    const [errorMessage, setErrorMessage] = useState("");

    const handleSignup = async (event) => {
        // Prevent the browser from refreshing the page when the form is submitted.
        event.preventDefault();

        // Reset the UI into a "submitting" state before sending the request.
        setIsSubmitting(true);
        setErrorMessage("");

        try {
            // Send the new account details to the sign-up API route.
            const response = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    password,
                    role,
                }),
            });

            // Read the response body so any server error can be surfaced to the user.
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || "Signup failed.");
            }

            // After a successful registration, send the user to the login page.
            router.push("/auth/login");
        } catch (error) {
            // Show a readable error message instead of failing silently.
            setErrorMessage(error.message || "Signup failed.");
        } finally {
            // Re-enable the form whether the request succeeded or failed.
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
            <div className="w-full max-w-sm">
                {/* Intro text above the card to explain the purpose of the page. */}
                <div className="mb-6 text-center">
                    <p className="text-sm text-zinc-500">Create your account</p>
                </div>

                <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
                    {/* Main heading and supporting text for the registration form. */}
                    <h1 className="text-base font-semibold text-zinc-100">Create account</h1>
                    <p className="mt-0.5 text-sm text-zinc-500">
                        Register as a student or teacher.
                    </p>

                    {/* Controlled form inputs keep the component state in sync with what the user types. */}
                    <form className="mt-5 space-y-3" onSubmit={handleSignup}>
                        <Input
                            placeholder="Username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                        />
                        <Input
                            type="password"
                            placeholder="Password (8+ characters)"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />

                        {/* Allow the user to choose which type of account should be created. */}
                        <select
                            value={role}
                            onChange={(event) => setRole(event.target.value)}
                            className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        >
                            <option value="student">Student</option>
                            <option value="teacher">Teacher</option>
                        </select>

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-zinc-100 text-zinc-900 hover:bg-white"
                        >
                            {/* Swap the button label while the request is in progress to give feedback. */}
                            {isSubmitting ? (
                                <>
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Creating…
                                </>
                            ) : (
                                "Create account"
                            )}
                        </Button>
                    </form>

                    {/* Only show the error banner when there is a message to display. */}
                    {errorMessage && (
                        <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {errorMessage}
                        </p>
                    )}
                </section>

                {/* Provide a quick route back for users who already have an account. */}
                <p className="mt-4 text-center text-xs text-zinc-600">
                    Already have an account?{" "}
                    <Link href="/auth/login" className="text-zinc-400 hover:text-zinc-200">
                        Log in
                    </Link>
                </p>
            </div>
        </div>
    );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const handleLogin = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        setErrorMessage("");

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    password,
                }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.message || payload?.error || "Login failed.");
            }

            if (payload?.role === "teacher") {
                router.push("/classroom");
            } else {
                router.push("/");
            }
        } catch (error) {
            setErrorMessage(error.message || "Error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <main className="mx-auto w-full max-w-md px-4 py-10">
                <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
                    <h1 className="text-xl font-semibold">Log in</h1>
                    <p className="mt-1 text-sm text-zinc-400">
                        Continue to your environment dashboard.
                    </p>

                    <form className="mt-5 space-y-3" onSubmit={handleLogin}>
                        <Input
                            placeholder="Username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                        />
                        <Input
                            placeholder="Password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                        >
                            {isSubmitting ? (
                                <>
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Logging in...
                                </>
                            ) : (
                                "Log in"
                            )}
                        </Button>
                    </form>

                    {errorMessage && (
                        <p className="mt-3 rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                            {errorMessage}
                        </p>
                    )}
                </section>
            </main>
        </div>
    );
}

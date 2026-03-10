"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoaderCircle, SquareTerminal } from "lucide-react";

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
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
            <div className="w-full max-w-sm">
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                        <SquareTerminal className="size-5 text-emerald-400" />
                    </div>
                    <p className="text-sm text-zinc-500">Sign in to your account</p>
                </div>

                <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
                    <h1 className="text-base font-semibold text-zinc-100">Log in</h1>
                    <p className="mt-0.5 text-sm text-zinc-500">
                        Continue to your environments.
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
                            className="w-full bg-zinc-100 text-zinc-900 hover:bg-white"
                        >
                            {isSubmitting ? (
                                <>
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Logging in…
                                </>
                            ) : (
                                "Log in"
                            )}
                        </Button>
                    </form>

                    {errorMessage && (
                        <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {errorMessage}
                        </p>
                    )}
                </section>

                <p className="mt-4 text-center text-xs text-zinc-600">
                    Need an account?{" "}
                    <Link href="/auth/signup" className="text-zinc-400 hover:text-zinc-200">
                        Create one
                    </Link>
                </p>
            </div>
        </div>
    );
}

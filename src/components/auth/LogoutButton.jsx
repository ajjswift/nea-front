"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LogoutButton({
    className = "",
    label = "Log out",
    onError = null,
    redirectTo = "/auth/login",
    size = "sm",
    variant = "outline",
}) {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);

    const handleLogout = async () => {
        if (isPending) {
            return;
        }

        setIsPending(true);

        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
            });

            if (!response.ok) {
                let message = "Could not log out.";

                try {
                    const payload = await response.json();
                    message = payload?.error || payload?.message || message;
                } catch {}

                throw new Error(message);
            }

            startTransition(() => {
                router.push(redirectTo);
                router.refresh();
            });
        } catch (error) {
            setIsPending(false);
            onError?.(error?.message || "Could not log out.");
        }
    };

    return (
        <Button
            type="button"
            size={size}
            variant={variant}
            className={className}
            onClick={handleLogout}
            disabled={isPending}
        >
            {isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
            ) : (
                <LogOut className="size-4" />
            )}
            {label}
        </Button>
    );
}

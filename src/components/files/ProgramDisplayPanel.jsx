"use client";

import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ProgramDisplayPanel({
    className = "",
    displayUrl = "",
    onPopOut = null,
}) {
    if (!displayUrl) {
        return null;
    }

    return (
        <section
            className={cn(
                "flex min-h-0 flex-col border-t border-zinc-800 bg-zinc-950",
                className,
            )}
        >
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2">
                <div>
                    <p className="text-sm font-semibold text-zinc-200">
                        Live display
                    </p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={onPopOut}
                >
                    <ArrowUpRight className="size-3.5" />
                    Pop out
                </Button>
            </div>

            <div className="min-h-0 flex-1 bg-black p-2">
                <iframe
                    title="Program display"
                    src={displayUrl}
                    className="h-full min-h-0 w-full rounded border border-zinc-800 bg-black"
                />
            </div>
        </section>
    );
}

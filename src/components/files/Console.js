"use client";

import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useState, useRef, useEffect } from "react";

export function Console() {
    const { environment, setEnvironment } = useEnvironment();
    const [input, setInput] = useState("");
    const outputRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [environment.console]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!input.trim() || !environment.ws || !environment.isRunning) return;

        setEnvironment((prev) => ({
            ...prev,
            console: (prev.console || "") + `${input}\n`,
        }));

        // Send input to the WebSocket
        environment.ws.send(
            JSON.stringify({
                type: "stdin",
                data: input + "\n",
            })
        );

        setInput("");
    };

    const handleConsoleChange = (e) => {
        setEnvironment((prev) => ({
            ...prev,
            consoleInput: e.target.value,
        }));
    };

    const handleKeyDown = (e) => {
        // Allow Ctrl+C to send interrupt signal
        if (e.ctrlKey && e.key === "c") {
            e.preventDefault();
            if (environment.ws && environment.isRunning) {
                environment.ws.send(
                    JSON.stringify({
                        type: "killProgram",
                        data: "", // Ctrl+C character
                    })
                );
            }
        }
    };

    return (
        <div className="col-span-8 row-span-5 bg-black border-t-2 border-zinc-800 flex flex-col">
            {/* Console Header */}
            <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-300">
                    Console
                </span>
                {environment.isRunning && (
                    <span className="text-xs text-green-500 animate-pulse">
                        ● Running
                    </span>
                )}
            </div>

            {/* Output Area */}
            <div
                ref={outputRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm text-zinc-300 whitespace-pre-wrap break-words"
                style={{
                    fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                }}
            >
                {environment.console ||
                    "No output yet. Run your program to see output here."}
            </div>

            {/* Input Area */}
            <form
                onSubmit={handleSubmit}
                className="border-t border-zinc-800 bg-zinc-950 flex items-center"
            >
                <span className="px-4 text-zinc-400 font-mono">$</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={environment.consoleInput}
                    onChange={handleConsoleChange}
                    onKeyDown={handleKeyDown}
                    disabled={!environment.isRunning}
                    placeholder={
                        environment.isRunning
                            ? "Type input and press Enter..."
                            : "Run a program to enable input"
                    }
                    className="flex-1 bg-transparent px-2 py-3 text-zinc-400 font-mono outline-none disabled:text-zinc-600 disabled:cursor-not-allowed"
                    style={{
                        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                    }}
                />
            </form>
        </div>
    );
}

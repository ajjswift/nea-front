"use client";

import { useEnvironment } from "@/layout/EnvironmentLayout";
import { useParams } from "next/navigation";
import { FileManager } from "@/components/files/FileManager";
import { FileViewer } from "@/components/files/FileViewer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCircleNotch,
    faPlay,
    faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { Console } from "@/components/files/Console";
import { useState } from "react";
import { useEffect } from "react";

export default function EnvironmentPage() {
    const { environment, setEnvironment } = useEnvironment();
    const [isRunning, setIsRunning] = useState(false);
    const isReady = environment?.ws?.readyState || false;

    const runProgram = () => {
        setEnvironment((prev) => ({
            ...prev,
            console: "",
            isRunning: true,
        }));

        environment.ws.send(
            JSON.stringify({
                type: "runProgram",
                data: environment.files,
            }),
        );

        setIsRunning(true);

        // Focus the console input if the ref exists
        if (environment.consoleRef && environment.consoleRef.current) {
            setTimeout(() => {
                environment.consoleRef.current.focus();
            }, 50);
        }
    };;

    useEffect(() => {
        if (environment.isRunning !== undefined) {
            setIsRunning(environment.isRunning);
        }
    }, [environment.isRunning]);

    return (
        <div className="w-screen h-screen grid grid-cols-10 grid-rows-12">
            <div className="col-span-10 bg-zinc-950 flex items-center px-4 justify-between border-b border-zinc-800">
                <span>hello, {environment.id}</span>

                <div className="flex items-center gap-4 justify-end">
                    {" "}
                    <div
                        className={`px-3 py-1 border-t-1 border-2 shadow-2xl font-semibold transition-all ${
                            isReady === 1
                                ? "bg-green-600 border-green-500"
                                : "bg-red-600 border-red-500"
                        } rounded-full`}
                    >
                        {isReady === 1 ? "Connected" : "Disconnected"}
                    </div>
                    <button
                        className={`px-4 py-2 ${
                            isReady === 1
                                ? "bg-white cursor-pointer"
                                : "bg-zinc-300"
                        } text-black rounded-lg flex items-center gap-2 transition-all duration-150`}
                        disabled={isReady !== 1 || isRunning === true}
                        onClick={runProgram}
                    >
                        {isRunning === false ? (
                            <>
                                <FontAwesomeIcon icon={faPlay} /> Run
                            </>
                        ) : (
                            <>
                                <FontAwesomeIcon
                                    icon={faCircleNotch}
                                    className="animate-spin"
                                />{" "}
                                Running
                            </>
                        )}
                    </button>
                </div>
            </div>

            {isReady === 1 ? (
                <>
                    <div className="bg-zinc-900 col-span-2 border-r-2 row-span-11 border-zinc-800 flex flex-col gap-2 p-3">
                        <FileManager />
                    </div>
                    <div className="col-span-8 row-span-11 grid grid-cols-8 grid-rows-11">
                        <FileViewer />
                        <Console />
                    </div>
                </>
            ) : (
                <>
                    <div className="col-span-10 row-span-11 flex justify-center items-center flex-col gap-4 noto-sans">
                        <div className="border-r-2 rounded-full animate-spin size-8"></div>
                        <span className="tracking-wide text-zinc-300">
                            Connecting, please wait...
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}

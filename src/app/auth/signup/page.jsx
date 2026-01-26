"use client";
import { useState } from "react";
import axios from "axios";

export default function Signup() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const handleSignup = async () => {
        console.log("hello");
        const sendSignup = await axios.post("/api/auth/signup", {
            username,
            password,
        });
    };

    return (
        <div>
            <p>username</p>
            <input
                className="bg-white text-black"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />
            <p>Password</p>
            <input
                type="password"
                className="bg-white text-black"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />

            <button onClick={handleSignup} className="cursor-pointer">
                Signup
            </button>
        </div>
    );
}

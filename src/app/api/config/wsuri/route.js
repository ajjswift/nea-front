export async function GET() {
    const URI = process.env.WEBSOCKET_URL;

    if (!URI) {
        return new Response(
            JSON.stringify({ error: "WEBSOCKET_URL is not configured." }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    return new Response(JSON.stringify({ URI }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

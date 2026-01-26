export async function GET() {
    return new Response(JSON.stringify({ URI: process.env.WEBSOCKET_URL }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

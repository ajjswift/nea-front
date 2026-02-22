export class ApiError extends Error {
    constructor(message, status, payload = null) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.payload = payload;
    }
}

export class EnvironmentApiClient {
    constructor(basePath = "/api/environments") {
        this.basePath = basePath;
    }

    async listEnvironments() {
        return this.sendRequest("GET");
    }

    async createEnvironment(payload) {
        return this.sendRequest("POST", payload);
    }

    async getEnvironmentById(environmentId) {
        return this.sendRequest("GET", null, `/${environmentId}`);
    }

    async sendRequest(method, body = null, path = "") {
        const response = await fetch(`${this.basePath}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: body ? JSON.stringify(body) : undefined,
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok) {
            const message = payload?.error || "Request failed.";
            throw new ApiError(message, response.status, payload);
        }

        return payload;
    }
}

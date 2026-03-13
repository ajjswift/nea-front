export class BaseApiError extends Error {
    constructor(message, status, payload = null) {
        super(message);
        this.name = new.target.name;
        this.status = status;
        this.payload = payload;
    }
}

export class BaseApiClient {
    constructor(basePath, ErrorClass = BaseApiError) {
        this.basePath = basePath;
        this.ErrorClass = ErrorClass;
    }

    buildUrl(path = "") {
        return `${this.basePath}${path}`;
    }

    async sendRequest(method, path = "", body = null) {
        const response = await fetch(this.buildUrl(path), {
            method,
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: body == null ? undefined : JSON.stringify(body),
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok) {
            throw new this.ErrorClass(
                payload?.error || "Request failed.",
                response.status,
                payload,
            );
        }

        return payload;
    }
}

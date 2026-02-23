export class ClassroomApiError extends Error {
    constructor(message, status, payload = null) {
        super(message);
        this.name = "ClassroomApiError";
        this.status = status;
        this.payload = payload;
    }
}

export class ClassroomApiClient {
    constructor(basePath = "/api/classroom") {
        this.basePath = basePath;
    }

    async getDashboard() {
        return this.sendRequest("GET", `${this.basePath}/dashboard`);
    }

    async createClass(payload) {
        return this.sendRequest("POST", `${this.basePath}/classes`, payload);
    }

    async joinClassByCode(joinCode) {
        return this.sendRequest("POST", `${this.basePath}/join`, {
            joinCode,
        });
    }

    async setClassStudents(classId, usernames) {
        return this.sendRequest(
            "PUT",
            `${this.basePath}/classes/${classId}/students`,
            { usernames },
        );
    }

    async createAssignment(classId, payload) {
        return this.sendRequest(
            "POST",
            `${this.basePath}/classes/${classId}/assignments`,
            payload,
        );
    }

    async updateAssignment(assignmentId, payload) {
        return this.sendRequest(
            "PATCH",
            `${this.basePath}/assignments/${assignmentId}`,
            payload,
        );
    }

    async deleteAssignment(assignmentId) {
        return this.sendRequest(
            "DELETE",
            `${this.basePath}/assignments/${assignmentId}`,
        );
    }

    async deleteClass(classId) {
        return this.sendRequest("DELETE", `${this.basePath}/classes/${classId}`);
    }

    async getHelpQueue(classId = null) {
        const query = classId
            ? `?classId=${encodeURIComponent(classId)}`
            : "";
        return this.sendRequest("GET", `${this.basePath}/help${query}`);
    }

    async requestHelp(payload) {
        return this.sendRequest("POST", `${this.basePath}/help`, payload);
    }

    async resolveHelpRequest(helpRequestId) {
        return this.sendRequest(
            "PATCH",
            `${this.basePath}/help/${helpRequestId}`,
        );
    }

    async sendRequest(method, url, body = null) {
        const response = await fetch(url, {
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
            throw new ClassroomApiError(
                payload?.error || "Request failed.",
                response.status,
                payload,
            );
        }

        return payload;
    }
}

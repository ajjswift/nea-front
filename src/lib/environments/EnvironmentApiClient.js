import { BaseApiClient, BaseApiError } from "@/lib/api/BaseApiClient";

export class ApiError extends BaseApiError {}

export class EnvironmentApiClient extends BaseApiClient {
    constructor(basePath = "/api/environments") {
        super(basePath, ApiError);
    }

    async listEnvironments() {
        return this.sendRequest("GET");
    }

    async createEnvironment(payload) {
        return this.sendRequest("POST", "", payload);
    }

    async getEnvironmentById(environmentId) {
        return this.sendRequest("GET", `/${environmentId}`);
    }

    async updateEnvironment(environmentId, payload) {
        return this.sendRequest("PATCH", `/${environmentId}`, payload);
    }

    async deleteEnvironment(environmentId) {
        return this.sendRequest("DELETE", `/${environmentId}`);
    }

    async resetEnvironmentToTemplate(environmentId) {
        return this.sendRequest("POST", `/${environmentId}/reset-template`);
    }

    async formatPythonFile(environmentId, payload) {
        return this.sendRequest(
            "POST",
            `/${environmentId}/python-tools`,
            {
                action: "format",
                ...payload,
            },
        );
    }

    async lintPythonFile(environmentId, payload) {
        return this.sendRequest(
            "POST",
            `/${environmentId}/python-tools`,
            {
                action: "lint",
                ...payload,
            },
        );
    }

    async runAssignmentTests(environmentId, payload) {
        return this.sendRequest("POST", `/${environmentId}/assignment-tests`, payload);
    }

    async updateAssignmentSubmission(environmentId, payload) {
        return this.sendRequest("PATCH", `/${environmentId}/submission`, payload);
    }

    async createTeacherFeedbackComment(environmentId, payload) {
        return this.sendRequest(
            "POST",
            `/${environmentId}/feedback-comments`,
            payload,
        );
    }
}

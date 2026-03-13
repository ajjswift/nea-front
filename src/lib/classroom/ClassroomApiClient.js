import { BaseApiClient, BaseApiError } from "@/lib/api/BaseApiClient";

export class ClassroomApiError extends BaseApiError {}

export class ClassroomApiClient extends BaseApiClient {
    constructor(basePath = "/api/classroom") {
        super(basePath, ClassroomApiError);
    }

    async getDashboard() {
        return this.sendRequest("GET", "/dashboard");
    }

    async createClass(payload) {
        return this.sendRequest("POST", "/classes", payload);
    }

    async joinClassByCode(joinCode) {
        return this.sendRequest("POST", "/join", {
            joinCode,
        });
    }

    async setClassStudents(classId, usernames) {
        return this.sendRequest("PUT", `/classes/${classId}/students`, {
            usernames,
        });
    }

    async createAssignment(classId, payload) {
        return this.sendRequest("POST", `/classes/${classId}/assignments`, payload);
    }

    async updateAssignment(assignmentId, payload) {
        return this.sendRequest("PATCH", `/assignments/${assignmentId}`, payload);
    }

    async deleteAssignment(assignmentId) {
        return this.sendRequest("DELETE", `/assignments/${assignmentId}`);
    }

    async deleteClass(classId) {
        return this.sendRequest("DELETE", `/classes/${classId}`);
    }

    async getHelpQueue(classId = null) {
        const query = classId
            ? `?classId=${encodeURIComponent(classId)}`
            : "";
        return this.sendRequest("GET", `/help${query}`);
    }

    async requestHelp(payload) {
        return this.sendRequest("POST", "/help", payload);
    }

    async resolveHelpRequest(helpRequestId) {
        return this.sendRequest("PATCH", `/help/${helpRequestId}`);
    }
}

import { randomUUID } from "crypto";

export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}

export class EnvironmentService {
    constructor(environmentRepository) {
        this.environmentRepository = environmentRepository;
        this.allowedRuntimes = new Set(["python-3.11"]);
    }

    normalizeName(name) {
        if (typeof name !== "string") {
            return "";
        }

        return name.trim();
    }

    normalizeDescription(description) {
        if (typeof description !== "string") {
            return null;
        }

        const trimmed = description.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    normalizeRuntime(runtime) {
        if (typeof runtime !== "string") {
            return "python-3.11";
        }

        const normalized = runtime.trim().toLowerCase();
        if (!this.allowedRuntimes.has(normalized)) {
            throw new ValidationError("Unsupported runtime.");
        }

        return normalized;
    }

    async listForUser(userId) {
        return this.environmentRepository.listByUserId(userId);
    }

    async getForUser(userId, environmentId) {
        return this.environmentRepository.findByIdForUser(environmentId, userId);
    }

    async createForUser(userId, payload = {}) {
        const name = this.normalizeName(payload.name);
        const description = this.normalizeDescription(payload.description);
        const runtime = this.normalizeRuntime(payload.runtime);

        if (!name) {
            throw new ValidationError("Environment name is required.");
        }

        if (name.length > 80) {
            throw new ValidationError("Environment name must be 80 characters or fewer.");
        }

        if (description && description.length > 500) {
            throw new ValidationError(
                "Description must be 500 characters or fewer.",
            );
        }

        return this.environmentRepository.create({
            id: randomUUID(),
            userId,
            name,
            description,
            runtime,
            status: "active",
        });
    }

    async renameForUser(userId, environmentId, payload = {}) {
        const existingEnvironment = await this.getForUser(userId, environmentId);
        if (!existingEnvironment) {
            return null;
        }

        const name = this.normalizeName(payload.name);
        if (!name) {
            throw new ValidationError("Environment name is required.");
        }

        if (name.length > 80) {
            throw new ValidationError("Environment name must be 80 characters or fewer.");
        }

        return this.environmentRepository.updateForUser(environmentId, userId, {
            name,
            description: existingEnvironment.description,
        });
    }

    async deleteForUser(userId, environmentId) {
        return this.environmentRepository.deleteForUser(environmentId, userId);
    }
}

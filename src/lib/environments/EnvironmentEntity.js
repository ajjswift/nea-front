export class EnvironmentEntity {
    constructor({
        id,
        userId,
        name,
        description = null,
        runtime = "python-3.11",
        status = "active",
        createdAt = null,
        updatedAt = null,
        lastOpenedAt = null,
    }) {
        this.id = id;
        this.userId = userId;
        this.name = name;
        this.description = description;
        this.runtime = runtime;
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.lastOpenedAt = lastOpenedAt;
    }

    static fromRow(row) {
        return new EnvironmentEntity({
            id: row.id,
            userId: row.user_id,
            name: row.name,
            description: row.description,
            runtime: row.runtime,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastOpenedAt: row.last_opened_at,
        });
    }

    toJSON() {
        return {
            id: this.id,
            userId: this.userId,
            name: this.name,
            description: this.description,
            runtime: this.runtime,
            status: this.status,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            lastOpenedAt: this.lastOpenedAt,
        };
    }
}

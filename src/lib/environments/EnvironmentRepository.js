import { EnvironmentEntity } from "@/lib/environments/EnvironmentEntity";

export class EnvironmentRepository {
    constructor(database) {
        this.database = database;
    }

    async listByUserId(userId) {
        const result = await this.database.query(
            `
                SELECT
                    id,
                    user_id,
                    name,
                    description,
                    runtime,
                    status,
                    created_at,
                    updated_at,
                    last_opened_at
                FROM environments
                WHERE user_id = $1
                ORDER BY updated_at DESC, created_at DESC
            `,
            [userId],
        );

        return result.rows.map((row) => EnvironmentEntity.fromRow(row));
    }

    async findByIdForUser(environmentId, userId) {
        const result = await this.database.query(
            `
                SELECT
                    id,
                    user_id,
                    name,
                    description,
                    runtime,
                    status,
                    created_at,
                    updated_at,
                    last_opened_at
                FROM environments
                WHERE id = $1
                    AND user_id = $2
                LIMIT 1
            `,
            [environmentId, userId],
        );

        if (!result.rows.length) {
            return null;
        }

        return EnvironmentEntity.fromRow(result.rows[0]);
    }

    async findById(environmentId) {
        const result = await this.database.query(
            `
                SELECT
                    id,
                    user_id,
                    name,
                    description,
                    runtime,
                    status,
                    created_at,
                    updated_at,
                    last_opened_at
                FROM environments
                WHERE id = $1
                LIMIT 1
            `,
            [environmentId],
        );

        if (!result.rows.length) {
            return null;
        }

        return EnvironmentEntity.fromRow(result.rows[0]);
    }

    async create({ id, userId, name, description, runtime, status }) {
        const result = await this.database.query(
            `
                INSERT INTO environments (
                    id,
                    user_id,
                    name,
                    description,
                    runtime,
                    status,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                RETURNING
                    id,
                    user_id,
                    name,
                    description,
                    runtime,
                    status,
                    created_at,
                    updated_at,
                    last_opened_at
            `,
            [id, userId, name, description, runtime, status],
        );

        return EnvironmentEntity.fromRow(result.rows[0]);
    }

    async updateForUser(environmentId, userId, { name, description }) {
        const result = await this.database.query(
            `
                UPDATE environments
                SET
                    name = $3,
                    description = $4,
                    updated_at = NOW()
                WHERE id = $1
                    AND user_id = $2
                RETURNING
                    id,
                    user_id,
                    name,
                    description,
                    runtime,
                    status,
                    created_at,
                    updated_at,
                    last_opened_at
            `,
            [environmentId, userId, name, description],
        );

        if (!result.rows.length) {
            return null;
        }

        return EnvironmentEntity.fromRow(result.rows[0]);
    }

    async deleteForUser(environmentId, userId) {
        const result = await this.database.query(
            `
                DELETE FROM environments
                WHERE id = $1
                    AND user_id = $2
                RETURNING id
            `,
            [environmentId, userId],
        );

        return result.rows.length > 0;
    }
}

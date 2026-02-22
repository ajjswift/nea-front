export class SessionService {
    constructor(database) {
        this.database = database;
    }

    parseSessionCookie(rawCookieValue) {
        if (!rawCookieValue) {
            return null;
        }

        try {
            return JSON.parse(rawCookieValue);
        } catch {
            return null;
        }
    }

    async getAuthenticatedUser(request) {
        const cookieValue = request.cookies.get("session")?.value;
        const sessionPayload = this.parseSessionCookie(cookieValue);

        if (!sessionPayload?.sessionId || !sessionPayload?.userId) {
            return null;
        }

        let result;
        try {
            result = await this.database.query(
                `
                    SELECT
                        s.id AS session_id,
                        u.id AS user_id,
                        u.username AS username,
                        COALESCE(up.role, 'student') AS role
                    FROM session AS s
                    INNER JOIN users AS u
                        ON u.id = s.user_id
                    LEFT JOIN user_profiles AS up
                        ON up.user_id = u.id
                    WHERE s.id = $1
                        AND s.user_id = $2
                    LIMIT 1
                `,
                [sessionPayload.sessionId, sessionPayload.userId],
            );
        } catch (error) {
            // Backwards-compatible fallback for deployments where user_profiles
            // hasn't been created yet.
            if (error?.code !== "42P01") {
                throw error;
            }

            result = await this.database.query(
                `
                    SELECT
                        s.id AS session_id,
                        u.id AS user_id,
                        u.username AS username
                    FROM session AS s
                    INNER JOIN users AS u
                        ON u.id = s.user_id
                    WHERE s.id = $1
                        AND s.user_id = $2
                    LIMIT 1
                `,
                [sessionPayload.sessionId, sessionPayload.userId],
            );
        }

        if (!result.rows?.length) {
            return null;
        }

        const row = result.rows[0];
        return {
            sessionId: row.session_id,
            userId: row.user_id,
            username: row.username,
            role: row.role || "student",
        };
    }
}

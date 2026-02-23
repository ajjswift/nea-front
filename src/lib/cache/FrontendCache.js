import { redis } from "@/utils/redis";

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export class RedisCacheService {
    constructor({
        client = redis,
        prefix = "front:v1",
        defaultTtlSeconds = 30,
        enabled = process.env.REDIS_CACHE_ENABLED !== "false",
    } = {}) {
        this.client = client;
        this.prefix = prefix;
        this.defaultTtlSeconds = defaultTtlSeconds;
        this.enabled = enabled;
    }

    toScopedKey(key) {
        return `${this.prefix}:${key}`;
    }

    async getJson(key) {
        if (!this.enabled) return null;

        try {
            const raw = await this.client.get(this.toScopedKey(key));
            if (raw === null || raw === undefined) {
                return null;
            }
            return JSON.parse(raw);
        } catch (error) {
            console.error("Cache get failed:", error);
            return null;
        }
    }

    async setJson(key, value, ttlSeconds = this.defaultTtlSeconds) {
        if (!this.enabled) return;

        try {
            const scopedKey = this.toScopedKey(key);
            const serialized = JSON.stringify(value);
            const ttl = toNumber(ttlSeconds, this.defaultTtlSeconds);

            if (ttl > 0) {
                await this.client.set(scopedKey, serialized, "EX", ttl);
                return;
            }

            await this.client.set(scopedKey, serialized);
        } catch (error) {
            console.error("Cache set failed:", error);
        }
    }

    async getOrSetJson(key, loader, ttlSeconds = this.defaultTtlSeconds) {
        const cached = await this.getJson(key);
        if (cached !== null) {
            return cached;
        }

        const value = await loader();
        await this.setJson(key, value, ttlSeconds);
        return value;
    }

    async deleteKey(key) {
        if (!this.enabled) return;

        try {
            await this.client.del(this.toScopedKey(key));
        } catch (error) {
            console.error("Cache delete failed:", error);
        }
    }

    async deleteByPrefix(prefix) {
        if (!this.enabled) return;

        const matchPattern = this.toScopedKey(`${prefix}*`);
        let cursor = "0";

        try {
            do {
                const [nextCursor, keys] = await this.client.scan(
                    cursor,
                    "MATCH",
                    matchPattern,
                    "COUNT",
                    200,
                );

                if (Array.isArray(keys) && keys.length > 0) {
                    await this.client.del(...keys);
                }

                cursor = nextCursor;
            } while (cursor !== "0");
        } catch (error) {
            console.error("Cache prefix delete failed:", error);
        }
    }
}

export class FrontendCacheKeyFactory {
    environmentList(userId) {
        return `env:list:${userId}`;
    }

    environmentDetail(userId, environmentId) {
        return `env:detail:${userId}:${environmentId}`;
    }

    classroomDashboard(role, userId) {
        return `classroom:dashboard:${role}:${userId}`;
    }

    teacherClasses(userId) {
        return `classroom:classes:${userId}`;
    }

    classStudents(teacherId, classId) {
        return `classroom:students:${teacherId}:${classId}`;
    }

    classAssignments(teacherId, classId) {
        return `classroom:assignments:${teacherId}:${classId}`;
    }

    teacherHelpQueue(teacherId, classId = "all") {
        return `classroom:help:${teacherId}:${classId || "all"}`;
    }
}

export class FrontendCacheInvalidator {
    constructor(cacheService, keyFactory = new FrontendCacheKeyFactory()) {
        this.cacheService = cacheService;
        this.keyFactory = keyFactory;
    }

    async invalidateEnvironmentForUser(userId) {
        await Promise.all([
            this.cacheService.deleteKey(this.keyFactory.environmentList(userId)),
            this.cacheService.deleteByPrefix(`env:detail:${userId}:`),
        ]);
    }

    async invalidateAfterClassroomMutation() {
        await Promise.all([
            this.cacheService.deleteByPrefix("classroom:"),
            this.cacheService.deleteByPrefix("env:"),
        ]);
    }
}

const frontendCacheService = new RedisCacheService({
    client: redis,
    prefix: process.env.FRONTEND_CACHE_PREFIX || "front:v1",
    defaultTtlSeconds: toNumber(process.env.FRONTEND_CACHE_TTL_SECONDS, 30),
});

const frontendCacheKeys = new FrontendCacheKeyFactory();
const frontendCacheInvalidator = new FrontendCacheInvalidator(
    frontendCacheService,
    frontendCacheKeys,
);

export { frontendCacheService, frontendCacheKeys, frontendCacheInvalidator };

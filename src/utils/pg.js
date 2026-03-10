const { Pool } = require("pg");

function parseInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URI ||
    "";

const poolConfig = connectionString
    ? {
          connectionString,
      }
    : {
          user: process.env.PGUSER || "postgres",
          host: process.env.PGHOST || "127.0.0.1",
          database: process.env.PGDATABASE || "postgres",
          password: process.env.PGPASSWORD || "postgres",
          port: parseInteger(process.env.PGPORT, 5432),
      };

if (process.env.PGSSLMODE === "require" || process.env.POSTGRES_SSL === "true") {
    poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

function buildBeginStatement(isolationLevel) {
    if (!isolationLevel) {
        return "BEGIN";
    }

    return `BEGIN ISOLATION LEVEL ${isolationLevel}`;
}

/**
 * Log when the pool connects to the database
 */
pool.on("connect", () => {
    console.log("Postgres pool connected");
});

/**
 * Global error handler for the idle pool clients
 */
pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
});

module.exports = {
    /**
     * Helper function to execute queries.
     * This automatically handles acquiring and releasing a client.
     * @param {string} text - The SQL query string
     * @param {Array} params - The array of values for parameterized queries
     */
    query: (text, params) => pool.query(text, params),

    /**
     * Helper to manually get a client if you need to run a transaction
     */
    getClient: () => pool.connect(),

    /**
     * Execute a unit of work inside a transaction.
     * Rolls back on failure and always releases the client.
     * @param {(client: import("pg").PoolClient) => Promise<any>} callback
     * @param {{ isolationLevel?: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE" }} options
     */
    withTransaction: async (callback, options = {}) => {
        const client = await pool.connect();

        try {
            await client.query(
                buildBeginStatement(options.isolationLevel || null),
            );
            const result = await callback(client);
            await client.query("COMMIT");
            return result;
        } catch (error) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Failed to rollback transaction", rollbackError);
            }

            throw error;
        } finally {
            client.release();
        }
    },

    /**
     * Gracefully shut down the pool (useful for scripts or tests)
     */
    end: () => pool.end(),
};

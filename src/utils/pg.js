const { Pool } = require("pg");

/**
 * Configuration for the Postgres Pool.
 * On macOS with Homebrew, you often don't need a password
 * if your local user matches your Postgres role.
 */
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "postgres",
    password: "postgres",
    port: 5432,
});

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
    process.exit(-1);
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
     * Gracefully shut down the pool (useful for scripts or tests)
     */
    end: () => pool.end(),
};

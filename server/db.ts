
import "dotenv/config";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const databaseHost = databaseUrl ? new URL(databaseUrl).hostname : undefined;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

const connectionTimeoutMillis = Number(
  process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000,
);
const idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000);
const statementTimeoutMillis = Number(
  process.env.DB_STATEMENT_TIMEOUT_MS ?? 10000,
);

if (!Number.isFinite(connectionTimeoutMillis) || connectionTimeoutMillis <= 0) {
  throw new Error("DB_CONNECTION_TIMEOUT_MS must be a positive number");
}
if (!Number.isFinite(idleTimeoutMillis) || idleTimeoutMillis <= 0) {
  throw new Error("DB_IDLE_TIMEOUT_MS must be a positive number");
}
if (!Number.isFinite(statementTimeoutMillis) || statementTimeoutMillis <= 0) {
  throw new Error("DB_STATEMENT_TIMEOUT_MS must be a positive number");
}

export const pool = new Pool({
  connectionString: databaseUrl,
  application_name: "worksphere-api",
  connectionTimeoutMillis,
  idleTimeoutMillis,
  ssl:
    databaseHost && !localHosts.has(databaseHost)
      ? { rejectUnauthorized: false }
      : undefined,
});

// Apply a per-statement timeout so runaway queries cannot block the pool.
// pg emits this as a run event on each client.
pool.on("connect", (client) => {
  void client.query(
    `SET statement_timeout = ${statementTimeoutMillis}`,
  ).catch((error) => {
    console.error(
      "Failed to set statement timeout:",
      error instanceof Error ? error.message : "Unknown error",
    );
  });
});

pool.on("error", (err) => {
  console.error(
    "Unexpected PostgreSQL connection error:",
    err instanceof Error ? err.message : "Unknown error",
  );
});

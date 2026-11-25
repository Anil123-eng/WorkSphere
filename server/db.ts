
import "dotenv/config";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const databaseHost = databaseUrl ? new URL(databaseUrl).hostname : undefined;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    databaseHost && !localHosts.has(databaseHost)
      ? { rejectUnauthorized: false }
      : undefined,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL connection error:", err.message);
});

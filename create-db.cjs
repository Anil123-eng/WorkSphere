require("dotenv").config();

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const databaseUrl = process.env.DATABASE_URL;
const databaseHost = databaseUrl ? new URL(databaseUrl).hostname : undefined;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    databaseHost && !localHosts.has(databaseHost)
      ? { rejectUnauthorized: false }
      : undefined,
});

async function initializeDatabase() {
  try {
    const schemaFiles = [
      path.join(__dirname, "server", "database", "schema.sql"),
      path.join(__dirname, "server", "database", "auth-schema.sql"),
      path.join(__dirname, "server", "database", "assessment-07-schema.sql"),
      path.join(__dirname, "server", "database", "assessment-08-schema.sql"),
      path.join(__dirname, "server", "database", "assessment-15-schema.sql"),
    ];
    let sql = schemaFiles
      .map((schemaFile) => fs.readFileSync(schemaFile, "utf8"))
      .join("\n");

    sql = sql.replace(
      /CREATE TABLE\s+(?!IF NOT EXISTS\b)/gi,
      "CREATE TABLE IF NOT EXISTS "
    );

    sql = sql.replace(
      /CREATE INDEX\s+(?!IF NOT EXISTS\b)/gi,
      "CREATE INDEX IF NOT EXISTS "
    );

    await pool.query(sql);

    console.log("Database schema initialized successfully.");
  } catch (error) {
    console.error("Database initialization failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initializeDatabase();
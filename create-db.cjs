const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initializeDatabase() {
  try {
    const schemaFiles = [
      path.join(__dirname, "server", "database", "schema.sql"),
      path.join(__dirname, "server", "database", "auth-schema.sql"),
    ];
    let sql = schemaFiles
      .map((schemaFile) => fs.readFileSync(schemaFile, "utf8"))
      .join("\n");

    sql = sql.replace(
      /CREATE TABLE\s+/gi,
      "CREATE TABLE IF NOT EXISTS "
    );

    sql = sql.replace(
      /CREATE INDEX\s+/gi,
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
const { Pool } = require("pg");
const fs = require("fs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initializeDatabase() {
  try {
    let sql = fs.readFileSync(
      "server/database/schema.sql",
      "utf8"
    );

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
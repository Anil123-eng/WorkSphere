require("dotenv").config();

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exitCode = 1;
  process.exit();
}

const databaseHost = new URL(databaseUrl).hostname;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    databaseHost && !localHosts.has(databaseHost)
      ? { rejectUnauthorized: false }
      : undefined,
});

const migrationsDir = path.join(__dirname, "database", "migrations");

function listMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function ensureMigrationLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function isMigrationApplied(client, name) {
  const result = await client.query(
    "SELECT 1 FROM schema_migrations WHERE name = $1",
    [name]
  );
  return result.rows.length > 0;
}

async function recordMigration(client, name) {
  await client.query(
    "INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
    [name]
  );
}

async function runMigrations() {
  const appPassword = process.env.WORKSPHERE_APP_PASSWORD;
  if (
    !appPassword ||
    !/^[A-Za-z0-9_-]{32,}$/.test(appPassword)
  ) {
    console.error(
      "WORKSPHERE_APP_PASSWORD must be at least 32 URL-safe characters"
    );
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('worksphere.app_password', $1, true)",
      [appPassword]
    );
    await ensureMigrationLedger(client);

    const files = listMigrationFiles();
    let applied = 0;
    let skipped = 0;

    for (const file of files) {
      const name = file;
      if (await isMigrationApplied(client, name)) {
        skipped++;
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      await recordMigration(client, name);
      applied++;
      console.log(`Applied migration: ${name}`);
    }

    await client.query("COMMIT");
    console.log(
      `Migration check complete: ${applied} applied, ${skipped} already applied, ${files.length} total.`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();

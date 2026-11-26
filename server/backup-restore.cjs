require("dotenv").config();

const { Pool } = require("pg");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const databaseUrl = process.env.DATABASE_URL;
const backupDir = path.join(__dirname, "..", "backups");
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);
const identifierPattern = /^[A-Za-z0-9_]+$/;
const containerPattern = /^[A-Za-z0-9_.-]+$/;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!databaseUrl) {
  fail("DATABASE_URL is required");
}

let target;
if (databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    const username = decodeURIComponent(url.username);
    const containerName =
      process.env.WORKSPHERE_POSTGRES_CONTAINER || "worksphere-postgres";

    if (!localHosts.has(url.hostname)) {
      fail("Backup and restore commands are restricted to local databases");
    } else if (
      !identifierPattern.test(databaseName) ||
      !/^[A-Za-z0-9_.-]+$/.test(username) ||
      !containerPattern.test(containerName)
    ) {
      fail("Database name, user, or container name is invalid");
    } else {
      target = {
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || "5432",
        username,
        password: decodeURIComponent(url.password),
        databaseName,
        containerName,
        adminUrl: (() => {
          url.pathname = "/postgres";
          return url.toString();
        })(),
      };
    }
  } catch {
    fail("DATABASE_URL must be a valid PostgreSQL URL");
  }
}

function ensureBackupDir() {
  fs.mkdirSync(backupDir, { recursive: true });
}

function runCommand(executable, args, stdio = "inherit") {
  const result = spawnSync(executable, args, {
    stdio,
    env: {
      ...process.env,
      PGPASSWORD: target.password,
    },
  });

  if (result.error) {
    console.error(`Could not run ${executable}: ${result.error.code || "unknown error"}`);
    return false;
  }

  if (result.status !== 0) {
    console.error(`${executable} failed with status ${result.status ?? "unknown"}`);
    return false;
  }

  return true;
}

function hasLocalPgDump() {
  const result = spawnSync("pg_dump", ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function pgDumpCommand() {
  if (hasLocalPgDump()) {
    return {
      executable: "pg_dump",
      args: [
        "-h",
        target.host,
        "-p",
        target.port,
        "-U",
        target.username,
        "-d",
        target.databaseName,
        "--no-owner",
        "--no-privileges",
      ],
    };
  }

  return {
    executable: "docker",
    args: [
      "exec",
      target.containerName,
      "pg_dump",
      "-U",
      target.username,
      "-d",
      target.databaseName,
      "--no-owner",
      "--no-privileges",
    ],
  };
}

function pgRestoreCommand(backupFile) {
  if (hasLocalPgDump()) {
    return {
      executable: "psql",
      args: [
        "-h",
        target.host,
        "-p",
        target.port,
        "-U",
        target.username,
        "-d",
        target.databaseName,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        backupFile,
      ],
      stdio: "inherit",
    };
  }

  return {
    executable: "docker",
    args: [
      "exec",
      "-i",
      target.containerName,
      "psql",
      "-U",
      target.username,
      "-d",
      target.databaseName,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    stdio: [fs.openSync(backupFile, "r"), "inherit", "inherit"],
  };
}

async function backup() {
  ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `worksphere_${timestamp}.sql`);
  const fileDescriptor = fs.openSync(backupFile, "wx");
  const { executable, args } = pgDumpCommand();

  console.log(`Backing up local database "${target.databaseName}"...`);

  let success;
  try {
    success = runCommand(executable, args, ["ignore", fileDescriptor, "inherit"]);
  } finally {
    fs.closeSync(fileDescriptor);
  }

  if (success && fs.statSync(backupFile).size > 0) {
    console.log(`Backup completed: ${backupFile}`);
    return;
  }

  fs.rmSync(backupFile, { force: true });
  fail("Backup failed or produced an empty file");
}

async function restore(backupFile) {
  if (!fs.existsSync(backupFile) || !fs.statSync(backupFile).isFile()) {
    fail("Backup file does not exist or is not a regular file");
    return;
  }

  const adminPool = new Pool({ connectionString: target.adminUrl });
  try {
    await adminPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [target.databaseName]
    );
    await adminPool.query(
      `DROP DATABASE IF EXISTS "${target.databaseName}"`
    );
    await adminPool.query(
      `CREATE DATABASE "${target.databaseName}"`
    );
  } catch (error) {
    fail(`Could not recreate local database (${error instanceof Error ? error.name : "unknown error"})`);
    return;
  } finally {
    await adminPool.end();
  }

  const command = pgRestoreCommand(backupFile);
  let success;
  try {
    success = runCommand(command.executable, command.args, command.stdio);
  } finally {
    if (Array.isArray(command.stdio) && typeof command.stdio[0] === "number") {
      fs.closeSync(command.stdio[0]);
    }
  }

  if (success) {
    console.log(`Restore completed into local database "${target.databaseName}".`);
  } else {
    fail("Restore failed");
  }
}

const command = process.argv[2];
if (process.exitCode !== 1 && target && command === "backup") {
  void backup().catch((error) => {
    fail(`Backup failed (${error instanceof Error ? error.name : "unknown error"})`);
  });
} else if (process.exitCode !== 1 && target && command === "restore" && process.argv[3]) {
  void restore(path.resolve(process.argv[3])).catch((error) => {
    fail(`Restore failed (${error instanceof Error ? error.name : "unknown error"})`);
  });
} else if (process.exitCode !== 1) {
  fail("Usage: node server/backup-restore.cjs [backup|restore <backup-file>]");
}

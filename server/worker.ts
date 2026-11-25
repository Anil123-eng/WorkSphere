
import "dotenv/config";

import { pool } from "./db";
import { startJobWorker } from "./utils/backgroundJobs";
import { taskEvents } from "./utils/taskEvents";

const workerInterval = startJobWorker();

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("Shutting down WorkSphere worker...");

  clearInterval(workerInterval);

  try {
    await taskEvents.closeRedisConnections();
    await pool.end();
    console.log("WorkSphere worker stopped.");
    process.exit(0);
  } catch (error) {
    console.error(
      "Worker shutdown failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

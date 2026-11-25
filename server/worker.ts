
import "dotenv/config";

import { writeFile } from "fs/promises";
import { pool } from "./db";
import { startJobWorker } from "./utils/backgroundJobs";
import { taskEvents } from "./utils/taskEvents";

const workerInterval = startJobWorker();
const heartbeatFile = "/tmp/worksphere-worker-health";

let shuttingDown = false;
let heartbeatRunning = false;

async function updateHeartbeat() {
  if (heartbeatRunning || shuttingDown) return;

  heartbeatRunning = true;

  try {
    await pool.query("SELECT 1");
    await writeFile(heartbeatFile, String(Date.now()));
  } catch (error) {
    console.error(
      "Worker heartbeat failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  } finally {
    heartbeatRunning = false;
  }
}

void updateHeartbeat();

const heartbeatInterval = setInterval(() => {
  void updateHeartbeat();
}, 10000);

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("Shutting down WorkSphere worker...");

  clearInterval(workerInterval);
  clearInterval(heartbeatInterval);

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

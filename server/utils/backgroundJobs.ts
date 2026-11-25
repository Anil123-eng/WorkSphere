
import { pool } from "../db";
import { taskEvents, TaskEvent } from "./taskEvents";

interface BackgroundJob {
  id: number;
  organization_id: number;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function enqueueJob(
  organizationId: number,
  jobType: string,
  payload: Record<string, unknown>,
  idempotencyKey: string
): Promise<void> {
  await pool.query(
    `INSERT INTO background_jobs
       (organization_id, job_type, payload, idempotency_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [organizationId, jobType, JSON.stringify(payload), idempotencyKey]
  );
}

async function claimJob(): Promise<BackgroundJob | null> {
  // Recover jobs abandoned by a stopped worker.
  await pool.query(
    `UPDATE background_jobs
     SET status = 'pending',
         locked_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'processing'
       AND locked_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'`
  );

  const result = await pool.query(
    `WITH next_job AS (
       SELECT id
       FROM background_jobs
       WHERE status = 'pending'
         AND run_at <= CURRENT_TIMESTAMP
       ORDER BY run_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE background_jobs AS job
     SET status = 'processing',
         attempts = attempts + 1,
         locked_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     FROM next_job
     WHERE job.id = next_job.id
     RETURNING job.id, job.organization_id, job.job_type,
               job.payload, job.attempts, job.max_attempts`
  );

  return result.rows[0] ?? null;
}

async function processJob(job: BackgroundJob): Promise<void> {
  if (job.job_type === "task_event") {
    const payload = job.payload;

    // PostgreSQL BIGINT values may arrive as strings through node-postgres.
    const projectId = Number(payload.projectId);
    const taskId = Number(payload.taskId);

    if (
      (payload.type !== "task.created" &&
        payload.type !== "task.updated") ||
      !Number.isSafeInteger(projectId) ||
      projectId <= 0 ||
      !Number.isSafeInteger(taskId) ||
      taskId <= 0
    ) {
      throw new Error("Invalid task event payload");
    }

    const event: TaskEvent = {
      type: payload.type,
      organizationId: Number(job.organization_id),
      projectId,
      taskId,
      timestamp: new Date().toISOString(),
    };

    taskEvents.publish(event);
    return;
  }

  throw new Error(`Unsupported job type: ${job.job_type}`);
}

async function handleJob(job: BackgroundJob): Promise<void> {
  try {
    await processJob(job);

    await pool.query(
      `UPDATE background_jobs
       SET status = 'completed',
           locked_at = NULL,
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [job.id]
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown job error";

    if (job.attempts >= job.max_attempts) {
      await pool.query(
        `UPDATE background_jobs
         SET status = 'dead',
             locked_at = NULL,
             last_error = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [job.id, message]
      );
    } else {
      const delaySeconds = Math.min(2 ** job.attempts * 5, 300);

      await pool.query(
        `UPDATE background_jobs
         SET status = 'pending',
             run_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second'),
             locked_at = NULL,
             last_error = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [job.id, delaySeconds, message]
      );
    }
  }
}

let workerRunning = false;

export async function processPendingJobs(): Promise<void> {
  if (workerRunning) return;

  workerRunning = true;

  try {
    const job = await claimJob();

    if (job) {
      await handleJob(job);
    }
  } catch (error) {
    console.error("Background worker error:", error);
  } finally {
    workerRunning = false;
  }
}

export function startJobWorker(): void {
  console.log("WorkSphere background job worker started");

  void processPendingJobs();

  setInterval(() => {
    void processPendingJobs();
  }, 3000);
}

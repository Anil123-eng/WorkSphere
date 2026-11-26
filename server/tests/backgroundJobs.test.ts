import { randomUUID } from "crypto";
import { pool } from "../db";
import { loadTaskEventReplayPage } from "../routes/taskEventRoutes";
import { enqueueJob, processPendingJobs } from "../utils/backgroundJobs";
import { taskEvents } from "../utils/taskEvents";

jest.mock("../utils/taskEvents", () => ({
  taskEvents: {
    publish: jest.fn(),
  },
}));

describe("Background job retries", () => {
  let organizationId: number;
  const mockedPublish = jest.mocked(taskEvents.publish);

  beforeAll(async () => {
    const result = await pool.query(
      "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
      [`Background Job Test Organization ${randomUUID()}`]
    );
    organizationId = Number(result.rows[0].id);
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await pool.query("DELETE FROM organizations WHERE id = $1", [
          organizationId,
        ]);
      }
    } finally {
      await pool.end();
    }
  });

  beforeEach(() => {
    mockedPublish.mockReset();
  });

  test("keeps a job pending through database latency and resumes polling", async () => {
    const idempotencyKey = `database-latency-${randomUUID()}`;
    await enqueueJob(
      organizationId,
      "task_event",
      { type: "task.created", projectId: 1, taskId: 1 },
      idempotencyKey
    );

    const querySpy = jest.spyOn(pool, "query").mockImplementationOnce(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        throw new Error("Simulated database latency timeout");
      }
    );
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await processPendingJobs();
    } finally {
      querySpy.mockRestore();
      consoleError.mockRestore();
    }

    const pending = await pool.query(
      `SELECT status, attempts
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(pending.rows[0]).toMatchObject({ status: "pending", attempts: 0 });

    await processPendingJobs();

    const recovered = await pool.query(
      `SELECT status
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(recovered.rows[0].status).toBe("completed");
    expect(mockedPublish).toHaveBeenCalledTimes(1);
  });

  test("reschedules a job during a simulated Redis outage", async () => {
    const idempotencyKey = `retry-${randomUUID()}`;
    mockedPublish.mockRejectedValueOnce(new Error("Simulated Redis outage"));

    await enqueueJob(
      organizationId,
      "task_event",
      { type: "task.created", projectId: 1, taskId: 1 },
      idempotencyKey
    );

    const errorLog = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await processPendingJobs();
    } finally {
      errorLog.mockRestore();
    }

    const result = await pool.query(
      `SELECT status, attempts, max_attempts, locked_at, last_error,
              run_at > CURRENT_TIMESTAMP AS retry_scheduled
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      max_attempts: 3,
      locked_at: null,
      last_error: "Simulated Redis outage",
      retry_scheduled: true,
    });
    expect(mockedPublish).toHaveBeenCalledTimes(1);

    await pool.query(
      `UPDATE background_jobs
       SET run_at = CURRENT_TIMESTAMP
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    await processPendingJobs();

    const recovered = await pool.query(
      `SELECT status
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(recovered.rows[0].status).toBe("completed");
    expect(mockedPublish).toHaveBeenCalledTimes(2);
  });

  test("retries when subscribers are absent and completes after recovery", async () => {
    const idempotencyKey = `no-subscriber-${randomUUID()}`;
    await enqueueJob(
      organizationId,
      "task_event",
      { type: "task.updated", projectId: 1, taskId: 1, version: 2 },
      idempotencyKey
    );
    const stored = await pool.query(
      "SELECT id FROM background_jobs WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    mockedPublish.mockRejectedValueOnce(
      new Error("No task-event subscribers are available")
    );
    const errorLog = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await processPendingJobs();
      expect(errorLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: "error",
          event: "background_job_attempt_failed",
          jobId: String(stored.rows[0].id),
          jobType: "task_event",
          attempt: 1,
          maxAttempts: 3,
          errorType: "Error",
        })
      );
    } finally {
      errorLog.mockRestore();
    }

    const pending = await pool.query(
      `SELECT status, attempts, last_error, locked_at
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(pending.rows[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: "No task-event subscribers are available",
      locked_at: null,
    });
    const pendingCursor = await pool.query(
      `SELECT (id - 1)::text AS value
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    const pendingReplay = await loadTaskEventReplayPage(
      organizationId,
      pendingCursor.rows[0].value
    );
    expect(pendingReplay.events).toContainEqual(
      expect.objectContaining({
        eventId: `background-job:${stored.rows[0].id}`,
        type: "task.updated",
        taskId: 1,
        version: 2,
      })
    );

    await pool.query(
      `UPDATE background_jobs
       SET run_at = CURRENT_TIMESTAMP
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    await processPendingJobs();

    const completed = await pool.query(
      `SELECT status
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(completed.rows[0].status).toBe("completed");
    expect(mockedPublish).toHaveBeenCalledTimes(2);
    expect(mockedPublish.mock.calls[0][0].eventId).toBe(
      `background-job:${stored.rows[0].id}`
    );
    expect(mockedPublish.mock.calls[1][0].eventId).toBe(
      mockedPublish.mock.calls[0][0].eventId
    );

    const cursor = await pool.query(
      `SELECT id, (id - 1)::text AS value
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    const replay = await loadTaskEventReplayPage(
      organizationId,
      cursor.rows[0].value
    );
    expect(replay.events).toContainEqual(
      expect.objectContaining({
        eventId: `background-job:${stored.rows[0].id}`,
        type: "task.updated",
        taskId: 1,
        version: 2,
      })
    );
  });

  test("reclaims an abandoned processing job after a worker restart", async () => {
    const idempotencyKey = `worker-restart-${randomUUID()}`;
    await enqueueJob(
      organizationId,
      "task_event",
      { type: "task.created", projectId: 1, taskId: 1 },
      idempotencyKey
    );
    const stored = await pool.query(
      "SELECT id FROM background_jobs WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    await pool.query(
      `UPDATE background_jobs
       SET status = 'processing',
           attempts = 1,
           locked_at = CURRENT_TIMESTAMP - INTERVAL '6 minutes'
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    await processPendingJobs();

    const recovered = await pool.query(
      `SELECT status, attempts, locked_at
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(recovered.rows[0]).toMatchObject({
      status: "completed",
      attempts: 2,
      locked_at: null,
    });
    expect(mockedPublish).toHaveBeenCalledTimes(1);
    expect(mockedPublish.mock.calls[0][0].eventId).toBe(
      `background-job:${stored.rows[0].id}`
    );
  });

  test("reuses the same event ID when a published job is delivered again", async () => {
    const idempotencyKey = `duplicate-${randomUUID()}`;
    await enqueueJob(
      organizationId,
      "task_event",
      { type: "task.updated", projectId: 1, taskId: 1, version: 2 },
      idempotencyKey
    );

    await enqueueJob(
      organizationId,
      "task_event",
      { type: "task.updated", projectId: 1, taskId: 1, version: 2 },
      idempotencyKey
    );

    const stored = await pool.query(
      "SELECT id FROM background_jobs WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    expect(stored.rows).toHaveLength(1);

    await processPendingJobs();
    await pool.query(
      `UPDATE background_jobs
       SET status = 'pending', run_at = CURRENT_TIMESTAMP
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    await processPendingJobs();

    expect(mockedPublish).toHaveBeenCalledTimes(2);
    const firstEvent = mockedPublish.mock.calls[0][0];
    const retriedEvent = mockedPublish.mock.calls[1][0];
    expect(firstEvent.eventId).toBe(`background-job:${stored.rows[0].id}`);
    expect(retriedEvent.eventId).toBe(firstEvent.eventId);
  });

  test("moves a job to dead after its final failed attempt", async () => {
    const idempotencyKey = `dead-${randomUUID()}`;
    mockedPublish.mockRejectedValueOnce(new Error("Simulated publish failure"));

    await enqueueJob(
      organizationId,
      "task_event",
      { type: "task.created", projectId: 1, taskId: 1 },
      idempotencyKey
    );
    await pool.query(
      `UPDATE background_jobs
       SET attempts = 2
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    const errorLog = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await processPendingJobs();
    } finally {
      errorLog.mockRestore();
    }

    const result = await pool.query(
      `SELECT status, attempts, max_attempts, locked_at, last_error
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      status: "dead",
      attempts: 3,
      max_attempts: 3,
      locked_at: null,
      last_error: "Simulated publish failure",
    });
    expect(mockedPublish).toHaveBeenCalledTimes(1);

    const cursor = await pool.query(
      `SELECT id, (id - 1)::text AS value
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    const replay = await loadTaskEventReplayPage(
      organizationId,
      cursor.rows[0].value
    );
    expect(replay.events).toContainEqual(
      expect.objectContaining({
        eventId: `background-job:${cursor.rows[0].id}`,
        type: "task.created",
        taskId: 1,
      })
    );
  });
});

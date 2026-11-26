import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticateToken } from "../middleware/authMiddleware";
import { taskEvents, TaskEvent } from "../utils/taskEvents";

const router = Router();
const REPLAY_PAGE_SIZE = 100;
const MAX_POSTGRES_BIGINT = "9223372036854775807";

interface OutboxTaskEventRow {
  id: string | number;
  organization_id: string | number;
  payload: Record<string, unknown>;
  created_at: Date | string;
}

export interface TaskEventReplayPage {
  events: TaskEvent[];
  nextAfterId: string;
  hasMore: boolean;
}

function isValidPostgresId(value: string): boolean {
  return (
    /^[1-9]\d*$/.test(value) &&
    (value.length < MAX_POSTGRES_BIGINT.length ||
      (value.length === MAX_POSTGRES_BIGINT.length &&
        value <= MAX_POSTGRES_BIGINT))
  );
}

function toTaskEvent(row: OutboxTaskEventRow): TaskEvent | null {
  if (
    !row.payload ||
    typeof row.payload !== "object" ||
    Array.isArray(row.payload)
  ) {
    return null;
  }

  const taskType = row.payload.type;
  const projectId = Number(row.payload.projectId);
  const taskId = Number(row.payload.taskId);
  const organizationId = Number(row.organization_id);
  const timestamp = new Date(row.created_at);
  const version =
    row.payload.version === undefined ? undefined : Number(row.payload.version);

  if (
    (taskType !== "task.created" && taskType !== "task.updated") ||
    !Number.isSafeInteger(organizationId) ||
    organizationId <= 0 ||
    !Number.isSafeInteger(projectId) ||
    projectId <= 0 ||
    !Number.isSafeInteger(taskId) ||
    taskId <= 0 ||
    Number.isNaN(timestamp.getTime()) ||
    (version !== undefined &&
      (!Number.isSafeInteger(version) || version < 1))
  ) {
    return null;
  }

  return {
    eventId: `background-job:${row.id}`,
    type: taskType,
    organizationId,
    projectId,
    taskId,
    timestamp: timestamp.toISOString(),
    ...(version === undefined ? {} : { version }),
  };
}

export async function loadTaskEventReplayPage(
  organizationId: number,
  afterJobId: string
): Promise<TaskEventReplayPage> {
  const result = await pool.query<OutboxTaskEventRow>(
    `SELECT id, organization_id, payload, created_at
     FROM background_jobs
     WHERE organization_id = $1
       AND job_type = 'task_event'
       AND id > $2::bigint
     ORDER BY id
     LIMIT $3`,
    [organizationId, afterJobId, REPLAY_PAGE_SIZE]
  );
  const events: TaskEvent[] = [];

  for (const row of result.rows) {
    const event = toTaskEvent(row);
    if (event) {
      events.push(event);
    } else {
      console.error(
        JSON.stringify({
          level: "error",
          event: "invalid_task_event_outbox_record",
          jobId: String(row.id),
        })
      );
    }
  }

  return {
    events,
    nextAfterId:
      result.rows.length > 0
        ? String(result.rows[result.rows.length - 1].id)
        : afterJobId,
    hasMore: result.rows.length === REPLAY_PAGE_SIZE,
  };
}

function writeTaskEvent(res: Response, event: TaskEvent): void {
  if (event.eventId) {
    res.write(`id: ${event.eventId}\n`);
  }
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function streamTaskEvents(
  req: Request,
  res: Response
): Promise<void> {
  const organizationId = req.user!.organizationId;
  const lastEventId = req.get("Last-Event-ID");
  const match = lastEventId?.match(/^background-job:([1-9]\d*)$/);
  const afterJobId = match?.[1];

  if (lastEventId && (!afterJobId || !isValidPostgresId(afterJobId))) {
    res.status(400).json({
      success: false,
      message: "Invalid Last-Event-ID",
    });
    return;
  }

  let closed = false;
  let ready = false;
  const bufferedEvents: TaskEvent[] = [];
  const replayedEventIds = new Set<string>();
  const unsubscribe = taskEvents.subscribe(organizationId, (event) => {
    if (!ready) {
      bufferedEvents.push(event);
      return;
    }

    writeTaskEvent(res, event);
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("event: connected\n");
  res.write(
    `data: ${JSON.stringify({ message: "Connected to task updates" })}\n\n`
  );

  const heartbeat = setInterval(() => {
    if (!closed) {
      res.write(": heartbeat\n\n");
    }
  }, 30000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on("close", cleanup);

  try {
    if (afterJobId) {
      let cursor = afterJobId;
      let hasMore = true;

      while (hasMore && !closed) {
        const page = await loadTaskEventReplayPage(organizationId, cursor);
        for (const event of page.events) {
          if (event.eventId) {
            replayedEventIds.add(event.eventId);
          }
          writeTaskEvent(res, event);
        }
        cursor = page.nextAfterId;
        hasMore = page.hasMore;
      }
    }

    if (closed) return;

    ready = true;
    for (const event of bufferedEvents) {
      if (event.eventId && replayedEventIds.has(event.eventId)) {
        continue;
      }
      writeTaskEvent(res, event);
    }
    replayedEventIds.clear();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "task_event_replay_failed",
        organizationId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      })
    );
    if (!closed) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          message: "Task event replay failed; reconnect to retry.",
        })}\n\n`
      );
      cleanup();
      res.end();
    }
  }
}

router.get("/stream", authenticateToken, streamTaskEvents);

export default router;

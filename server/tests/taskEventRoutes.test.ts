import { pool } from "../db";
import {
  loadTaskEventReplayPage,
  streamTaskEvents,
} from "../routes/taskEventRoutes";
import { TaskEvent, taskEvents } from "../utils/taskEvents";

jest.mock("../db", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../utils/taskEvents", () => ({
  taskEvents: {
    subscribe: jest.fn(),
  },
}));

describe("Task event outbox replay", () => {
  const query = jest.mocked(pool.query);
  const subscribe = jest.mocked(taskEvents.subscribe);

  beforeEach(() => {
    query.mockReset();
    subscribe.mockReset();
  });

  test("loads completed events within the authenticated tenant and resumes by job ID", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "42",
          organization_id: "8",
          payload: {
            type: "task.updated",
            projectId: 12,
            taskId: 34,
            version: 5,
          },
          created_at: new Date("2026-01-02T03:04:05.000Z"),
        },
      ],
      rowCount: 1,
    } as never);

    const page = await loadTaskEventReplayPage(8, "40");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("organization_id = $1"),
      [8, "40", 100]
    );
    expect(page).toEqual({
      events: [
        {
          eventId: "background-job:42",
          type: "task.updated",
          organizationId: 8,
          projectId: 12,
          taskId: 34,
          version: 5,
          timestamp: "2026-01-02T03:04:05.000Z",
        },
      ],
      nextAfterId: "42",
      hasMore: false,
    });
  });

  test("advances past malformed outbox records without exposing their payload", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "43",
          organization_id: "8",
          payload: { type: "unsupported.event" },
          created_at: new Date("2026-01-02T03:04:05.000Z"),
        },
      ],
      rowCount: 1,
    } as never);
    const errorLog = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const page = await loadTaskEventReplayPage(8, "42");
      expect(page).toEqual({
        events: [],
        nextAfterId: "43",
        hasMore: false,
      });
      expect(errorLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: "error",
          event: "invalid_task_event_outbox_record",
          jobId: "43",
        })
      );
    } finally {
      errorLog.mockRestore();
    }
  });

  test("replays missed events before flushing live events received during replay", async () => {
    const event: TaskEvent = {
      eventId: "background-job:42",
      type: "task.updated",
      organizationId: 8,
      projectId: 12,
      taskId: 34,
      version: 5,
      timestamp: "2026-01-02T03:04:05.000Z",
    };
    let liveListener: ((value: TaskEvent) => void) | undefined;
    let closeHandler: (() => void) | undefined;
    const req = {
      user: { organizationId: 8 },
      get: jest.fn(() => "background-job:40"),
      on: jest.fn((_event: string, handler: () => void) => {
        closeHandler = handler;
        return undefined;
      }),
    };
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
    };
    subscribe.mockImplementation((_organizationId, listener) => {
      liveListener = listener;
      return jest.fn();
    });
    query.mockImplementationOnce(async () => {
      liveListener?.(event);
      return {
        rows: [
          {
            id: "42",
            organization_id: "8",
            payload: {
              type: event.type,
              projectId: event.projectId,
              taskId: event.taskId,
              version: event.version,
            },
            created_at: new Date(event.timestamp),
          },
        ],
        rowCount: 1,
      } as never;
    });

    await streamTaskEvents(req as never, res as never);

    const writes = res.write.mock.calls.map(([value]) => String(value));
    expect(writes.filter((value) => value === "id: background-job:42\n"))
      .toHaveLength(1);
    expect(writes).toContain("event: task.updated\n");

    liveListener?.({ ...event, eventId: "background-job:43", version: 6 });
    expect(
      res.write.mock.calls
        .map(([value]) => String(value))
        .filter((value) => value === "id: background-job:43\n")
    ).toHaveLength(1);

    closeHandler?.();
  });
});

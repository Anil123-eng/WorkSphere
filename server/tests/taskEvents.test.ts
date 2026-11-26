import { randomUUID } from "crypto";
import { taskEvents, TaskEvent } from "../utils/taskEvents";

interface MockRedisClient {
  isOpen: boolean;
  on: jest.Mock;
  connect: jest.Mock<Promise<void>, []>;
  eval: jest.Mock<
    Promise<number>,
    [string, { keys: string[]; arguments: string[] }]
  >;
  publish: jest.Mock<Promise<number>, [string, string]>;
  quit: jest.Mock<Promise<string>, []>;
}

jest.mock("redis", () => {
  const deliveredKeys = new Set<string>();
  const client: MockRedisClient = {
    isOpen: false,
    on: jest.fn(),
    connect: jest.fn(async () => {
      client.isOpen = true;
    }),
    eval: jest.fn(async (_script, options) => {
      const key = options.keys[0];
      if (deliveredKeys.has(key)) return -1;
      deliveredKeys.add(key);
      return 1;
    }),
    publish: jest.fn(async (_channel: string, _message: string) => {
      void _channel;
      void _message;
      return 1;
    }),
    quit: jest.fn(async () => "OK"),
  };

  return {
    createClient: jest.fn(() => client),
    mockClient: client,
    deliveredKeys,
  };
});

const mockRedis = jest.requireMock<{
  mockClient: MockRedisClient;
  deliveredKeys: Set<string>;
  createClient: jest.Mock;
}>("redis");
const mockClient = mockRedis.mockClient;

describe("Idempotent Redis task-event delivery", () => {
  const previousRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    process.env.REDIS_URL = "redis://test.invalid";
    mockClient.isOpen = false;
    mockClient.connect.mockClear();
    mockClient.eval.mockReset();
    mockRedis.createClient.mockClear();
    mockRedis.deliveredKeys.clear();
    mockClient.eval.mockImplementation(async (_script, options) => {
      const key = options.keys[0];
      if (mockRedis.deliveredKeys.has(key)) return -1;
      mockRedis.deliveredKeys.add(key);
      return 1;
    });
  });

  afterAll(async () => {
    await taskEvents.closeRedisConnections();
    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }
  });

  test("uses one atomic Redis marker for repeated delivery of the same event", async () => {
    const event: TaskEvent = {
      eventId: `background-job:${randomUUID()}`,
      type: "task.updated",
      organizationId: 7,
      projectId: 8,
      taskId: 9,
      version: 2,
      timestamp: new Date().toISOString(),
    };

    await taskEvents.publish(event);
    await taskEvents.publish(event);

    expect(mockRedis.createClient).toHaveBeenCalledWith({
      url: "redis://test.invalid",
      socket: { connectTimeout: 5000 },
      disableOfflineQueue: true,
    });
    expect(mockClient.eval).toHaveBeenCalledTimes(2);
    const firstCall = mockClient.eval.mock.calls[0];
    const secondCall = mockClient.eval.mock.calls[1];
    expect(firstCall[0]).toContain('"EXISTS"');
    expect(firstCall[0]).toContain('"SET"');
    expect(firstCall[0]).toContain('"PUBLISH"');
    expect(firstCall[1].keys).toEqual(secondCall[1].keys);
    expect(firstCall[1].arguments[2]).toBe(JSON.stringify(event));
    expect(mockRedis.deliveredKeys.size).toBe(1);
  });

  test("does not mark an event delivered when Redis has no subscribers", async () => {
    const event: TaskEvent = {
      eventId: `background-job:${randomUUID()}`,
      type: "task.updated",
      organizationId: 7,
      projectId: 8,
      taskId: 9,
      version: 3,
      timestamp: new Date().toISOString(),
    };
    mockClient.eval.mockResolvedValueOnce(0);

    await expect(taskEvents.publish(event)).rejects.toThrow(
      "No task-event subscribers are available"
    );
    expect(mockRedis.deliveredKeys.size).toBe(0);
  });

  test("deduplicates in-memory events and retries when no listener exists", async () => {
    delete process.env.REDIS_URL;
    const event: TaskEvent = {
      eventId: `background-job:${randomUUID()}`,
      type: "task.updated",
      organizationId: 7,
      projectId: 8,
      taskId: 9,
      version: 4,
      timestamp: new Date().toISOString(),
    };
    const listener = jest.fn();
    const unsubscribe = taskEvents.subscribe(event.organizationId, listener);

    try {
      await taskEvents.publish(event);
      await taskEvents.publish(event);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      await expect(
        taskEvents.publish({ ...event, eventId: `${event.eventId}:new` })
      ).rejects.toThrow("No in-memory task-event subscribers are available");
    } finally {
      unsubscribe();
      process.env.REDIS_URL = "redis://test.invalid";
    }
  });

  test("propagates Redis outages so the job worker can retry", async () => {
    const event: TaskEvent = {
      eventId: `background-job:${randomUUID()}`,
      type: "task.created",
      organizationId: 7,
      projectId: 8,
      taskId: 9,
      timestamp: new Date().toISOString(),
    };
    mockClient.eval.mockRejectedValueOnce(new Error("Simulated Redis outage"));

    await expect(taskEvents.publish(event)).rejects.toThrow(
      "Simulated Redis outage"
    );
  });
});

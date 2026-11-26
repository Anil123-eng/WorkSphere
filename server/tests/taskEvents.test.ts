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
      if (deliveredKeys.has(key)) return 0;
      deliveredKeys.add(key);
      return 1;
    }),
    publish: jest.fn(async (_channel: string, _message: string) => 1),
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
}>("redis");
const mockClient = mockRedis.mockClient;

describe("Idempotent Redis task-event delivery", () => {
  const previousRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    process.env.REDIS_URL = "redis://test.invalid";
    mockClient.isOpen = false;
    mockClient.connect.mockClear();
    mockClient.eval.mockReset();
    mockRedis.deliveredKeys.clear();
    mockClient.eval.mockImplementation(async (_script, options) => {
      const key = options.keys[0];
      if (mockRedis.deliveredKeys.has(key)) return 0;
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

    expect(mockClient.eval).toHaveBeenCalledTimes(2);
    const firstCall = mockClient.eval.mock.calls[0];
    const secondCall = mockClient.eval.mock.calls[1];
    expect(firstCall[0]).toContain('"NX"');
    expect(firstCall[0]).toContain('"PUBLISH"');
    expect(firstCall[1].keys).toEqual(secondCall[1].keys);
    expect(firstCall[1].arguments[2]).toBe(JSON.stringify(event));
    expect(mockRedis.deliveredKeys.size).toBe(1);
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


import { EventEmitter } from "events";
import { createClient } from "redis";

export interface TaskEvent {
  eventId?: string;
  type: "task.created" | "task.updated";
  organizationId: number;
  projectId: number;
  taskId: number;
  timestamp: string;
  version?: number;
}

const REDIS_CHANNEL = "worksphere:task-events";
const EVENT_DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60;
const EVENT_DEDUPE_TTL_MS = EVENT_DEDUPE_TTL_SECONDS * 1000;
const REDIS_CONNECT_TIMEOUT_MS = 5000;
const PUBLISH_ONCE_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 then
  return -1
end
local subscribers = redis.call("PUBLISH", ARGV[2], ARGV[3])
if subscribers > 0 then
  redis.call("SET", KEYS[1], "1", "EX", ARGV[1])
end
return subscribers
`;

class TaskEventService extends EventEmitter {
  private publisher: ReturnType<typeof createClient> | null = null;
  private subscriber: ReturnType<typeof createClient> | null = null;
  private readonly localDeliveredEvents = new Map<string, number>();

  private getRedisUrl(): string | undefined {
    return process.env.REDIS_URL;
  }

  async publish(event: TaskEvent): Promise<void> {
    const redisUrl = this.getRedisUrl();

    if (redisUrl) {
      if (!this.publisher) {
        this.publisher = createClient({
          url: redisUrl,
          socket: { connectTimeout: REDIS_CONNECT_TIMEOUT_MS },
          disableOfflineQueue: true,
        });
        this.publisher.on("error", (error) => {
          console.error("Redis publisher error:", error.message);
        });
      }

      if (!this.publisher.isOpen) {
        await this.publisher.connect();
      }

      if (event.eventId) {
        const subscriberCount = Number(
          await this.publisher.eval(PUBLISH_ONCE_SCRIPT, {
            keys: [`${REDIS_CHANNEL}:delivered:${event.eventId}`],
            arguments: [
              String(EVENT_DEDUPE_TTL_SECONDS),
              REDIS_CHANNEL,
              JSON.stringify(event),
            ],
          })
        );

        if (subscriberCount === 0) {
          throw new Error("No task-event subscribers are available");
        }
      } else {
        const subscriberCount = await this.publisher.publish(
          REDIS_CHANNEL,
          JSON.stringify(event)
        );
        if (subscriberCount === 0) {
          throw new Error("No task-event subscribers are available");
        }
      }
    } else {
      const channel = `organization:${event.organizationId}`;
      const now = Date.now();

      for (const [eventId, publishedAt] of this.localDeliveredEvents) {
        if (now - publishedAt >= EVENT_DEDUPE_TTL_MS) {
          this.localDeliveredEvents.delete(eventId);
        }
      }

      if (this.listenerCount(channel) === 0) {
        throw new Error("No in-memory task-event subscribers are available");
      }

      if (event.eventId && this.localDeliveredEvents.has(event.eventId)) {
        return;
      }

      if (event.eventId) {
        this.localDeliveredEvents.set(event.eventId, now);
      }
      this.emit(channel, event);
    }
  }

  async startRedisSubscriber(): Promise<void> {
    const redisUrl = this.getRedisUrl();

    if (!redisUrl || this.subscriber) return;

    this.subscriber = createClient({
      url: redisUrl,
      socket: { connectTimeout: REDIS_CONNECT_TIMEOUT_MS },
      disableOfflineQueue: true,
    });

    this.subscriber.on("error", (error) => {
      console.error("Redis subscriber error:", error.message);
    });

    await this.subscriber.connect();

    await this.subscriber.subscribe(REDIS_CHANNEL, (message) => {
      try {
        const event = JSON.parse(message) as TaskEvent;

        if (
          (event.type !== "task.created" &&
            event.type !== "task.updated") ||
          !Number.isSafeInteger(event.organizationId) ||
          !Number.isSafeInteger(event.projectId) ||
          !Number.isSafeInteger(event.taskId) ||
          (event.eventId !== undefined &&
            (typeof event.eventId !== "string" || !event.eventId)) ||
          (event.version !== undefined &&
            (!Number.isSafeInteger(event.version) || event.version < 1))
        ) {
          console.error("Ignored invalid Redis task event");
          return;
        }

        this.emit(`organization:${event.organizationId}`, event);
      } catch {
        console.error("Ignored malformed Redis task event");
      }
    });

    console.log("Redis task event subscriber connected");
  }

  subscribe(
    organizationId: number,
    listener: (event: TaskEvent) => void
  ): () => void {
    const channel = `organization:${organizationId}`;

    this.on(channel, listener);

    return () => {
      this.off(channel, listener);
    };
  }

  async closeRedisConnections(): Promise<void> {
    if (this.publisher?.isOpen) {
      await this.publisher.quit();
    }

    if (this.subscriber?.isOpen) {
      await this.subscriber.quit();
    }

    this.publisher = null;
    this.subscriber = null;
  }
}

export const taskEvents = new TaskEventService();

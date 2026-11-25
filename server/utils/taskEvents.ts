
import { EventEmitter } from "events";

export interface TaskEvent {
  type: "task.created" | "task.updated";
  organizationId: number;
  projectId: number;
  taskId: number;
  timestamp: string;
}

class TaskEventService extends EventEmitter {
  publish(event: TaskEvent): void {
    this.emit(`organization:${event.organizationId}`, event);
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
}

export const taskEvents = new TaskEventService();

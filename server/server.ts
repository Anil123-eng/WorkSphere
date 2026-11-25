
import dotenv from "dotenv";
import app from "./app";
import { taskEvents } from "./utils/taskEvents";

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    // Subscribe to Redis events before accepting API requests.
    await taskEvents.startRedisSubscriber();

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`WorkSphere API running on port ${PORT}`);
    });

    async function shutdown() {
      console.log("Shutting down WorkSphere API...");

      server.close(async () => {
        await taskEvents.closeRedisConnections();
        console.log("WorkSphere API stopped.");
        process.exit(0);
      });
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error(
      "Failed to start WorkSphere API:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

void startServer();

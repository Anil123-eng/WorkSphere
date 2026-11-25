
import dotenv from "dotenv";
import app from "./app";
import { startJobWorker } from "./utils/backgroundJobs";

dotenv.config();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`WorkSphere API running at http://localhost:${PORT}`);

  // Start persistent background job processing
  startJobWorker();
});

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down WorkSphere API...");

  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

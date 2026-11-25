
import express from "express";
import cors from "cors";

import projectRoutes from "./routes/projectRoutes";
import authRoutes from "./routes/authRoutes";
import taskRoutes from "./routes/taskRoutes";
import taskEventRoutes from "./routes/taskEventRoutes";

import { errorHandler } from "./middleware/errorHandler";
import webhookRoutes from "./routes/webhookRoutes";
import integrationRoutes from "./routes/integrationRoutes";
import attachmentRoutes from "./routes/attachmentRoutes";

const app = express();

app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody =
        Buffer.from(buffer);
    },
  })
);

// Authentication routes
app.use("/api/auth", authRoutes);

app.use("/api/webhooks", webhookRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/attachments", attachmentRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "WorkSphere API is running",
  });
});

// Existing project routes
app.use("/api/projects", projectRoutes);

// Assessment 07 task routes
app.use("/api/tasks", taskRoutes);

// Assessment 07 real-time event stream
app.use("/api/task-events", taskEventRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

// Central error handler
app.use(errorHandler);

export default app;

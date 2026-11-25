
import express from "express";
import cors from "cors";

import projectRoutes from "./routes/projectRoutes";
import authRoutes from "./routes/authRoutes";
import taskRoutes from "./routes/taskRoutes";
import taskEventRoutes from "./routes/taskEventRoutes";

import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

// Authentication routes
app.use("/api/auth", authRoutes);

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

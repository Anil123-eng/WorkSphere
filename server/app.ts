
import express from "express";
import cors from "cors";
import projectRoutes from "./routes/projectRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// Global middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "WorkSphere API is running",
  });
});

// Project routes
app.use("/api/projects", projectRoutes);

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

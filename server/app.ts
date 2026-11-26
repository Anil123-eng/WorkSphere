
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import crypto from "crypto";

import projectRoutes from "./routes/projectRoutes";
import authRoutes from "./routes/authRoutes";
import taskRoutes from "./routes/taskRoutes";
import taskEventRoutes from "./routes/taskEventRoutes";

import { errorHandler } from "./middleware/errorHandler";
import webhookRoutes from "./routes/webhookRoutes";
import integrationRoutes from "./routes/integrationRoutes";
import attachmentRoutes from "./routes/attachmentRoutes";
import { nodeOpenApi } from "./openapiDocument";
import {
  apiRateLimitConfig,
  createRateLimitMiddleware,
} from "./utils/rateLimit";
import { pool } from "./db";

const app = express();
const apiRoutes = express.Router();
const apiRateLimiter = createRateLimitMiddleware({
  maxRequests: apiRateLimitConfig.maxRequests,
  windowMs: apiRateLimitConfig.windowSeconds * 1000,
});
const trustProxyHops =
  process.env.TRUST_PROXY_HOPS === undefined
    ? 0
    : Number(process.env.TRUST_PROXY_HOPS);

if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer");
}

// Basic request metrics (in-memory, per-process).
let requestCount = 0;
let errorCount = 0;

app.set("trust proxy", trustProxyHops);
app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody =
        Buffer.from(buffer);
    },
  })
);

// Correlation ID + structured request logging middleware.
app.use((req, res, next) => {
  const correlationId =
    (req.headers["x-correlation-id"] as string) ||
    crypto.randomUUID();
  (req as express.Request & { correlationId?: string }).correlationId =
    correlationId;
  res.setHeader("X-Correlation-Id", correlationId);

  const startTime = Date.now();
  res.on("finish", () => {
    requestCount += 1;
    const durationMs = Date.now() - startTime;
    if (res.statusCode >= 500) {
      errorCount += 1;
    }
    console.info(
      JSON.stringify({
        level: "info",
        event: "http_request",
        correlationId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
      })
    );
  });

  next();
});

app.get("/api/openapi.json", (_req, res) => {
  res.json(nodeOpenApi);
});
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(nodeOpenApi, {
    customSiteTitle: "WorkSphere Node API",
  })
);

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/webhooks", webhookRoutes);
apiRoutes.use("/integrations", integrationRoutes);
apiRoutes.use("/attachments", attachmentRoutes);

// Readiness check: verifies the database is reachable.
apiRoutes.get("/health/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      success: true,
      status: "ready",
      service: "worksphere-api",
      checks: { database: "up" },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "database_readiness_failed",
        correlationId: (
          req as express.Request & { correlationId?: string }
        ).correlationId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      })
    );
    res.status(503).json({
      success: false,
      status: "not_ready",
      service: "worksphere-api",
      checks: { database: "down" },
    });
  }
});

// Liveness check: process is alive.
apiRoutes.get("/health/live", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "alive",
    service: "worksphere-api",
  });
});

// Basic metrics endpoint.
apiRoutes.get("/metrics", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.status(200).send(
    `# HELP worksphere_http_requests_total Total HTTP requests processed.\n# TYPE worksphere_http_requests_total counter\nworksphere_http_requests_total ${requestCount}\n# HELP worksphere_http_errors_total Total HTTP 5xx errors.\n# TYPE worksphere_http_errors_total counter\nworksphere_http_errors_total ${errorCount}\n`
  );
});

apiRoutes.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "WorkSphere API is running",
  });
});

apiRoutes.use("/projects", projectRoutes);
apiRoutes.use("/tasks", taskRoutes);
apiRoutes.use("/task-events", taskEventRoutes);

app.use("/api/v1", apiRateLimiter, apiRoutes, (_req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});
app.use("/api", apiRateLimiter, apiRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

// Central error handler
app.use(errorHandler);

export default app;

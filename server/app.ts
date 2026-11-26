
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

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

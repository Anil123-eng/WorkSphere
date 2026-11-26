import baseDocument from "./openapi.json";
import { apiRateLimitConfig } from "./utils/rateLimit";

interface ApiOperation {
  operationId?: string;
  responses?: Record<string, unknown>;
}

function isApiOperation(value: unknown): value is ApiOperation {
  return typeof value === "object" && value !== null;
}

const paths: Record<string, Record<string, unknown>> = {};
const httpMethods = new Set(["get", "post", "put", "patch", "delete"]);

for (const [path, pathItem] of Object.entries(baseDocument.paths)) {
  const updatedPathItem: Record<string, unknown> = { ...pathItem };

  for (const [method, value] of Object.entries(pathItem)) {
    if (!httpMethods.has(method) || !isApiOperation(value)) {
      continue;
    }

    updatedPathItem[method] = {
      ...value,
      responses: {
        ...value.responses,
        "429": { $ref: "#/components/responses/TooManyRequests" },
      },
    };
  }

  paths[path] = updatedPathItem;
  const versionedPath = path.replace(/^\/api(?=\/)/, "/api/v1");
  paths[versionedPath] = {
    ...updatedPathItem,
    ...Object.fromEntries(
      Object.entries(updatedPathItem)
        .filter(([method]) => httpMethods.has(method))
        .map(([method, value]) => {
          if (!isApiOperation(value) || !value.operationId) {
            return [method, value];
          }
          return [
            method,
            { ...value, operationId: `${value.operationId}V1` },
          ];
        })
    ),
  };
}

export const nodeOpenApi = {
  ...baseDocument,
  info: {
    ...baseDocument.info,
    description:
      "OpenAPI contract for WorkSphere Node API v1. The /api/v1 routes are versioned; matching unversioned /api routes remain available for backward compatibility. Rate limits use a per-process, per-client-IP fixed window. Project listing supports page and limit; the default page size is 20 and the maximum is 100.",
  },
  paths,
  "x-api-versioning": {
    status: "v1-with-legacy-aliases",
    currentContract: "1.0.0",
    versionedPrefix: "/api/v1",
    legacyPrefix: "/api",
  },
  "x-rate-limit-policy": {
    status: "enforced",
    scope: "per-process, per-client-IP",
    algorithm: "fixed-window",
    maxRequests: apiRateLimitConfig.maxRequests,
    windowSeconds: apiRateLimitConfig.windowSeconds,
    headers: {
      "RateLimit-Limit": "Maximum requests allowed in the current window.",
      "RateLimit-Remaining": "Requests remaining in the current window.",
      "RateLimit-Reset": "Seconds until the current window resets.",
      "RateLimit-Policy": "Configured request quota and window.",
      "Retry-After": "Seconds to wait when a request receives HTTP 429.",
    },
  },
  components: {
    ...baseDocument.components,
    responses: {
      ...baseDocument.components.responses,
      TooManyRequests: {
        description: "The client exceeded the configured request limit.",
        headers: {
          "RateLimit-Limit": {
            description: "Maximum requests allowed in the current window.",
            schema: { type: "integer" },
          },
          "RateLimit-Remaining": {
            description: "Requests remaining in the current window.",
            schema: { type: "integer", example: 0 },
          },
          "RateLimit-Reset": {
            description: "Seconds until the current window resets.",
            schema: { type: "integer" },
          },
          "RateLimit-Policy": {
            description: "Configured request quota and window.",
            schema: { type: "string", example: "100;w=900" },
          },
          "Retry-After": {
            description: "Seconds to wait before retrying.",
            schema: { type: "integer", example: 900 },
          },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
            example: {
              success: false,
              message: "Rate limit exceeded. Please retry later.",
            },
          },
        },
      },
    },
  },
};

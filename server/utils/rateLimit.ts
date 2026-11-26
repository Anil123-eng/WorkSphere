import { NextFunction, Request, Response } from "express";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (request: Request) => string;
  now?: () => number;
}

export const apiRateLimitConfig = {
  maxRequests: readPositiveIntegerEnv("API_RATE_LIMIT_MAX_REQUESTS", 100),
  windowSeconds: readPositiveIntegerEnv("API_RATE_LIMIT_WINDOW_SECONDS", 900),
};

export function readPositiveIntegerEnv(
  name: string,
  defaultValue: number
): number {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

export function createRateLimitMiddleware({
  maxRequests,
  windowMs,
  keyGenerator = (request) =>
    request.ip || request.socket.remoteAddress || "unknown",
  now = Date.now,
}: RateLimitOptions) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests <= 0) {
    throw new Error("maxRequests must be a positive integer");
  }
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error("windowMs must be a positive integer");
  }

  const buckets = new Map<string, RateLimitBucket>();
  let requestsSinceCleanup = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    const currentTime = now();
    const key = keyGenerator(req);
    let bucket = buckets.get(key);

    if (!bucket || currentTime >= bucket.resetAt) {
      bucket = { count: 0, resetAt: currentTime + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const secondsUntilReset = Math.max(
      0,
      Math.ceil((bucket.resetAt - currentTime) / 1000)
    );

    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - bucket.count)));
    res.setHeader("RateLimit-Reset", String(secondsUntilReset));
    res.setHeader(
      "RateLimit-Policy",
      `${maxRequests};w=${Math.ceil(windowMs / 1000)}`
    );

    if (bucket.count > maxRequests) {
      res.setHeader("Retry-After", String(Math.max(1, secondsUntilReset)));
      res.status(429).json({
        success: false,
        message: "Rate limit exceeded. Please retry later.",
      });
      return;
    }

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 256) {
      for (const [bucketKey, entry] of buckets) {
        if (currentTime >= entry.resetAt) {
          buckets.delete(bucketKey);
        }
      }
      requestsSinceCleanup = 0;
    }

    next();
  };
}

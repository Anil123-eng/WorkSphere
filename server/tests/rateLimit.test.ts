import express from "express";
import request from "supertest";
import { createRateLimitMiddleware } from "../utils/rateLimit";

describe("API rate limiting", () => {
  test("returns standard headers and HTTP 429 at the configured boundary", async () => {
    let currentTime = 1_000_000;
    const app = express();

    app.use(
      createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60_000,
        keyGenerator: () => "test-client",
        now: () => currentTime,
      })
    );
    app.get("/resource", (_req, res) => res.status(200).json({ ok: true }));

    const first = await request(app).get("/resource");
    const second = await request(app).get("/resource");
    const limited = await request(app).get("/resource");

    expect(first.status).toBe(200);
    expect(first.headers["ratelimit-limit"]).toBe("2");
    expect(first.headers["ratelimit-remaining"]).toBe("1");
    expect(second.status).toBe(200);
    expect(second.headers["ratelimit-remaining"]).toBe("0");
    expect(limited.status).toBe(429);
    expect(limited.body.message).toMatch(/rate limit exceeded/i);
    expect(limited.headers["ratelimit-reset"]).toBe("60");
    expect(limited.headers["retry-after"]).toBe("60");

    currentTime += 60_000;
    const afterReset = await request(app).get("/resource");
    expect(afterReset.status).toBe(200);
    expect(afterReset.headers["ratelimit-remaining"]).toBe("1");
  });

  test("rejects invalid rate-limit configuration", () => {
    expect(() =>
      createRateLimitMiddleware({ maxRequests: 0, windowMs: 1000 })
    ).toThrow("maxRequests must be a positive integer");
  });
});

import request from "supertest";
import app from "../app";
import { pool } from "../db";

describe("API observability and safe dependency failures", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns and logs a correlation ID without exposing database errors", async () => {
    jest
      .spyOn(pool, "query")
      .mockImplementationOnce(() => {
        throw new Error("synthetic-secret database detail");
      });
    const errorLog = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    jest.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await request(app)
      .get("/api/health/ready")
      .set("X-Correlation-Id", "section8-test-correlation");

    expect(response.status).toBe(503);
    expect(response.headers["x-correlation-id"]).toBe(
      "section8-test-correlation"
    );
    expect(response.body.checks).toEqual({ database: "down" });
    expect(JSON.stringify(response.body)).not.toContain("synthetic-secret");
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        event: "database_readiness_failed",
        correlationId: "section8-test-correlation",
        errorType: "Error",
      })
    );
  });

  test("exposes liveness and basic request metrics", async () => {
    jest.spyOn(console, "info").mockImplementation(() => undefined);

    const live = await request(app)
      .get("/api/health/live")
      .set("X-Correlation-Id", "section8-live-check");
    expect(live.status).toBe(200);
    expect(live.headers["x-correlation-id"]).toBe("section8-live-check");

    const metrics = await request(app).get("/api/metrics");
    expect(metrics.status).toBe(200);
    expect(metrics.text).toContain("worksphere_http_requests_total");
    expect(metrics.text).toContain("worksphere_http_errors_total");
  });
});


import request from "supertest";
import { randomUUID } from "crypto";
import app from "../app";
import { pool } from "../db";

describe("WorkSphere Authentication API", () => {
  const testEmail = `worksphere-auth-${randomUUID()}@example.com`;
  const testPassword = "TestPassword@123";
  const testOrganization = "Authentication Test Organization";

  let userId: number;
  let organizationId: number;

  afterAll(async () => {
    try {
      if (organizationId) {
        await pool.query(
          "DELETE FROM organizations WHERE id = $1",
          [organizationId]
        );
      }

      if (userId) {
        await pool.query(
          "DELETE FROM users WHERE id = $1",
          [userId]
        );
      }
    } finally {
      await pool.end();
    }
  });

  test("POST /api/auth/register - should register a new organization owner", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Authentication Test User",
        email: testEmail,
        password: testPassword,
        organizationName: testOrganization,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(testEmail);
    expect(response.body.data.role).toBe("owner");
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();

    userId = Number(response.body.data.user.id);
    organizationId = Number(response.body.data.organization.id);
  });

  test("POST /api/auth/register - should reject duplicate email", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Duplicate User",
        email: testEmail,
        password: testPassword,
        organizationName: "Duplicate Organization",
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "An account with this email already exists"
    );
  });

  test("POST /api/auth/register - should reject a short password", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Invalid User",
        email: `short-${randomUUID()}@example.com`,
        password: "short",
        organizationName: "Invalid Organization",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Password must contain at least 8 characters"
    );
  });

  test("POST /api/auth/login - should log in with valid credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.role).toBe("owner");
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
  });

  test("POST /api/auth/login - should reject an incorrect password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmail,
        password: "WrongPassword@123",
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  test("POST /api/auth/refresh - should rotate refresh tokens", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmail,
        password: testPassword,
      });

    const oldRefreshToken = login.body.data.refreshToken;

    const response = await request(app)
      .post("/api/auth/refresh")
      .send({
        refreshToken: oldRefreshToken,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
    expect(response.body.data.refreshToken).not.toBe(oldRefreshToken);
  });

  test("POST /api/auth/refresh - should reject reuse of a revoked token", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmail,
        password: testPassword,
      });

    const oldRefreshToken = login.body.data.refreshToken;

    const rotation = await request(app)
      .post("/api/auth/refresh")
      .send({
        refreshToken: oldRefreshToken,
      });

    expect(rotation.status).toBe(200);

    const reuse = await request(app)
      .post("/api/auth/refresh")
      .send({
        refreshToken: oldRefreshToken,
      });

    expect(reuse.status).toBe(401);
    expect(reuse.body.message).toBe(
      "Refresh token reuse detected. Please log in again"
    );
  });

  test("POST /api/auth/logout - should revoke a refresh-token session", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmail,
        password: testPassword,
      });

    const refreshToken = login.body.data.refreshToken;

    const logout = await request(app)
      .post("/api/auth/logout")
      .send({ refreshToken });

    expect(logout.status).toBe(200);
    expect(logout.body.success).toBe(true);

    const refreshAfterLogout = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });

    expect(refreshAfterLogout.status).toBe(401);
  });

  test("POST /api/auth/refresh - should reject a missing refresh token", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Refresh token is required");
  });
});

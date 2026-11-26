
import request from "supertest";
import { randomUUID } from "crypto";
import app from "../app";
import { pool } from "../db";

describe("WorkSphere Project API", () => {
  let projectId: string;
  let userId: number;
  let organizationId: number;
  let accessToken: string;
  let secondUserId: number;
  let secondOrganizationId: number;
  let secondAccessToken: string;

  const testEmail = `worksphere-project-${randomUUID()}@example.com`;
  const secondTestEmail = `worksphere-project-second-${randomUUID()}@example.com`;

  const authenticatedRequest = () => ({
    Authorization: `Bearer ${accessToken}`,
  });

  beforeAll(async () => {
    const registration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Project Test User",
        email: testEmail,
        password: "TestPassword@123",
        organizationName: "Project Test Organization",
      });

    if (registration.status !== 201) {
      throw new Error(
        `Test registration failed: ${JSON.stringify(registration.body)}`
      );
    }

    accessToken = registration.body.data.accessToken;
    userId = Number(registration.body.data.user.id);
    organizationId = Number(registration.body.data.organization.id);

    const secondRegistration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Second Organization User",
        email: secondTestEmail,
        password: "TestPassword@123",
        organizationName: "Second Test Organization",
      });

    if (secondRegistration.status !== 201) {
      throw new Error(
        `Second test registration failed: ${JSON.stringify(secondRegistration.body)}`
      );
    }

    secondAccessToken = secondRegistration.body.data.accessToken;
    secondUserId = Number(secondRegistration.body.data.user.id);
    secondOrganizationId = Number(secondRegistration.body.data.organization.id);
  }, 15000);

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

      if (secondOrganizationId) {
        await pool.query(
          "DELETE FROM organizations WHERE id = $1",
          [secondOrganizationId]
        );
      }

      if (secondUserId) {
        await pool.query(
          "DELETE FROM users WHERE id = $1",
          [secondUserId]
        );
      }
    } finally {
      await pool.end();
    }
  });

  test("GET /api/health - should return API health status", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test("POST /api/projects - should create a project", async () => {
    const response = await request(app)
      .post("/api/projects")
      .set(authenticatedRequest())
      .send({
        name: "Automated Test Project",
        description: "Testing project creation",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Automated Test Project");
    expect(Number(response.body.data.organization_id)).toBe(organizationId);

    projectId = response.body.data.id;
  });

  test("GET /api/projects - should paginate and enforce page bounds", async () => {
    for (const name of ["Pagination Project Two", "Pagination Project Three"]) {
      const created = await request(app)
        .post("/api/projects")
        .set(authenticatedRequest())
        .send({ name });
      expect(created.status).toBe(201);
    }

    const firstPage = await request(app)
      .get("/api/projects?page=1&limit=1")
      .set(authenticatedRequest());
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 3,
      totalPages: 3,
      hasNext: true,
      hasPrevious: false,
    });

    const lastPage = await request(app)
      .get("/api/projects?page=3&limit=1")
      .set(authenticatedRequest());
    expect(lastPage.status).toBe(200);
    expect(lastPage.body.data).toHaveLength(1);
    expect(lastPage.body.pagination.hasNext).toBe(false);
    expect(lastPage.body.pagination.hasPrevious).toBe(true);

    const beyondLastPage = await request(app)
      .get("/api/projects?page=4&limit=1")
      .set(authenticatedRequest());
    expect(beyondLastPage.status).toBe(200);
    expect(beyondLastPage.body.data).toHaveLength(0);
    expect(beyondLastPage.body.pagination.totalPages).toBe(3);

    for (const query of ["page=0", "page=not-a-number", "limit=101"]) {
      const invalid = await request(app)
        .get(`/api/projects?${query}`)
        .set(authenticatedRequest());
      expect(invalid.status).toBe(400);
    }
  });

  test("GET /api/v1 routes preserve the unversioned API behavior", async () => {
    const [legacyHealth, versionedHealth] = await Promise.all([
      request(app).get("/api/health"),
      request(app).get("/api/v1/health"),
    ]);

    expect(legacyHealth.status).toBe(200);
    expect(versionedHealth.status).toBe(200);
    expect(versionedHealth.body).toEqual(legacyHealth.body);
    expect(versionedHealth.headers["ratelimit-limit"]).toBeTruthy();

    const versionedProjects = await request(app)
      .get("/api/v1/projects?page=1&limit=1")
      .set(authenticatedRequest());
    expect(versionedProjects.status).toBe(200);
    expect(versionedProjects.body.pagination.page).toBe(1);
  });

  test("GET /api/projects/:id - should retrieve a project", async () => {
    const response = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(authenticatedRequest());

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(projectId);
  });

  test("PUT /api/projects/:id - should update a project", async () => {
    const response = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(authenticatedRequest())
      .send({
        name: "Updated Test Project",
        description: "Updated description",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Updated Test Project");
  });

  test("GET /api/projects/:id - should prevent cross-tenant project access", async () => {
    const response = await request(app)
      .get(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${secondAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Project not found");
  });

  test(
    "PUT /api/projects/:id - should keep concurrent updates isolated and consistent",
    async () => {
      const [first, second] = await Promise.all([
        request(app)
          .put(`/api/projects/${projectId}`)
          .set(authenticatedRequest())
          .send({
            name: "Concurrent Update A",
            description: "First concurrent update",
          }),
        request(app)
          .put(`/api/projects/${projectId}`)
          .set(authenticatedRequest())
          .send({
            name: "Concurrent Update B",
            description: "Second concurrent update",
          }),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const saved = await pool.query(
        "SELECT name, description, organization_id FROM projects WHERE id = $1",
        [projectId]
      );

      expect(saved.rows).toHaveLength(1);
      expect(Number(saved.rows[0].organization_id)).toBe(organizationId);
      expect(["Concurrent Update A", "Concurrent Update B"]).toContain(
        saved.rows[0].name
      );
    },
    15000
  );

  test("POST /api/projects - should reject a missing project name", async () => {
    const response = await request(app)
      .post("/api/projects")
      .set(authenticatedRequest())
      .send({
        description: "Missing name test",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Project name is required");
  });

  test("GET /api/projects/invalid - should reject an invalid ID", async () => {
    const response = await request(app)
      .get("/api/projects/invalid")
      .set(authenticatedRequest());

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid project ID");
  });

  test("GET /api/projects/:id - should return 404 for a missing project", async () => {
    const response = await request(app)
      .get("/api/projects/999999999")
      .set(authenticatedRequest());

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Project not found");
  });

  test("DELETE /api/projects/:id - should delete a project", async () => {
    const response = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set(authenticatedRequest());

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Project deleted successfully");
  });

  test("GET /api/unknown - should return 404", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("API endpoint not found");
  });
});

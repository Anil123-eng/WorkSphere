
import request from "supertest";
import app from "../app";
import { pool } from "../db";

describe("WorkSphere API", () => {
  let projectId: string;

  afterAll(async () => {
    await pool.end();
  });

  test("GET /api/health - should return API health status", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test("POST /api/projects - should create a project", async () => {
    const response = await request(app)
      .post("/api/projects")
      .send({
        name: "Automated Test Project",
        description: "Testing project creation",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Automated Test Project");
    expect(response.body.data.organization_id).toBe("1");

    projectId = response.body.data.id;
  });

  test("GET /api/projects/:id - should retrieve a project", async () => {
    const response = await request(app).get(
      `/api/projects/${projectId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(projectId);
  });

  test("PUT /api/projects/:id - should update a project", async () => {
    const response = await request(app)
      .put(`/api/projects/${projectId}`)
      .send({
        name: "Updated Test Project",
        description: "Updated description",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Updated Test Project");
  });

  test("POST /api/projects - should reject a missing project name", async () => {
    const response = await request(app)
      .post("/api/projects")
      .send({
        description: "Missing name test",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Project name is required");
  });

  test("GET /api/projects/invalid - should reject an invalid ID", async () => {
    const response = await request(app).get("/api/projects/invalid");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid project ID");
  });

  test("GET /api/projects/:id - should return 404 for a missing project", async () => {
    const response = await request(app).get("/api/projects/999999999");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Project not found");
  });

  test("DELETE /api/projects/:id - should delete a project", async () => {
    const response = await request(app).delete(
      `/api/projects/${projectId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Project deleted successfully");
  });

  test("GET /api/unknown - should return 404", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("API endpoint not found");
  });
});

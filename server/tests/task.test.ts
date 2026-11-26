import request from "supertest";
import { randomUUID } from "crypto";
import app from "../app";
import { pool } from "../db";

describe("WorkSphere task concurrency and activity history", () => {
  let organizationId: number;
  let userId: number;
  let accessToken: string;
  let collaboratorUserId: number;
  let collaboratorOrganizationId: number;
  let collaboratorToken: string;
  let otherOrganizationId: number;
  let otherUserId: number;
  let otherOrganizationToken: string;
  let projectId: number;

  const firstEmail = `worksphere-task-${randomUUID()}@example.com`;
  const collaboratorEmail = `worksphere-task-collaborator-${randomUUID()}@example.com`;
  const otherEmail = `worksphere-task-other-${randomUUID()}@example.com`;
  const testPassword = "TestPassword@123";

  const createTask = async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        projectId,
        title: `Concurrency task ${randomUUID()}`,
        description: "Task history test",
      });

    if (response.status !== 201) {
      throw new Error(`Task creation failed: ${JSON.stringify(response.body)}`);
    }

    return response.body.data;
  };

  beforeAll(async () => {
    const registration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Task Test Owner",
        email: firstEmail,
        password: testPassword,
        organizationName: `Task Test Organization ${randomUUID()}`,
      });

    if (registration.status !== 201) {
      throw new Error(
        `Owner registration failed: ${JSON.stringify(registration.body)}`
      );
    }

    organizationId = Number(registration.body.data.organization.id);
    userId = Number(registration.body.data.user.id);
    accessToken = registration.body.data.accessToken;

    const collaboratorRegistration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Task Test Collaborator",
        email: collaboratorEmail,
        password: testPassword,
        organizationName: `Collaborator Organization ${randomUUID()}`,
      });

    if (collaboratorRegistration.status !== 201) {
      throw new Error(
        `Collaborator registration failed: ${JSON.stringify(
          collaboratorRegistration.body
        )}`
      );
    }

    collaboratorOrganizationId = Number(
      collaboratorRegistration.body.data.organization.id
    );
    collaboratorUserId = Number(collaboratorRegistration.body.data.user.id);
    await pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ($1, $2, 'team_member')`,
      [organizationId, collaboratorUserId]
    );

    const collaboratorLogin = await request(app)
      .post("/api/auth/login")
      .send({
        email: collaboratorEmail,
        password: testPassword,
        organizationId,
      });

    if (collaboratorLogin.status !== 200) {
      throw new Error(
        `Collaborator login failed: ${JSON.stringify(collaboratorLogin.body)}`
      );
    }

    collaboratorToken = collaboratorLogin.body.data.accessToken;

    const otherRegistration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Other Organization User",
        email: otherEmail,
        password: testPassword,
        organizationName: `Other Organization ${randomUUID()}`,
      });

    if (otherRegistration.status !== 201) {
      throw new Error(
        `Other organization registration failed: ${JSON.stringify(
          otherRegistration.body
        )}`
      );
    }

    otherOrganizationId = Number(otherRegistration.body.data.organization.id);
    otherUserId = Number(otherRegistration.body.data.user.id);
    otherOrganizationToken = otherRegistration.body.data.accessToken;

    const project = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Task Concurrency Test Project" });

    if (project.status !== 201) {
      throw new Error(`Project creation failed: ${JSON.stringify(project.body)}`);
    }

    projectId = Number(project.body.data.id);
  }, 30000);

  afterAll(async () => {
    try {
      if (organizationId) {
        await pool.query("DELETE FROM organizations WHERE id = $1", [
          organizationId,
        ]);
      }

      if (otherOrganizationId) {
        await pool.query("DELETE FROM organizations WHERE id = $1", [
          otherOrganizationId,
        ]);
      }

      if (collaboratorOrganizationId) {
        await pool.query("DELETE FROM organizations WHERE id = $1", [
          collaboratorOrganizationId,
        ]);
      }

      for (const id of [userId, collaboratorUserId, otherUserId]) {
        if (id) {
          await pool.query("DELETE FROM users WHERE id = $1", [id]);
        }
      }
    } finally {
      await pool.end();
    }
  });

  test("records the creation snapshot and returns tenant-scoped history", async () => {
    const task = await createTask();

    expect(task.version).toBe(1);

    const response = await request(app)
      .get(`/api/tasks/${task.id}/activities`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      activity_type: "created",
      task_version: 1,
      previous_state: null,
    });
    expect(response.body.data[0].new_state).toMatchObject({
      title: task.title,
      status: "todo",
      version: 1,
    });
  });

  test("allows only one concurrent update from the same task version", async () => {
    const task = await createTask();
    const [first, second] = await Promise.all([
      request(app)
        .patch(`/api/tasks/${task.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ status: "in_progress", expectedVersion: 1 }),
      request(app)
        .patch(`/api/tasks/${task.id}`)
        .set("Authorization", `Bearer ${collaboratorToken}`)
        .send({ status: "completed", expectedVersion: 1 }),
    ]);

    const responses = [first, second];
    expect(responses.filter((response) => response.status === 200)).toHaveLength(
      1
    );
    expect(responses.filter((response) => response.status === 409)).toHaveLength(
      1
    );

    const success = responses.find((response) => response.status === 200)!;
    const conflict = responses.find((response) => response.status === 409)!;
    expect(success.body.data.version).toBe(2);
    expect(conflict.body.currentVersion).toBe(2);

    const history = await request(app)
      .get(`/api/tasks/${task.id}/activities`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(history.body.data.map((entry: { task_version: number }) => entry.task_version))
      .toEqual([1, 2]);
    expect(history.body.data[1]).toMatchObject({
      activity_type: "status_updated",
      previous_state: expect.objectContaining({ status: "todo", version: 1 }),
      new_state: expect.objectContaining({
        status: success.body.data.status,
        version: 2,
      }),
    });

    const job = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [`task.updated:${task.id}:2`]
    );
    expect(job.rows[0].count).toBe(1);
  });

  test("requires a valid expected version for task updates", async () => {
    const task = await createTask();
    const missingVersion = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed" });
    const invalidVersion = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed", expectedVersion: 0 });

    expect(missingVersion.status).toBe(428);
    expect(invalidVersion.status).toBe(400);

    const history = await request(app)
      .get(`/api/tasks/${task.id}/activities`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(history.body.data).toHaveLength(1);
  });

  test("hides task and activity history from another organization", async () => {
    const task = await createTask();
    const headers = {
      Authorization: `Bearer ${otherOrganizationToken}`,
    };

    const [update, history] = await Promise.all([
      request(app)
        .patch(`/api/tasks/${task.id}`)
        .set(headers)
        .send({ status: "completed", expectedVersion: 1 }),
      request(app)
        .get(`/api/tasks/${task.id}/activities`)
        .set(headers),
    ]);

    expect(update.status).toBe(404);
    expect(history.status).toBe(404);
    expect(update.body.message).toBe("Task not found");
    expect(history.body.message).toBe("Task not found");
  });
});

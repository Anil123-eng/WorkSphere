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
    const taskResponse = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(taskResponse.status).toBe(200);
    expect(taskResponse.body.data).toMatchObject({
      id: task.id,
      version: 1,
      organization_id: String(organizationId),
    });

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

    const secondPage = await request(app)
      .get(`/api/tasks/${task.id}/activities?page=2&limit=1`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.data[0].task_version).toBe(2);
    expect(secondPage.body.pagination).toMatchObject({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
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

  test("rejects stale same-status updates and releases the no-op transaction", async () => {
    const task = await createTask();

    const noOp = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "todo", expectedVersion: 1 });
    expect(noOp.status).toBe(200);
    expect(noOp.body.data.version).toBe(1);

    const update = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "in_progress", expectedVersion: 1 });
    expect(update.status).toBe(200);

    const staleNoOp = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "in_progress", expectedVersion: 1 });
    expect(staleNoOp.status).toBe(409);
    expect(staleNoOp.body.currentVersion).toBe(2);

    const currentUpdate = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed", expectedVersion: 2 });
    expect(currentUpdate.status).toBe(200);
    expect(currentUpdate.body.data.version).toBe(3);
  });

  test("rolls back a task update and job enqueue when activity insertion fails", async () => {
    const task = await createTask();

    await pool.query(
      `INSERT INTO task_activities
         (task_id, organization_id, actor_user_id, activity_type,
          task_version, previous_state, new_state)
       VALUES ($1, $2, $3, 'status_updated', 2, $4, $5)`,
      [
        task.id,
        organizationId,
        userId,
        JSON.stringify({ status: "todo", version: 1 }),
        JSON.stringify({ status: "completed", version: 2 }),
      ]
    );

    const errorLog = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let responseStatus: number | undefined;
    try {
      responseStatus = (
        await request(app)
          .patch(`/api/tasks/${task.id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ status: "in_progress", expectedVersion: 1 })
      ).status;
    } finally {
      errorLog.mockRestore();
    }

    expect(responseStatus).toBe(500);

    const persistedTask = await pool.query(
      "SELECT status, version FROM tasks WHERE id = $1 AND organization_id = $2",
      [task.id, organizationId]
    );
    expect(persistedTask.rows[0]).toEqual({ status: "todo", version: 1 });

    const job = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM background_jobs
       WHERE idempotency_key = $1`,
      [`task.updated:${task.id}:2`]
    );
    expect(job.rows[0].count).toBe(0);
  });

  test("hides task and activity history from another organization", async () => {
    const task = await createTask();
    const headers = {
      Authorization: `Bearer ${otherOrganizationToken}`,
    };

    const [read, update, history] = await Promise.all([
      request(app)
        .get(`/api/tasks/${task.id}`)
        .set(headers),
      request(app)
        .patch(`/api/tasks/${task.id}`)
        .set(headers)
        .send({ status: "completed", expectedVersion: 1 }),
      request(app)
        .get(`/api/tasks/${task.id}/activities`)
        .set(headers),
    ]);

    expect(read.status).toBe(404);
    expect(update.status).toBe(404);
    expect(history.status).toBe(404);
    expect(update.body.message).toBe("Task not found");
    expect(history.body.message).toBe("Task not found");
  });

  test("retains tenant-scoped activity history after project deletion", async () => {
    const task = await createTask();
    const update = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "in_progress", expectedVersion: 1 });
    expect(update.status).toBe(200);

    const deletedProject = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deletedProject.status).toBe(200);

    const retainedHistory = await request(app)
      .get(`/api/tasks/${task.id}/activities?page=2&limit=1`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(retainedHistory.status).toBe(200);
    expect(retainedHistory.body.data[0]).toMatchObject({
      task_id: task.id,
      activity_type: "status_updated",
      task_version: 2,
    });
    expect(retainedHistory.body.pagination.total).toBe(2);

    const crossTenantHistory = await request(app)
      .get(`/api/tasks/${task.id}/activities`)
      .set("Authorization", `Bearer ${otherOrganizationToken}`);
    expect(crossTenantHistory.status).toBe(404);
  });
});

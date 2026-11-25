
import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { pool } from "../db";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";

const router = Router();

router.use(authenticateToken);

// Create a task and enqueue its real-time event in the same transaction.
router.post(
  "/",
  authorizeRoles("owner", "project_manager", "team_member"),
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();

    try {
      const { projectId, title, description, dueDate } = req.body;
      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;

      if (!Number.isInteger(projectId) || projectId <= 0) {
        res.status(400).json({
          success: false,
          message: "Valid projectId is required",
        });
        return;
      }

      if (typeof title !== "string" || !title.trim()) {
        res.status(400).json({
          success: false,
          message: "Task title is required",
        });
        return;
      }

      await client.query("BEGIN");

      const project = await client.query(
        `SELECT id FROM projects
         WHERE id = $1 AND organization_id = $2`,
        [projectId, organizationId]
      );

      if (project.rows.length === 0) {
        await client.query("ROLLBACK");

        res.status(404).json({
          success: false,
          message: "Project not found",
        });
        return;
      }

      const result = await client.query(
        `INSERT INTO tasks
          (organization_id, project_id, title, description, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          organizationId,
          projectId,
          title.trim(),
          typeof description === "string" ? description.trim() : "",
          dueDate || null,
          userId,
        ]
      );

      const task = result.rows[0];

      await client.query(
        `INSERT INTO background_jobs
          (organization_id, job_type, payload, idempotency_key)
         VALUES ($1, 'task_event', $2, $3)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          organizationId,
          JSON.stringify({
            type: "task.created",
            projectId,
            taskId: task.id,
          }),
          `task.created:${task.id}`,
        ]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Task created successfully",
        data: task,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// Update task status and enqueue a real-time event.
router.patch(
  "/:id",
  authorizeRoles("owner", "project_manager", "team_member"),
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();

    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      const organizationId = req.user!.organizationId;

      const allowedStatuses = ["todo", "in_progress", "completed"];

      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: "Invalid task ID",
        });
        return;
      }

      if (!allowedStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          message: "Invalid task status",
        });
        return;
      }

      await client.query("BEGIN");

      const result = await client.query(
        `UPDATE tasks
         SET status = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3
         RETURNING *`,
        [status, id, organizationId]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");

        res.status(404).json({
          success: false,
          message: "Task not found",
        });
        return;
      }

      const task = result.rows[0];

      await client.query(
        `INSERT INTO background_jobs
          (organization_id, job_type, payload, idempotency_key)
         VALUES ($1, 'task_event', $2, $3)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          organizationId,
          JSON.stringify({
            type: "task.updated",
            projectId: task.project_id,
            taskId: task.id,
          }),
          `task.updated:${task.id}:${randomUUID()}`,
        ]
      );

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Task updated successfully",
        data: task,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

export default router;

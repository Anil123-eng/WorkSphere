
import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import {
  createPaginationMetadata,
  parsePagination,
} from "../utils/pagination";

const router = Router();

// Explicit task status transition rules. A task may only move between the
// listed statuses. Transitions not listed here are rejected with 409 so that
// the lifecycle is auditable and cannot drift into an unsupported state.
const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  todo: ["in_progress", "completed"],
  in_progress: ["todo", "completed"],
  completed: ["in_progress", "todo"],
};

const TASK_STATUSES = Object.keys(TASK_STATUS_TRANSITIONS);

function isAllowedTransition(from: string, to: string): boolean {
  return TASK_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

router.use(authenticateToken);

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
        `INSERT INTO task_activities
          (task_id, organization_id, actor_user_id, activity_type,
           task_version, previous_state, new_state)
         VALUES ($1, $2, $3, 'created', $4, NULL, $5)`,
        [
          task.id,
          organizationId,
          userId,
          task.version,
          JSON.stringify(task),
        ]
      );

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
            version: task.version,
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

router.get(
  "/:id/activities",
  async (req: Request, res: Response, next: NextFunction) => {
    const id = Number(req.params.id);
    const organizationId = req.user!.organizationId;

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
      return;
    }

    const pagination = parsePagination(req.query.page, req.query.limit);
    if (!pagination.success) {
      res.status(400).json({
        success: false,
        message: pagination.message,
      });
      return;
    }

    try {
      const countResult = await pool.query(
        `SELECT COUNT(*) AS total
         FROM task_activities
         WHERE task_id = $1 AND organization_id = $2`,
        [id, organizationId]
      );
      const total = Number(countResult.rows[0].total);

      if (total === 0) {
        res.status(404).json({
          success: false,
          message: "Task not found",
        });
        return;
      }

      const activities = await pool.query(
        `SELECT id, task_id, organization_id, actor_user_id, activity_type,
                task_version, previous_state, new_state, created_at
         FROM task_activities
         WHERE task_id = $1 AND organization_id = $2
         ORDER BY task_version
         LIMIT $3 OFFSET $4`,
        [
          id,
          organizationId,
          pagination.pagination.limit,
          pagination.pagination.offset,
        ]
      );

      res.status(200).json({
        success: true,
        data: activities.rows,
        pagination: createPaginationMetadata(
          pagination.pagination.page,
          pagination.pagination.limit,
          total
        ),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
      return;
    }

    try {
      const result = await pool.query(
        `SELECT *
         FROM tasks
         WHERE id = $1 AND organization_id = $2`,
        [id, req.user!.organizationId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: "Task not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:id",
  authorizeRoles("owner", "project_manager", "team_member"),
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();

    try {
      const id = Number(req.params.id);
      const { status, expectedVersion } = req.body ?? {};
      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;

      const allowedStatuses = TASK_STATUSES;

      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: "Invalid task ID",
        });
        return;
      }

      if (typeof status !== "string" || !allowedStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          message: "Invalid task status",
        });
        return;
      }

      if (expectedVersion === undefined) {
        res.status(428).json({
          success: false,
          message: "expectedVersion is required",
        });
        return;
      }

      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        res.status(400).json({
          success: false,
          message: "expectedVersion must be a positive integer",
        });
        return;
      }

      await client.query("BEGIN");

      const currentResult = await client.query(
        `SELECT *
         FROM tasks
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [id, organizationId]
      );

      if (currentResult.rows.length === 0) {
        await client.query("ROLLBACK");

        res.status(404).json({
          success: false,
          message: "Task not found",
        });
        return;
      }

      const currentTask = currentResult.rows[0];

      if (currentTask.version !== expectedVersion) {
        await client.query("ROLLBACK");

        res.status(409).json({
          success: false,
          message: "Task was updated by another user. Refresh and retry.",
          currentVersion: currentTask.version,
          data: currentTask,
        });
        return;
      }

      // No-op transition: keep the current status without bumping version.
      if (currentTask.status === status) {
        await client.query("ROLLBACK");
        res.status(200).json({
          success: true,
          message: "Task status unchanged",
          data: currentTask,
        });
        return;
      }

      if (!isAllowedTransition(currentTask.status, status)) {
        await client.query("ROLLBACK");

        res.status(409).json({
          success: false,
          message: `Invalid status transition from ${currentTask.status} to ${status}`,
          currentStatus: currentTask.status,
          allowedTransitions: TASK_STATUS_TRANSITIONS[currentTask.status],
          data: currentTask,
        });
        return;
      }

      const result = await client.query(
        `UPDATE tasks
         SET status = $1,
             version = version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3 AND version = $4
         RETURNING *`,
        [status, id, organizationId, expectedVersion]
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
        `INSERT INTO task_activities
          (task_id, organization_id, actor_user_id, activity_type,
           task_version, previous_state, new_state)
         VALUES ($1, $2, $3, 'status_updated', $4, $5, $6)`,
        [
          task.id,
          organizationId,
          userId,
          task.version,
          JSON.stringify(currentTask),
          JSON.stringify(task),
        ]
      );

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
            version: task.version,
          }),
          `task.updated:${task.id}:${task.version}`,
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


import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import {
  createPaginationMetadata,
  parsePagination,
} from "../utils/pagination";

const router = Router();

// Require authentication for all project endpoints
router.use(authenticateToken);

// GET all projects for the authenticated user's organization
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pagination = parsePagination(req.query.page, req.query.limit);
    if (!pagination.success) {
      res.status(400).json({
        success: false,
        message: pagination.message,
      });
      return;
    }

    const organizationId = req.user!.organizationId;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM projects
       WHERE organization_id = $1`,
      [organizationId]
    );
    const result = await pool.query(
      `SELECT id, organization_id, name, description, status,
              created_at, updated_at
       FROM projects
       WHERE organization_id = $1
       ORDER BY id
       LIMIT $2 OFFSET $3`,
      [
        organizationId,
        pagination.pagination.limit,
        pagination.pagination.offset,
      ]
    );
    const total = Number(countResult.rows[0].total);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: createPaginationMetadata(
        pagination.pagination.page,
        pagination.pagination.limit,
        total
      ),
    });
  } catch (error) {
    next(error);
  }
});

// GET project by ID within the authenticated user's organization
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const organizationId = req.user!.organizationId;

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
      return;
    }

    const result = await pool.query(
      `SELECT id, organization_id, name, description, status,
              created_at, updated_at
       FROM projects
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Project not found",
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
});

// POST create project
router.post(
  "/",
  authorizeRoles("owner", "project_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description } = req.body;
      const organizationId = req.user!.organizationId;

      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({
          success: false,
          message: "Project name is required",
        });
        return;
      }

      const result = await pool.query(
        `INSERT INTO projects (organization_id, name, description)
         VALUES ($1, $2, $3)
         RETURNING id, organization_id, name, description, status,
                   created_at, updated_at`,
        [
          organizationId,
          name.trim(),
          typeof description === "string" ? description.trim() : "",
        ]
      );

      res.status(201).json({
        success: true,
        message: "Project created successfully",
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT update project
router.put(
  "/:id",
  authorizeRoles("owner", "project_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { name, description } = req.body;
      const organizationId = req.user!.organizationId;

      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: "Invalid project ID",
        });
        return;
      }

      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({
          success: false,
          message: "Project name is required",
        });
        return;
      }

      const result = await pool.query(
        `UPDATE projects
         SET name = $1,
             description = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND organization_id = $4
         RETURNING id, organization_id, name, description, status,
                   created_at, updated_at`,
        [
          name.trim(),
          typeof description === "string" ? description.trim() : "",
          id,
          organizationId,
        ]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: "Project not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Project updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE project
router.delete(
  "/:id",
  authorizeRoles("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const organizationId = req.user!.organizationId;

      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: "Invalid project ID",
        });
        return;
      }

      const result = await pool.query(
        `DELETE FROM projects
         WHERE id = $1 AND organization_id = $2
         RETURNING id`,
        [id, organizationId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: "Project not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Project deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

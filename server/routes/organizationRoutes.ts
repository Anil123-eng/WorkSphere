import { Router, Request, Response, NextFunction } from "express";
import { PoolClient } from "pg";
import { pool } from "../db";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";

type AssignableRole = "project_manager" | "team_member";

function isAssignableRole(value: unknown): value is AssignableRole {
  return value === "project_manager" || value === "team_member";
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

const router = Router();

router.post(
  "/members",
  authenticateToken,
  authorizeRoles("owner"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const role = req.body?.role;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isAssignableRole(role)) {
      res.status(400).json({
        success: false,
        message: "A valid email and assignable organization role are required",
      });
      return;
    }

    const requester = req.user;
    if (!requester) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (error) {
      next(error);
      return;
    }

    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const target = await client.query(
        `SELECT id
         FROM users
         WHERE lower(email) = $1
         FOR KEY SHARE`,
        [email]
      );

      if (target.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        res.status(404).json({
          success: false,
          message: "No registered account was found for that email",
        });
        return;
      }

      const membership = await client.query(
        `INSERT INTO organization_memberships
         (organization_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING organization_id, user_id, role`,
        [requester.organizationId, target.rows[0].id, role]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.status(201).json({
        success: true,
        message: "Organization membership added",
        data: {
          organizationId: Number(membership.rows[0].organization_id),
          userId: Number(membership.rows[0].user_id),
          email,
          role: membership.rows[0].role,
        },
      });
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          next(rollbackError);
          return;
        }
      }

      if (isUniqueViolation(error)) {
        res.status(409).json({
          success: false,
          message: "That account is already a member of this organization",
        });
        return;
      }

      next(error);
    } finally {
      client.release();
    }
  }
);

export default router;

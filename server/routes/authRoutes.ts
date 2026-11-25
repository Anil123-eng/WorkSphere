
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import {
  generateAccessToken,
  generateRefreshToken,
  generateTokenFamilyId,
  hashRefreshToken,
} from "../utils/tokenUtils";

const router = Router();

// Register a new organization and its owner
router.post(
  "/register",
  async (req: Request, res: Response): Promise<void> => {
    const { name, email, password, organizationName } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof organizationName !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !password ||
      !organizationName.trim()
    ) {
      res.status(400).json({
        success: false,
        message: "All fields are required",
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const passwordHash = await bcrypt.hash(password, 12);

      const organizationResult = await client.query(
        `INSERT INTO organizations (name)
         VALUES ($1)
         RETURNING id, name`,
        [organizationName.trim()]
      );

      const organization = organizationResult.rows[0];

      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [name.trim(), normalizedEmail, passwordHash]
      );

      const user = userResult.rows[0];

      await client.query(
        `INSERT INTO organization_memberships
         (organization_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [organization.id, user.id, "owner"]
      );

      const userId = Number(user.id);
      const organizationId = Number(organization.id);
      const role = "owner";

      const accessToken = generateAccessToken({
        userId,
        email: user.email,
        organizationId,
        role,
      });

      const refreshToken = generateRefreshToken();
      const tokenFamilyId = generateTokenFamilyId();

      const refreshDays = Number(
        process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7
      );

      const expiresAt = new Date(
        Date.now() + refreshDays * 24 * 60 * 60 * 1000
      );

      await client.query(
        `INSERT INTO refresh_tokens
         (user_id, organization_id, token_hash, token_family_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          organizationId,
          hashRefreshToken(refreshToken),
          tokenFamilyId,
          expiresAt,
        ]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Organization and owner registered successfully",
        data: {
          user,
          organization,
          role,
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
        return;
      }

      console.error("Registration error:", error);

      res.status(500).json({
        success: false,
        message: "Registration failed",
      });
    } finally {
      client.release();
    }
  }
);


// Login an existing user
router.post(
  "/login",
  async (req: Request, res: Response): Promise<void> => {
    const { email, password, organizationId } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    let client: Awaited<ReturnType<typeof pool.connect>> | undefined;

    try {
      // Connect inside try so database connection failures are caught
      client = await pool.connect();

      const userResult = await client.query(
        `SELECT id, name, email, password_hash
         FROM users
         WHERE email = $1`,
        [email.trim().toLowerCase()]
      );

      if (userResult.rows.length === 0) {
        res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
        return;
      }

      const user = userResult.rows[0];

      const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!passwordMatches) {
        res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
        return;
      }

      const membershipResult = await client.query(
        `SELECT
           om.organization_id,
           om.role,
           o.name AS organization_name
         FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = $1
         ORDER BY om.organization_id`,
        [user.id]
      );

      const memberships = membershipResult.rows;

      if (memberships.length === 0) {
        res.status(403).json({
          success: false,
          message: "No organization membership found",
        });
        return;
      }

      let membership;

      if (organizationId !== undefined) {
        const requestedOrganizationId = Number(organizationId);

        if (
          !Number.isSafeInteger(requestedOrganizationId) ||
          requestedOrganizationId <= 0
        ) {
          res.status(400).json({
            success: false,
            message: "Invalid organizationId",
          });
          return;
        }

        membership = memberships.find(
          (item) =>
            Number(item.organization_id) === requestedOrganizationId
        );

        if (!membership) {
          res.status(403).json({
            success: false,
            message: "You are not a member of this organization",
          });
          return;
        }
      } else if (memberships.length === 1) {
        membership = memberships[0];
      } else {
        res.status(400).json({
          success: false,
          message: "Please provide an organizationId",
        });
        return;
      }

      const userId = Number(user.id);
      const selectedOrganizationId = Number(membership.organization_id);
      const role = membership.role;

      const accessToken = generateAccessToken({
        userId,
        email: user.email,
        organizationId: selectedOrganizationId,
        role,
      });

      const refreshToken = generateRefreshToken();
      const tokenFamilyId = generateTokenFamilyId();

      const refreshDays = Number(
        process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7
      );

      const expiresAt = new Date(
        Date.now() + refreshDays * 24 * 60 * 60 * 1000
      );

      await client.query(
        `INSERT INTO refresh_tokens
         (user_id, organization_id, token_hash, token_family_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          selectedOrganizationId,
          hashRefreshToken(refreshToken),
          tokenFamilyId,
          expiresAt,
        ]
      );

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: {
            id: userId,
            name: user.name,
            email: user.email,
          },
          organization: {
            id: selectedOrganizationId,
            name: membership.organization_name,
          },
          role,
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      console.error("Login error:", error);

      res.status(500).json({
        success: false,
        message: "Login failed",
      });
    } finally {
      client?.release();
    }
  }
);

// Refresh access token and rotate refresh token
router.post(
  "/refresh",
  async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;

    if (typeof refreshToken !== "string" || !refreshToken) {
      res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const tokenHash = hashRefreshToken(refreshToken);

      const tokenResult = await client.query(
        `SELECT
           id,
           user_id,
           organization_id,
           token_family_id,
           expires_at,
           revoked_at
         FROM refresh_tokens
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        await client.query("ROLLBACK");

        res.status(401).json({
          success: false,
          message: "Invalid refresh token",
        });
        return;
      }

      const storedToken = tokenResult.rows[0];

      if (storedToken.revoked_at) {
        await client.query(
          `UPDATE refresh_tokens
           SET revoked_at = CURRENT_TIMESTAMP
           WHERE token_family_id = $1
             AND revoked_at IS NULL`,
          [storedToken.token_family_id]
        );

        await client.query("COMMIT");

        res.status(401).json({
          success: false,
          message: "Refresh token reuse detected. Please log in again",
        });
        return;
      }

      if (new Date(storedToken.expires_at).getTime() <= Date.now()) {
        await client.query("ROLLBACK");

        res.status(401).json({
          success: false,
          message: "Refresh token has expired",
        });
        return;
      }

      if (!storedToken.organization_id) {
        await client.query("ROLLBACK");

        res.status(401).json({
          success: false,
          message: "Refresh token is not associated with an organization",
        });
        return;
      }

      const membershipResult = await client.query(
        `SELECT
           u.id,
           u.email,
           om.organization_id,
           om.role
         FROM users u
         JOIN organization_memberships om
           ON om.user_id = u.id
         WHERE u.id = $1
           AND om.organization_id = $2`,
        [storedToken.user_id, storedToken.organization_id]
      );

      if (membershipResult.rows.length === 0) {
        await client.query(
          `UPDATE refresh_tokens
           SET revoked_at = CURRENT_TIMESTAMP
           WHERE token_family_id = $1
             AND revoked_at IS NULL`,
          [storedToken.token_family_id]
        );

        await client.query("COMMIT");

        res.status(401).json({
          success: false,
          message: "Organization membership no longer exists",
        });
        return;
      }

      const membership = membershipResult.rows[0];

      const userId = Number(membership.id);
      const organizationId = Number(membership.organization_id);
      const role = membership.role;

      const accessToken = generateAccessToken({
        userId,
        email: membership.email,
        organizationId,
        role,
      });

      const newRefreshToken = generateRefreshToken();

      const refreshDays = Number(
        process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7
      );

      const expiresAt = new Date(
        Date.now() + refreshDays * 24 * 60 * 60 * 1000
      );

      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [storedToken.id]
      );

      await client.query(
        `INSERT INTO refresh_tokens
         (user_id, organization_id, token_hash, token_family_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          organizationId,
          hashRefreshToken(newRefreshToken),
          storedToken.token_family_id,
          expiresAt,
        ]
      );

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Access token refreshed successfully",
        data: {
          accessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Token refresh error:", error);

      res.status(500).json({
        success: false,
        message: "Token refresh failed",
      });
    } finally {
      client.release();
    }
  }
);


// Logout and revoke the refresh-token session
router.post(
  "/logout",
  async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;

    if (typeof refreshToken !== "string" || !refreshToken) {
      res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
      return;
    }

    try {
      const tokenHash = hashRefreshToken(refreshToken);

      const result = await pool.query(
        `UPDATE refresh_tokens
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE token_family_id = (
           SELECT token_family_id
           FROM refresh_tokens
           WHERE token_hash = $1
         )
         AND revoked_at IS NULL
         RETURNING id`,
        [tokenHash]
      );

      if (result.rowCount === 0) {
        res.status(401).json({
          success: false,
          message: "Invalid or already revoked refresh token",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Logout successful",
      });
    } catch (error) {
      console.error("Logout error:", error);

      res.status(500).json({
        success: false,
        message: "Logout failed",
      });
    }
  }
);


export default router;

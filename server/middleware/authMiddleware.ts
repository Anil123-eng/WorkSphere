
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../utils/tokenUtils";
import { pool } from "../db";

declare module "express-serve-static-core" {
  interface Request {
    user?: AccessTokenPayload;
  }
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  let decoded: AccessTokenPayload;

  try {
    decoded = verifyAccessToken(token);
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
    return;
  }

  try {
    const membershipResult = await pool.query(
      `SELECT role
       FROM organization_memberships
       WHERE user_id = $1
         AND organization_id = $2
         AND role = $3`,
      [decoded.userId, decoded.organizationId, decoded.role]
    );

    if (membershipResult.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: "Your organization membership is no longer valid",
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
}

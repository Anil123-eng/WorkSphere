
import { Request, Response, NextFunction } from "express";

type OrganizationRole =
  | "owner"
  | "project_manager"
  | "team_member"
  | "auditor";

export function authorizeRoles(...allowedRoles: OrganizationRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role as OrganizationRole)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
      return;
    }

    next();
  };
}

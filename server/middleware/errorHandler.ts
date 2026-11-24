
import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  void next;

  console.error(err.message);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

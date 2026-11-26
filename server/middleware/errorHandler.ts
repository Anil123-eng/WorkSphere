
import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  void next;

  const correlationId = (
    _req as Request & { correlationId?: string }
  ).correlationId;
  console.error(
    JSON.stringify({
      level: "error",
      event: "unhandled_request_error",
      correlationId,
      errorType: err instanceof Error ? err.name : "UnknownError",
    })
  );

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

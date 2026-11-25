
import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/authMiddleware";
import { taskEvents } from "../utils/taskEvents";

const router = Router();

router.get(
  "/stream",
  authenticateToken,
  (req: Request, res: Response) => {
    const organizationId = req.user!.organizationId;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    res.write("event: connected\n");
    res.write(
      `data: ${JSON.stringify({ message: "Connected to task updates" })}\n\n`
    );

    const unsubscribe = taskEvents.subscribe(
      organizationId,
      (event) => {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  }
);

export default router;

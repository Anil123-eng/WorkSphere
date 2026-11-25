
import { Router, Request, Response } from "express";
import { pool } from "../db";
import { verifyWebhookSignature } from "../utils/webhookUtils";

const router = Router();

router.post("/resend", async (req: Request, res: Response) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  const rawBody = (
    req as Request & { rawBody?: Buffer }
  ).rawBody;

  const messageId = req.get("svix-id");
  const timestamp = req.get("svix-timestamp");
  const signature = req.get("svix-signature");

  if (!secret) {
    res.status(503).json({
      success: false,
      message: "Webhook integration is not configured",
    });
    return;
  }

  if (
    !rawBody ||
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid webhook request",
    });
    return;
  }

  const isValid = verifyWebhookSignature(
    rawBody,
    messageId,
    timestamp,
    signature,
    secret
  );

  if (!isValid) {
    res.status(401).json({
      success: false,
      message: "Invalid webhook signature",
    });
    return;
  }

  const { type } = req.body;

  if (typeof type !== "string" || !type.trim()) {
    res.status(400).json({
      success: false,
      message: "Valid event type is required",
    });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO webhook_events
        (provider, event_id, event_type, payload, status, processed_at)
       VALUES ('resend', $1, $2, $3, 'processed', CURRENT_TIMESTAMP)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      [messageId, type, JSON.stringify(req.body)]
    );

    await client.query("COMMIT");

    if (result.rows.length === 0) {
      res.status(200).json({
        success: true,
        message: "Duplicate event ignored",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Webhook event recorded successfully",
    });
  } catch {
    await client.query("ROLLBACK");

    res.status(500).json({
      success: false,
      message: "Unable to process webhook event",
    });
  } finally {
    client.release();
  }
});

export default router;

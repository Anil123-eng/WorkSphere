
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import { sendEmail } from "../services/emailService";

const router = Router();

router.post(
  "/email",
  authenticateToken,
  authorizeRoles("owner", "project_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { to, subject, html } = req.body ?? {};

    if (
      typeof to !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ||
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.length > 200 ||
      typeof html !== "string" ||
      !html.trim() ||
      html.length > 20000
    ) {
      res.status(400).json({
        success: false,
        message: "Valid recipient, subject, and email content are required",
      });
      return;
    }

    try {
      const result = await sendEmail(
        to.trim(),
        subject.trim(),
        html
      );

      res.status(200).json({
        success: true,
        message: "Email sent successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

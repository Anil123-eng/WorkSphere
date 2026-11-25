
import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { pool } from "../db";
import { authenticateToken } from "../middleware/authMiddleware";
import {
  createUploadUrl,
  createDownloadUrl,
} from "../services/storageService";

const router = Router();

const allowedContentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

router.use(authenticateToken);

router.post(
  "/upload-url",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fileName, contentType, sizeBytes, projectId, taskId } =
        req.body ?? {};

      if (
        typeof fileName !== "string" ||
        !fileName.trim() ||
        fileName.length > 255 ||
        typeof contentType !== "string" ||
        !allowedContentTypes.includes(contentType) ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes <= 0 ||
        sizeBytes > MAX_FILE_SIZE
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid file name, type, or size",
        });
        return;
      }

      const hasProject = Number.isSafeInteger(projectId) && projectId > 0;
      const hasTask = Number.isSafeInteger(taskId) && taskId > 0;

      if (hasProject === hasTask) {
        res.status(400).json({
          success: false,
          message: "Provide exactly one valid project ID or task ID",
        });
        return;
      }

      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;

      if (hasProject) {
        const result = await pool.query(
          `SELECT id FROM projects
           WHERE id = $1 AND organization_id = $2`,
          [projectId, organizationId]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            message: "Project not found",
          });
          return;
        }
      }

      if (hasTask) {
        const result = await pool.query(
          `SELECT id FROM tasks
           WHERE id = $1 AND organization_id = $2`,
          [taskId, organizationId]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            message: "Task not found",
          });
          return;
        }
      }

      const safeFileName = fileName
        .trim()
        .replace(/[^a-zA-Z0-9._-]/g, "_");

      const storageKey =
        `${organizationId}/${randomUUID()}-${safeFileName}`;

      const uploadUrl = await createUploadUrl(
        storageKey,
        contentType
      );

      const result = await pool.query(
        `INSERT INTO attachments
          (organization_id, project_id, task_id, uploaded_by,
           storage_key, file_name, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          organizationId,
          hasProject ? projectId : null,
          hasTask ? taskId : null,
          userId,
          storageKey,
          safeFileName,
          contentType,
          sizeBytes,
        ]
      );

      res.status(201).json({
        success: true,
        message: "Upload URL created successfully",
        data: {
          attachmentId: result.rows[0].id,
          uploadUrl,
          storageKey,
          expiresIn: 300,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:id/download-url",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attachmentId = Number(req.params.id);

      if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
        res.status(400).json({
          success: false,
          message: "Invalid attachment ID",
        });
        return;
      }

      const result = await pool.query(
        `SELECT storage_key, file_name
         FROM attachments
         WHERE id = $1 AND organization_id = $2`,
        [attachmentId, req.user!.organizationId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: "Attachment not found",
        });
        return;
      }

      const attachment = result.rows[0];
      const downloadUrl = await createDownloadUrl(
        attachment.storage_key
      );

      res.status(200).json({
        success: true,
        data: {
          fileName: attachment.file_name,
          downloadUrl,
          expiresIn: 300,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

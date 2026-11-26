
import request from "supertest";
import { randomUUID } from "crypto";
import app from "../app";
import { pool } from "../db";
import { sendEmail } from "../services/emailService";
import {
  createUploadUrl,
  createDownloadUrl,
} from "../services/storageService";

jest.mock("../services/emailService", () => ({
  sendEmail: jest.fn(),
}));

jest.mock("../services/storageService", () => ({
  createUploadUrl: jest.fn(),
  createDownloadUrl: jest.fn(),
}));

describe("WorkSphere Assessment 08 Integrations", () => {
  let accessToken: string;
  let organizationId: number;
  let userId: number;
  let projectId: number;
  let attachmentId: number;

  const testEmail = `worksphere-a08-${randomUUID()}@example.com`;

  const authenticatedRequest = () => ({
    Authorization: `Bearer ${accessToken}`,
  });

  const mockedSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
  const mockedCreateUploadUrl =
    createUploadUrl as jest.MockedFunction<typeof createUploadUrl>;
  const mockedCreateDownloadUrl =
    createDownloadUrl as jest.MockedFunction<typeof createDownloadUrl>;

  beforeAll(async () => {
    const registration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Assessment 08 Test User",
        email: testEmail,
        password: "TestPassword@123",
        organizationName: "Assessment 08 Test Organization",
      });

    if (registration.status !== 201) {
      throw new Error(
        `Test registration failed: ${JSON.stringify(registration.body)}`
      );
    }

    accessToken = registration.body.data.accessToken;
    userId = Number(registration.body.data.user.id);
    organizationId = Number(registration.body.data.organization.id);

    const project = await request(app)
      .post("/api/projects")
      .set(authenticatedRequest())
      .send({
        name: "Assessment 08 Test Project",
        description: "Project for attachment tests",
      });

    if (project.status !== 201) {
      throw new Error(
        `Test project creation failed: ${JSON.stringify(project.body)}`
      );
    }

    projectId = Number(project.body.data.id);
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await pool.query(
          "DELETE FROM organizations WHERE id = $1",
          [organizationId]
        );
      }

      if (userId) {
        await pool.query(
          "DELETE FROM users WHERE id = $1",
          [userId]
        );
      }
    } finally {
      await pool.end();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /api/integrations/email - should send an email", async () => {
    mockedSendEmail.mockResolvedValue({
      id: "test-email-id",
    } as Awaited<ReturnType<typeof sendEmail>>);

    const response = await request(app)
      .post("/api/integrations/email")
      .set(authenticatedRequest())
      .send({
        to: "recipient@example.com",
        subject: "Test Notification",
        html: "<h1>Welcome to WorkSphere</h1>",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
  });

  test("POST /api/integrations/email - should return a safe error when delivery fails", async () => {
    mockedSendEmail
      .mockRejectedValueOnce(new Error("Simulated provider outage"))
      .mockResolvedValueOnce({
        id: "recovered-email-id",
      } as Awaited<ReturnType<typeof sendEmail>>);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const response = await request(app)
        .post("/api/integrations/email")
        .set(authenticatedRequest())
        .send({
          to: "recipient@example.com",
          subject: "Test Notification",
          html: "<p>Test</p>",
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: "Internal server error",
      });
      expect(JSON.stringify(response.body)).not.toContain(
        "Simulated provider outage"
      );

      const recovered = await request(app)
        .post("/api/integrations/email")
        .set(authenticatedRequest())
        .send({
          to: "recipient@example.com",
          subject: "Test Notification",
          html: "<p>Test</p>",
        });

      expect(recovered.status).toBe(200);
      expect(recovered.body.success).toBe(true);
      expect(mockedSendEmail).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  test("POST /api/integrations/email - should reject invalid email data", async () => {
    const response = await request(app)
      .post("/api/integrations/email")
      .set(authenticatedRequest())
      .send({
        to: "invalid-email",
        subject: "Test Notification",
        html: "<p>Test</p>",
      });

    expect(response.status).toBe(400);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  test("POST /api/integrations/email - should reject unauthenticated requests", async () => {
    const response = await request(app)
      .post("/api/integrations/email")
      .send({
        to: "recipient@example.com",
        subject: "Test Notification",
        html: "<p>Test</p>",
      });

    expect(response.status).toBe(401);
  });

  test("POST /api/attachments/upload-url - should create an upload URL", async () => {
    mockedCreateUploadUrl.mockResolvedValue(
      "https://example.com/mock-upload"
    );

    const response = await request(app)
      .post("/api/attachments/upload-url")
      .set(authenticatedRequest())
      .send({
        fileName: "test-document.pdf",
        contentType: "application/pdf",
        sizeBytes: 102400,
        projectId,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.uploadUrl).toBe(
      "https://example.com/mock-upload"
    );

    attachmentId = Number(response.body.data.attachmentId);

    expect(mockedCreateUploadUrl).toHaveBeenCalledTimes(1);
  });

  test("POST /api/attachments/upload-url - should reject unsupported file types", async () => {
    const response = await request(app)
      .post("/api/attachments/upload-url")
      .set(authenticatedRequest())
      .send({
        fileName: "test.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 102400,
        projectId,
      });

    expect(response.status).toBe(400);
    expect(mockedCreateUploadUrl).not.toHaveBeenCalled();
  });

  test("GET /api/attachments/:id/download-url - should create a download URL", async () => {
    mockedCreateDownloadUrl.mockResolvedValue(
      "https://example.com/mock-download"
    );

    const response = await request(app)
      .get(`/api/attachments/${attachmentId}/download-url`)
      .set(authenticatedRequest());

    expect(response.status).toBe(200);
    expect(response.body.data.downloadUrl).toBe(
      "https://example.com/mock-download"
    );
    expect(mockedCreateDownloadUrl).toHaveBeenCalledTimes(1);
  });
});

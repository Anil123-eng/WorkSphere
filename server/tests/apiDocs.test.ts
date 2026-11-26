import request from "supertest";
import app from "../app";

describe("Node API documentation", () => {
  test("serves the OpenAPI contract with endpoint examples and limitations", async () => {
    const response = await request(app).get("/api/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.info.version).toBe("1.0.0");
    expect(response.body.paths["/api/auth/login"].post.requestBody).toBeDefined();
    expect(response.body.paths["/api/v1/auth/login"].post.operationId).toBe(
      "loginV1"
    );
    expect(response.body.paths["/api/webhooks/resend"].post.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "svix-id", in: "header", required: true }),
      ])
    );
    expect(response.body["x-rate-limit-policy"].status).toBe("enforced");
    expect(response.body["x-rate-limit-policy"].headers).toHaveProperty(
      "Retry-After"
    );
    expect(response.body["x-api-versioning"].versionedPrefix).toBe("/api/v1");
    expect(response.body.paths["/api/projects"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "page", in: "query" }),
        expect.objectContaining({ name: "limit", in: "query" }),
      ])
    );
    expect(response.body.paths["/api/projects"].get.responses["429"]).toBeDefined();
    expect(
      response.body.paths["/api/v1/tasks/{id}"].patch.requestBody.content[
        "application/json"
      ].schema
    ).toEqual({ $ref: "#/components/schemas/TaskStatusRequest" });
    expect(
      response.body.components.schemas.TaskStatusRequest.required
    ).toEqual(["status", "expectedVersion"]);
    expect(
      response.body.paths["/api/v1/tasks/{id}"].patch.responses["409"]
    ).toBeDefined();
    expect(
      response.body.paths["/api/v1/tasks/{id}/activities"].get
    ).toBeDefined();
  });

  test("serves the interactive Swagger UI", async () => {
    const response = await request(app).get("/api/docs/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("swagger-ui");
  });
});

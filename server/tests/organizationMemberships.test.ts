import request from "supertest";
import { randomUUID } from "crypto";
import app from "../app";
import { pool } from "../db";

interface TestAccount {
  userId: number;
  organizationId: number;
  email: string;
  accessToken: string;
}

describe("tenant-scoped organization member provisioning", () => {
  const password = "TestPassword@123";
  const accountIds: number[] = [];
  const organizationIds: number[] = [];
  let owner: TestAccount;
  let manager: TestAccount;
  let teamMember: TestAccount;
  let managerToken = "";
  let teamMemberToken = "";

  async function registerAccount(label: string): Promise<TestAccount> {
    const email = `worksphere-members-${label}-${randomUUID()}@example.test`;
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: `Membership ${label}`,
        email,
        password,
        organizationName: `Membership ${label} ${randomUUID()}`,
      });

    if (response.status !== 201) {
      throw new Error(`Account setup failed with status ${response.status}`);
    }

    const account: TestAccount = {
      userId: Number(response.body.data.user.id),
      organizationId: Number(response.body.data.organization.id),
      email,
      accessToken: response.body.data.accessToken,
    };
    accountIds.push(account.userId);
    organizationIds.push(account.organizationId);
    return account;
  }

  async function loginToOrganization(
    account: TestAccount,
    organizationId: number
  ) {
    return request(app).post("/api/auth/login").send({
      email: account.email,
      password,
      organizationId,
    });
  }

  beforeAll(async () => {
    owner = await registerAccount("owner");
    manager = await registerAccount("manager");
    teamMember = await registerAccount("member");
  });

  afterAll(async () => {
    try {
      if (organizationIds.length > 0) {
        await pool.query(
          "DELETE FROM organizations WHERE id = ANY($1::bigint[])",
          [organizationIds]
        );
      }
      if (accountIds.length > 0) {
        await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [
          accountIds,
        ]);
      }
    } finally {
      await pool.end();
    }
  });

  test("an owner assigns supported roles only within their authenticated organization", async () => {
    const managerResponse = await request(app)
      .post("/api/organizations/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: manager.email,
        role: "project_manager",
        organizationId: manager.organizationId,
      });

    expect(managerResponse.status).toBe(201);
    expect(managerResponse.body.data).toMatchObject({
      organizationId: owner.organizationId,
      userId: manager.userId,
      role: "project_manager",
    });

    const memberResponse = await request(app)
      .post("/api/organizations/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: teamMember.email,
        role: "team_member",
      });

    expect(memberResponse.status).toBe(201);
    expect(memberResponse.body.data).toMatchObject({
      organizationId: owner.organizationId,
      userId: teamMember.userId,
      role: "team_member",
    });
  });

  test("users select their organization and receive that membership's role", async () => {
    const managerSelection = await request(app)
      .post("/api/auth/login")
      .send({ email: manager.email, password });

    expect(managerSelection.status).toBe(409);
    expect(managerSelection.body.code).toBe(
      "ORGANIZATION_SELECTION_REQUIRED"
    );
    expect(managerSelection.body.data.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: manager.organizationId,
          role: "owner",
        }),
        expect.objectContaining({
          id: owner.organizationId,
          role: "project_manager",
        }),
      ])
    );

    const managerLogin = await loginToOrganization(manager, owner.organizationId);
    expect(managerLogin.status).toBe(200);
    expect(managerLogin.body.data.role).toBe("project_manager");
    managerToken = managerLogin.body.data.accessToken;

    const memberLogin = await loginToOrganization(
      teamMember,
      owner.organizationId
    );
    expect(memberLogin.status).toBe(200);
    expect(memberLogin.body.data.role).toBe("team_member");
    teamMemberToken = memberLogin.body.data.accessToken;
  });

  test("rejects unauthenticated, non-owner, duplicate, and unsupported assignments", async () => {
    const unauthenticated = await request(app)
      .post("/api/organizations/members")
      .send({ email: manager.email, role: "team_member" });
    expect(unauthenticated.status).toBe(401);

    const nonOwner = await request(app)
      .post("/api/organizations/members")
      .set("Authorization", `Bearer ${teamMemberToken}`)
      .send({ email: manager.email, role: "team_member" });
    expect(nonOwner.status).toBe(403);

    const unsupportedRole = await request(app)
      .post("/api/organizations/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: manager.email, role: "admin" });
    expect(unsupportedRole.status).toBe(400);

    const duplicate = await request(app)
      .post("/api/organizations/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: manager.email, role: "team_member" });
    expect(duplicate.status).toBe(409);
  });

  test("a provisioned account cannot select another tenant or read its projects", async () => {
    const targetProject = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Membership tenant project" });
    expect(targetProject.status).toBe(201);

    const managerPrivateProject = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send({ name: "Manager personal tenant project" });
    expect(managerPrivateProject.status).toBe(201);

    const projectList = await request(app)
      .get("/api/projects?limit=100")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(projectList.status).toBe(200);
    expect(projectList.body.data.map((project: { name: string }) => project.name))
      .toContain("Membership tenant project");
    expect(projectList.body.data.map((project: { name: string }) => project.name))
      .not.toContain("Manager personal tenant project");

    const foreignOrganizationLogin = await loginToOrganization(
      manager,
      teamMember.organizationId
    );
    expect(foreignOrganizationLogin.status).toBe(403);
  });
});

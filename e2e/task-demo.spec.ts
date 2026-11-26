import { expect, test } from "@playwright/test";

test("authenticated users can demonstrate task conflicts and inspect history", async ({
  page,
}) => {
  let projectCreated = false;
  let task: {
    id: number;
    project_id: number;
    title: string;
    description: string;
    status: "todo" | "in_progress" | "completed";
    version: number;
    due_date: null;
  } | null = null;
  let activities: Array<Record<string, unknown>> = [];

  await page.context().route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const send = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.pathname === "/api/auth/session" && method === "GET") {
      return send(200, {
        success: true,
        data: { userId: 7, organizationId: 7, role: "project_manager" },
      });
    }

    if (url.pathname === "/api/projects" && method === "GET") {
      return send(200, { success: true, data: projectCreated ? [
        { id: 8, name: "Keyboard demo project", description: "", status: "active" },
      ] : [] });
    }

    if (url.pathname === "/api/projects" && method === "POST") {
      projectCreated = true;
      return send(201, {
        success: true,
        data: { id: 8, name: "Keyboard demo project", description: "", status: "active" },
      });
    }

    if (url.pathname === "/api/tasks" && method === "POST") {
      const body = request.postDataJSON() as { projectId: number; title: string };
      task = {
        id: 22,
        project_id: body.projectId,
        title: body.title,
        description: "",
        status: "todo",
        version: 1,
        due_date: null,
      };
      activities = [{
        id: 1,
        activity_type: "created",
        task_version: 1,
        previous_state: null,
        new_state: { title: body.title, status: "todo", version: 1 },
        created_at: "2026-11-26T10:00:00.000Z",
      }];
      return send(201, { success: true, data: task });
    }

    if (url.pathname === "/api/tasks/22" && method === "GET" && task) {
      return send(200, { success: true, data: task });
    }

    if (url.pathname === "/api/tasks/22" && method === "PATCH" && task) {
      const body = request.postDataJSON() as {
        expectedVersion: number;
        status: "todo" | "in_progress" | "completed";
      };
      if (body.expectedVersion !== task.version) {
        return send(409, {
          success: false,
          message: "Task was updated by another user",
          currentVersion: task.version,
          data: task,
        });
      }

      task = { ...task, status: body.status, version: task.version + 1 };
      activities = [...activities, {
        id: task.version,
        activity_type: "status_updated",
        task_version: task.version,
        previous_state: { status: "todo", version: 1 },
        new_state: { status: task.status, version: task.version },
        created_at: "2026-11-26T10:01:00.000Z",
      }];
      return send(200, { success: true, data: task });
    }

    if (url.pathname === "/api/tasks/22/activities" && method === "GET") {
      return send(200, {
        success: true,
        data: activities,
        pagination: {
          page: 1,
          limit: 10,
          total: activities.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      });
    }

    return send(404, { success: false, message: "Unexpected test API request" });
  });

  await page.addInitScript(() => {
    localStorage.setItem("accessToken", "synthetic-e2e-token");
    localStorage.setItem("refreshToken", "synthetic-e2e-refresh");
  });
  await page.goto("/project-manager");
  await expect(
    page.getByRole("heading", { name: "Task concurrency and history demo" })
  ).toBeVisible();

  const projectName = page.getByLabel("New project name");
  await projectName.focus();
  await projectName.fill("Keyboard demo project");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create project" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Project created.")).toBeVisible();

  await page.getByLabel("Task title").fill("Two-tab concurrency demo");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Task created at version 1.")).toBeVisible();

  const otherTab = await page.context().newPage();
  await otherTab.goto("/project-manager");
  await otherTab.getByLabel("Task ID").fill("22");
  await otherTab.getByRole("button", { name: "Load task" }).click();
  await expect(otherTab.getByText("Loaded task at version 1.")).toBeVisible();

  await page.getByLabel("New status").selectOption("in_progress");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText("Task saved at version 2.")).toBeVisible();

  await otherTab.getByLabel("New status").selectOption("completed");
  await otherTab.getByRole("button", { name: "Save status" }).click();
  await expect(
    otherTab.getByText(
      "Conflict: this task is now version 2. Your change was not saved. Reload the latest task before retrying.",
      { exact: true }
    )
  ).toBeVisible();
  await otherTab.getByRole("button", { name: "Reload latest task" }).click();
  await expect(otherTab.getByText("Loaded task at version 2.")).toBeVisible();
  await expect(otherTab.getByText("Version 2: status_updated")).toBeVisible();

  await otherTab.setViewportSize({ width: 375, height: 812 });
  const horizontalOverflow = await otherTab.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBe(false);
  await otherTab.close();
});

import { expect, test } from "@playwright/test";

const workspaceCases = [
  {
    label: "Organization Owner",
    role: "owner",
    path: "/organization-owner",
    dashboardHeading: "Organization Owner",
    hasTaskDemo: true,
  },
  {
    label: "Project Manager",
    role: "project_manager",
    path: "/project-manager",
    dashboardHeading: "Project Manager",
    hasTaskDemo: true,
  },
  {
    label: "Team Member",
    role: "team_member",
    path: "/team-member",
    dashboardHeading: "Team Member",
    hasTaskDemo: false,
  },
];

test("landing page exposes working login and registration links", async ({
  page,
}) => {
  await page.goto("/");
  await page.setViewportSize({ width: 375, height: 812 });

  await expect(
    page.getByRole("heading", { name: "WorkSphere", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
  for (const role of [
    "Platform Administrator",
    "Organization Owner",
    "Project Manager",
    "Team Member",
  ]) {
    await expect(page.getByRole("heading", { name: role })).toBeVisible();
  }

  await expect(page.getByRole("link", { name: "Login" })).toHaveAttribute(
    "href",
    "/login"
  );
  await page.getByRole("link", { name: "Login" }).click();
  await expect(
    page.getByRole("heading", { name: "WorkSphere Login" })
  ).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Register" })).toHaveAttribute(
    "href",
    "/register"
  );
  await page.getByRole("link", { name: "Register" }).click();
  await expect(
    page.getByRole("heading", { name: "WorkSphere Registration" })
  ).toBeVisible();
});

for (const viewport of [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  for (const workspace of workspaceCases) {
    test(`${workspace.label} card opens its authorized dashboard at ${viewport.name} size`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.addInitScript((role) => {
        localStorage.setItem("accessToken", "role-test-access-token");
        localStorage.setItem("role", role);
      }, workspace.role);
      await page.route("**/api/auth/session", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { userId: 1, organizationId: 1, role: workspace.role },
          }),
        })
      );
      await page.route("**/api/projects**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: [] }),
        })
      );

      await page.goto("/");
      await page.getByRole("link", { name: new RegExp(workspace.label) }).click();

      await expect(page).toHaveURL(new RegExp(`${workspace.path}$`));
      await expect(
        page.getByRole("heading", {
          name: workspace.dashboardHeading,
          exact: true,
        })
      ).toBeVisible();
      if (workspace.hasTaskDemo) {
        await expect(
          page.getByRole("region", {
            name: "Task concurrency and history demo",
          })
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("region", {
            name: "Task concurrency and history demo",
          })
        ).not.toBeVisible();
      }
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth
        )
      ).toBe(false);
    });
  }

  test(`Platform Administrator selection explains that access is not configured at ${viewport.name} size`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
    await page.getByRole("link", { name: /Platform Administrator/ }).click();

    await expect(page).toHaveURL(/\/platform-admin$/);
    await expect(
      page.getByRole("heading", {
        name: "Platform Administrator access is not configured",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Organization Owner",
        exact: true,
      })
    ).not.toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
      )
    ).toBe(false);
  });
}

test("a user with another role sees access denied instead of the selected dashboard", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("accessToken", "owner-test-access-token");
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { userId: 1, organizationId: 1, role: "owner" },
      }),
    })
  );
  await page.goto("/");
  await page.getByRole("link", { name: /Project Manager/ }).click();

  await expect(page).toHaveURL(/\/project-manager$/);
  await expect(page.locator('main[role="alert"]')).toContainText(
    "Access denied"
  );
  await expect(
    page.getByRole("heading", { name: "Project Manager", exact: true })
  ).not.toBeVisible();
  await page
    .getByRole("link", { name: "Open your authorized workspace" })
    .click();
  await expect(page).toHaveURL(/\/organization-owner$/);
  await expect(
    page.getByRole("heading", { name: "Organization Owner", exact: true })
  ).toBeVisible();
});

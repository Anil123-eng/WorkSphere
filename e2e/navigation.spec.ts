import { expect, test } from "@playwright/test";

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

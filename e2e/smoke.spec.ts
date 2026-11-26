import { expect, test } from "@playwright/test";

test("homepage exposes the WorkSphere login and registration paths", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/WorkSphere/i);
  await expect(
    page.getByRole("link", { name: /login/i }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /register/i }).first()
  ).toBeVisible();
});

test("login page rejects an empty submission with browser validation", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "WorkSphere Login" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Login" }).click();
  const emailInput = page.getByPlaceholder("Enter your email");
  expect(
    await emailInput.evaluate((element: HTMLInputElement) => element.checkValidity())
  ).toBe(false);
});

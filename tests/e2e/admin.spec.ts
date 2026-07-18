import { test, expect } from "@playwright/test";

import { login } from "./helpers";

test("admin can sign in and reach the dashboard + oversight screens", async ({
  page,
}) => {
  await login(page, "admin@hezalli.com", "hezalli123");

  await page.goto("/en/admin", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/admin");
  expect(page.url()).not.toContain("/login");
  // the admin sidebar (only rendered for admins) links to oversight screens
  await expect(page.locator('a[href*="/admin/users"]').first()).toBeVisible();

  await page.goto("/en/admin/users", { waitUntil: "domcontentloaded" });
  await expect(page.locator('input[name="q"]').first()).toBeVisible();

  await page.goto("/en/admin/settings", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "Save" }).first(),
  ).toBeVisible();
});

test("a buyer cannot reach the admin panel", async ({ page }) => {
  await login(page, "buyer1@example.com", "hezalli123");
  await page.goto("/en/admin", { waitUntil: "domcontentloaded" });
  // The admin layout renders a Forbidden screen for non-admins — no admin nav.
  await expect(page.locator('a[href*="/admin/users"]')).toHaveCount(0);
});

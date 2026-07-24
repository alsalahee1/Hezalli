import { test, expect } from "@playwright/test";

// Golden path: register a new buyer → auto-logged-in → log out → log back in.
const email = `e2e-${Date.now()}@test.local`;
const password = "salahahmed";

test("register, then log back in", async ({ page }) => {
  // --- register ---
  await page.goto("/en/register", { waitUntil: "domcontentloaded" });
  await page.fill("#name", "E2E Buyer");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#confirmPassword", password);
  await page.locator('input[name="acceptTerms"]').check();
  await page.click('button[type="submit"]');

  // Registration signs the user in and redirects off /register.
  await page.waitForURL((u) => !u.pathname.endsWith("/register"), {
    timeout: 20_000,
  });

  // The account page is protected — reaching it proves the session is live.
  await page.goto("/en/account", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/account");
  expect(page.url()).not.toContain("/login");

  // --- log back in from a clean session ---
  await page.context().clearCookies();
  await page.goto("/en/account", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/login"); // bounced out once logged out

  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), {
    timeout: 20_000,
  });
  await page.goto("/en/account", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/account");
  expect(page.url()).not.toContain("/login");
});

test("wrong password shows a friendly error, not a crash", async ({ page }) => {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", "admin@hezalli.com");
  await page.fill("#password", "definitely-wrong");
  await page.click('button[type="submit"]');
  // Stays on /login with an inline alert; never reaches a protected page.
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await page.goto("/en/admin", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/login");
});

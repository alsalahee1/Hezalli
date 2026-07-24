import { test, expect } from "@playwright/test";

import { login } from "./helpers";

test("visitor subscribes to the newsletter from the footer", async ({
  page,
}) => {
  await page.goto("/en", { waitUntil: "domcontentloaded" });

  const email = page.getByPlaceholder("Your email");
  await email.fill(`e2e-nl-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Subscribe" }).click();

  // On success the form is replaced by the thank-you message, so the input goes.
  await expect(page.getByPlaceholder("Your email")).toHaveCount(0);
});

test("admin views subscribers and sends a broadcast", async ({ page }) => {
  await login(page, "admin@hezalli.com", "salahahmed");
  await page.goto("/en/admin/newsletter", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Newsletter" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send broadcast" }),
  ).toBeVisible();

  const subject = page.getByPlaceholder("Subject");
  await subject.fill("E2E broadcast");
  await page.getByPlaceholder("Write your message…").fill("Hello subscribers.");
  await page.getByRole("button", { name: "Send broadcast" }).click();

  // Success clears the composer.
  await expect(subject).toHaveValue("");
});

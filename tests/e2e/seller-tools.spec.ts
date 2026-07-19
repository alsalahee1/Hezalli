import { test, expect } from "@playwright/test";

import { login } from "./helpers";

// A unique, non-translated string so the storefront assertion can't match the
// next-intl message blob that ships in every page (only the seller-typed
// vacationMessage renders when the banner is actually shown).
const VAC_MSG = "E2E vacation notice — back soon";
const STORE = "sanaa-electronics";

test("seller tools page renders and vacation mode toggles the storefront banner", async ({
  page,
}) => {
  await login(page, "seller1@hezalli.com", "hezalli123");

  await page.goto("/en/seller/tools", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/seller/tools");
  // i18n keys resolve and all three tool sections render.
  await expect(
    page.getByRole("heading", { name: "Vacation mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Chat auto-reply" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bulk import products" }),
  ).toBeVisible();

  // Enable vacation mode with a custom message and save.
  const vacToggle = page.getByLabel("Enable vacation mode");
  await vacToggle.check();
  await page.getByPlaceholder("Optional message shown to buyers").fill(VAC_MSG);
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Saved")).toBeVisible();

  // Storefront now shows the vacation banner with the seller's message.
  await page.goto(`/en/store/${STORE}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(VAC_MSG)).toBeVisible();

  // Turn vacation back off (restore seed state) and confirm the banner is gone.
  await page.goto("/en/seller/tools", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Enable vacation mode").uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.goto(`/en/store/${STORE}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(VAC_MSG)).toHaveCount(0);
});

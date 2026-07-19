import { test, expect } from "@playwright/test";

import { login } from "./helpers";

test("seller analytics page renders KPIs, chart and period switch", async ({
  page,
}) => {
  await login(page, "seller1@hezalli.com", "hezalli123");

  await page.goto("/en/seller/analytics", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/seller/analytics");
  await expect(
    page.getByRole("heading", { name: "Analytics" }).first(),
  ).toBeVisible();

  // KPI cards (static labels — present regardless of whether there are sales).
  await expect(page.getByText("Net earnings")).toBeVisible();
  await expect(page.getByText("Avg. order value")).toBeVisible();

  // The dependency-free daily-sales chart renders as a labelled image.
  await expect(
    page.getByRole("img", { name: "Daily sales for the selected period" }),
  ).toBeVisible();

  // Switching the period updates the window (30d → 7d).
  await expect(page.getByText(/over the last 30 days/)).toBeVisible();
  await page.getByRole("link", { name: "7d" }).click();
  await page.waitForURL(/days=7/);
  await expect(page.getByText(/over the last 7 days/)).toBeVisible();
});

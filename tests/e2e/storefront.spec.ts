import { test, expect } from "@playwright/test";

// Golden path: browse the storefront → open a product → legal pages resolve.
test("home renders storefront chrome (footer legal links)", async ({
  page,
}) => {
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href*="/p/terms"]').first()).toBeVisible();
});

test("buyer can open a product detail page from the storefront", async ({
  page,
}) => {
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  const productLink = page.locator('a[href*="/product/"]').first();
  await expect(productLink).toBeVisible();
  await productLink.click();
  await page.waitForURL(/\/product\//, { timeout: 20_000 });
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /cart|أضف|سلة/i }).first(),
  ).toBeVisible();
});

test("search returns a results page", async ({ page }) => {
  await page.goto("/en/search?q=a", { waitUntil: "domcontentloaded" });
  const res = await page.goto("/en/search?q=a", {
    waitUntil: "domcontentloaded",
  });
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator("h1, h2").first()).toBeVisible();
});

test("legal CMS pages render", async ({ page }) => {
  for (const slug of ["terms", "privacy", "returns"]) {
    const res = await page.goto(`/en/p/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});

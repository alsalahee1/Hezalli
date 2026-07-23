import { test, expect } from "@playwright/test";

import { login } from "./helpers";

// The money path, end to end in a real browser: a seeded buyer adds a product
// to the cart, checks out with Cash on Delivery, and lands on the success
// page. Guards the single most important flow in the product — a regression
// anywhere in PDP → cart → checkout → placeOrder fails this test.
test("buyer can place a COD order end to end", async ({ page }) => {
  await login(page, "buyer2@example.com", "hezalli123");

  // Open the first product from the storefront.
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  const productLink = page.locator('a[href*="/product/"]').first();
  await expect(productLink).toBeVisible();
  await productLink.click();
  await page.waitForURL(/\/product\//, { timeout: 20_000 });

  // Add to cart (the picker preselects an in-stock variant).
  await page
    .getByRole("button", { name: /add to cart/i })
    .first()
    .click();

  // Cart → checkout.
  await page.goto("/en/cart", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("link", { name: /^checkout$/i })
    .first()
    .click();
  await page.waitForURL(/\/checkout/, { timeout: 20_000 });

  // COD is the default payment method; the seeded buyer has a default
  // address preselected. Place the order.
  await page.getByRole("button", { name: /place order/i }).click();
  await page.waitForURL(/\/checkout\/success/, { timeout: 30_000 });
  await expect(page.getByText(/order placed/i).first()).toBeVisible();

  // The order shows up in the buyer's order list.
  await page.goto("/en/account/orders", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator('a[href*="/account/orders/"]').first(),
  ).toBeVisible();
});

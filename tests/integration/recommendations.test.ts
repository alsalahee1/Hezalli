import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { coPurchasedProductIds } from "@/lib/recommendations";
import { makeFixture } from "./factory";

const uniq = () =>
  `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

describe("coPurchasedProductIds", () => {
  it("returns products bought in the same order (both directions)", async () => {
    const fx = await makeFixture({ price: 50 });
    try {
      // A second product B in the same store.
      const productB = await prisma.product.create({
        data: {
          storeId: fx.storeId,
          categoryId: fx.categoryId,
          title: { en: "Product B", ar: "منتج ب" },
          slug: `prodb-${uniq()}`,
          basePrice: 30,
          status: "ACTIVE",
          variants: {
            create: {
              sku: `skub-${uniq()}`,
              name: "Default",
              price: 30,
              stock: 100,
            },
          },
        },
        include: { variants: true },
      });
      const variantB = productB.variants[0];

      // One order that contains BOTH product A (the fixture) and product B.
      await prisma.order.create({
        data: {
          buyer: { connect: { id: fx.buyerId } },
          address: { connect: { id: fx.addressId } },
          status: "COMPLETED",
          paymentMethod: "COD",
          itemsTotal: 80,
          shippingTotal: 0,
          grandTotal: 80,
          displayCurrency: "USD",
          exchangeRate: 1,
          displayTotal: 80,
          subOrders: {
            create: [
              {
                store: { connect: { id: fx.storeId } },
                status: "COMPLETED",
                itemsTotal: 80,
                shippingTotal: 0,
                commissionRate: 0.1,
                commissionAmt: 0,
                sellerNet: 0,
                items: {
                  create: [
                    {
                      variantId: fx.variantId,
                      titleSnapshot: "A",
                      skuSnapshot: fx.variantSku,
                      unitPrice: 50,
                      quantity: 1,
                      lineTotal: 50,
                    },
                    {
                      variantId: variantB.id,
                      titleSnapshot: "B",
                      skuSnapshot: variantB.sku,
                      unitPrice: 30,
                      quantity: 1,
                      lineTotal: 30,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      expect(await coPurchasedProductIds(fx.productId, 8)).toContain(
        productB.id,
      );
      expect(await coPurchasedProductIds(productB.id, 8)).toContain(
        fx.productId,
      );
    } finally {
      // fx.cleanup() deletes all orders for the buyer and all products for the
      // store (including product B), so no extra teardown is needed.
      await fx.cleanup();
    }
  });

  it("returns nothing for a product never co-purchased", async () => {
    const fx = await makeFixture();
    try {
      expect(await coPurchasedProductIds(fx.productId, 8)).toHaveLength(0);
    } finally {
      await fx.cleanup();
    }
  });
});

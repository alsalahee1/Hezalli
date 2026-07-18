import { describe, expect, it } from "vitest";

import { notifyWishlistWatchers } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

async function wishlist(userId: string, productId: string) {
  await prisma.wishlist.create({
    data: { userId, items: { create: { productId } } },
  });
}

describe("notifyWishlistWatchers", () => {
  it("notifies wishlist watchers on restock with a clickable link", async () => {
    const fx = await makeFixture();
    try {
      await wishlist(fx.buyerId, fx.productId);
      const p = await prisma.product.findUniqueOrThrow({
        where: { id: fx.productId },
        select: { slug: true },
      });

      const n = await notifyWishlistWatchers(fx.productId, "restock");
      expect(n).toBe(1);

      const notif = await prisma.notification.findFirst({
        where: { userId: fx.buyerId, type: "PROMO" },
      });
      expect(notif).not.toBeNull();
      expect((notif!.data as { link?: string }).link).toBe(
        `/product/${p.slug}`,
      );
      expect((notif!.data as { productId?: string }).productId).toBe(
        fx.productId,
      );
    } finally {
      await fx.cleanup();
    }
  });

  it("notifies watchers on a price drop", async () => {
    const fx = await makeFixture();
    try {
      await wishlist(fx.buyerId, fx.productId);
      const n = await notifyWishlistWatchers(fx.productId, "priceDrop");
      expect(n).toBe(1);
      expect(
        await prisma.notification.count({
          where: { userId: fx.buyerId, type: "PROMO" },
        }),
      ).toBe(1);
    } finally {
      await fx.cleanup();
    }
  });

  it("does nothing when the product has no watchers", async () => {
    const fx = await makeFixture();
    try {
      expect(await notifyWishlistWatchers(fx.productId, "restock")).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });

  it("does not alert for a hidden product", async () => {
    const fx = await makeFixture();
    try {
      await wishlist(fx.buyerId, fx.productId);
      await prisma.product.update({
        where: { id: fx.productId },
        data: { status: "HIDDEN" },
      });
      expect(await notifyWishlistWatchers(fx.productId, "restock")).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });
});

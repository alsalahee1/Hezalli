// Step 17.8 — abandoned-cart reminders over real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { remindAbandonedCarts } from "@/lib/marketing";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let cartId: string;

beforeAll(async () => {
  fx = await makeFixture();
  const cart = await prisma.cart.create({
    data: {
      userId: fx.buyerId,
      items: {
        create: {
          variantId: fx.variantId,
          storeId: fx.storeId,
          quantity: 2,
        },
      },
    },
  });
  cartId = cart.id;
});

afterAll(async () => {
  await prisma.cart.delete({ where: { id: cartId } }).catch(() => {});
  await fx.cleanup();
});

async function setCart(updatedAt: Date, reminded: Date | null) {
  await prisma.$executeRaw`
    UPDATE "Cart" SET "updatedAt" = ${updatedAt}, "remindedAt" = ${reminded}
    WHERE id = ${cartId}`;
}

const DAY = 86_400_000;

describe("remindAbandonedCarts", () => {
  it("reminds an abandoned cart exactly once", async () => {
    await setCart(new Date(Date.now() - 2 * DAY), null);

    await remindAbandonedCarts({ olderThanHours: 1, withinDays: 30 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.remindedAt).not.toBeNull();
    const firstReminder = cart.remindedAt;

    const notifs = await prisma.notification.count({
      where: { userId: fx.buyerId, type: "PROMO" },
    });
    expect(notifs).toBe(1);

    // Second pass must not re-remind this cart.
    await remindAbandonedCarts({ olderThanHours: 1, withinDays: 30 });
    const again = await prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
    });
    expect(again.remindedAt?.getTime()).toBe(firstReminder?.getTime());
    expect(
      await prisma.notification.count({
        where: { userId: fx.buyerId, type: "PROMO" },
      }),
    ).toBe(1);
  });

  it("skips carts touched too recently", async () => {
    await setCart(new Date(), null); // updated just now
    await remindAbandonedCarts({ olderThanHours: 4, withinDays: 30 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.remindedAt).toBeNull();
  });

  it("skips carts older than the window floor", async () => {
    await setCart(new Date(Date.now() - 40 * DAY), null); // 40 days > 7d floor
    await remindAbandonedCarts({ olderThanHours: 1, withinDays: 7 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.remindedAt).toBeNull();
  });
});

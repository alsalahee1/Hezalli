// Flash stock claimed at checkout is released when the order dies before
// fulfilment (buyer cancel, seller cancel, unpaid expiry) — otherwise a live
// sale shows sold-out while the units are back in real stock. The claim is
// recorded on OrderItem.flashItemId and reversed with a conditional decrement
// (never below zero). Boundaries mocked: auth(), revalidatePath, getLocale.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import { cancelOrder } from "@/lib/actions/order";
import { cancelSubOrder } from "@/lib/actions/seller-order";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let flashItemId: string;
let flashSaleId: string;

const soldCount = async () =>
  (
    await prisma.flashSaleItem.findUniqueOrThrow({
      where: { id: flashItemId },
      select: { soldCount: true },
    })
  ).soldCount;

// A CONFIRMED sub-order whose single item carries the flash claim.
async function makeFlashOrder() {
  const made = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "CONFIRMED",
  });
  await prisma.orderItem.updateMany({
    where: { subOrderId: made.subOrderId },
    data: { flashItemId },
  });
  return made;
}

beforeAll(async () => {
  fx = await makeFixture({ price: 100 });
  const sale = await prisma.flashSale.create({
    data: {
      name: { en: "Test Flash", ar: "عرض" },
      startsAt: new Date(Date.now() - 3600_000),
      endsAt: new Date(Date.now() + 3600_000),
      isActive: true,
      items: {
        create: {
          variantId: fx.variantId,
          salePrice: 80,
          stockLimit: 5,
          soldCount: 3,
        },
      },
    },
    include: { items: true },
  });
  flashSaleId = sale.id;
  flashItemId = sale.items[0].id;
});

afterAll(async () => {
  await fx.cleanup();
  await prisma.flashSale
    .delete({ where: { id: flashSaleId } })
    .catch(() => {});
});

describe("flash claims are released when the claim dies", () => {
  it("buyer cancel decrements soldCount", async () => {
    const { orderId } = await makeFlashOrder();
    as(fx.buyerId);
    expect(await cancelOrder(orderId)).toEqual({ ok: true });
    expect(await soldCount()).toBe(2);
  });

  it("seller cancel decrements soldCount", async () => {
    const { subOrderId } = await makeFlashOrder();
    as(fx.sellerUserId);
    expect(await cancelSubOrder(subOrderId, "out of stock")).toEqual({
      ok: true,
    });
    expect(await soldCount()).toBe(1);
  });

  it("never decrements below zero", async () => {
    const { orderId } = await makeFlashOrder();
    await prisma.flashSaleItem.update({
      where: { id: flashItemId },
      data: { soldCount: 0 },
    });
    as(fx.buyerId);
    expect(await cancelOrder(orderId)).toEqual({ ok: true });
    expect(await soldCount()).toBe(0);
  });
});

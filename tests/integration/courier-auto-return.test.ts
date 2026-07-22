// Auto-return: a direct parcel that exhausts max_delivery_attempts is returned
// to the seller (order cancelled/refunded) instead of staying retriable.
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

import { courierAdvance, courierFailDelivery } from "@/lib/actions/courier";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let courierId: string;
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const courier = await prisma.user.create({
    data: {
      email: `crr-${Date.now().toString(36)}@t.local`,
      roles: ["COURIER"],
      locale: "en",
    },
  });
  courierId = courier.id;
  extraUserIds.push(courier.id);
  // Deterministic threshold for the test.
  await prisma.platformSetting.upsert({
    where: { key: "max_delivery_attempts" },
    create: { key: "max_delivery_attempts", value: "2" },
    update: { value: "2" },
  });
});

afterAll(async () => {
  // Restore default behavior for any later test file.
  await prisma.platformSetting
    .delete({ where: { key: "max_delivery_attempts" } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

async function directParcel() {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "SHIPPED",
  });
  const shipment = await prisma.shipment.create({
    data: {
      subOrderId,
      status: "OUT_FOR_DELIVERY",
      platformManaged: true,
      driverId: courierId,
      shippedAt: new Date(),
    },
    select: { id: true },
  });
  return { subOrderId, shipmentId: shipment.id };
}

describe("courierFailDelivery auto-return at max attempts", () => {
  it("stays retriable below the limit, then returns to seller at the limit", async () => {
    const { subOrderId, shipmentId } = await directParcel();
    as(courierId);

    // Attempt 1 of 2 → still FAILED-and-retriable.
    expect(await courierFailDelivery(shipmentId, "unreachable")).toEqual({
      ok: true,
    });
    let ship = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: { status: true, attemptCount: true },
    });
    expect(ship.status).toBe("FAILED");
    expect(ship.attemptCount).toBe(1);
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: subOrderId },
          select: { status: true },
        })
      ).status,
    ).toBe("SHIPPED");

    // The driver re-attempts: they take the parcel back out (the "Retry
    // delivery" action) before a second doorstep attempt can be logged.
    expect(await courierAdvance(shipmentId, "OUT_FOR_DELIVERY")).toEqual({
      ok: true,
    });
    // Attempt 2 of 2 → returned to seller.
    expect(await courierFailDelivery(shipmentId, "unreachable")).toEqual({
      ok: true,
    });
    ship = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: { status: true, attemptCount: true },
    });
    expect(ship.status).toBe("RETURNED");
    expect(ship.attemptCount).toBe(2);

    // COD was never captured → the order is cancelled (nothing to refund).
    const sub = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub.status).toBe("CANCELLED");

    // The seller was told a parcel is coming back.
    const sellerNote = await prisma.notification.findFirst({
      where: { type: "SHIPMENT", title: { contains: "returned" } },
      orderBy: { createdAt: "desc" },
    });
    expect(sellerNote).toBeTruthy();
  });
});

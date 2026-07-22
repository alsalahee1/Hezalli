// Exercises the courier dispatch + delivery actions against local Postgres.
// Only request-context boundaries are mocked: auth() (to impersonate
// admin/courier), revalidatePath, and getLocale.
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

import { assignCourier, courierAdvance } from "@/lib/actions/courier";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let adminId: string;
let courierId: string;
let courier2Id: string;
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const admin = await prisma.user.create({
    data: { email: `admin-${uniq}@t.local`, roles: ["ADMIN"], locale: "en" },
  });
  const courier = await prisma.user.create({
    data: { email: `c1-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const courier2 = await prisma.user.create({
    data: { email: `c2-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  adminId = admin.id;
  courierId = courier.id;
  courier2Id = courier2.id;
  extraUserIds.push(admin.id, courier.id, courier2.id);
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

// A shipped, COD sub-order with a platform-managed shipment ready to dispatch.
async function makeShippedParcel() {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "SHIPPED",
  });
  const shipment = await prisma.shipment.create({
    data: {
      subOrderId,
      status: "IN_TRANSIT",
      platformManaged: true,
      shippedAt: new Date(),
    },
    select: { id: true },
  });
  return { subOrderId, shipmentId: shipment.id };
}

describe("courier dispatch & delivery", () => {
  it("assigns a courier, then the courier delivers (COD collected)", async () => {
    const { subOrderId, shipmentId } = await makeShippedParcel();

    // Ops assigns the parcel to the courier.
    as(adminId);
    expect(await assignCourier(shipmentId, courierId)).toEqual({ ok: true });
    expect(
      (await prisma.shipment.findUnique({ where: { id: shipmentId } }))
        ?.driverId,
    ).toBe(courierId);

    // Courier marks it out for delivery (status + event).
    as(courierId);
    expect(await courierAdvance(shipmentId, "OUT_FOR_DELIVERY")).toEqual({
      ok: true,
    });
    const mid = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { status: true, events: { select: { status: true } } },
    });
    expect(mid?.status).toBe("OUT_FOR_DELIVERY");
    expect(mid?.events.some((e) => e.status === "OUT_FOR_DELIVERY")).toBe(true);

    // Courier delivers → sub-order DELIVERED, COD cash captured.
    expect(
      await courierAdvance(shipmentId, "DELIVERED", { recipientName: "Ali" }),
    ).toEqual({ ok: true });
    const sub = await prisma.subOrder.findUnique({
      where: { id: subOrderId },
      select: {
        status: true,
        autoCompleteAt: true,
        shipment: { select: { status: true, deliveredAt: true } },
        order: { select: { payment: { select: { status: true } } } },
      },
    });
    expect(sub?.status).toBe("DELIVERED");
    expect(sub?.shipment?.status).toBe("DELIVERED");
    expect(sub?.shipment?.deliveredAt).toBeTruthy();
    expect(sub?.autoCompleteAt).toBeTruthy();
    expect(sub?.order.payment?.status).toBe("CONFIRMED"); // COD collected
  });

  it("won't let a different courier touch a parcel that isn't theirs", async () => {
    const { subOrderId, shipmentId } = await makeShippedParcel();
    as(adminId);
    await assignCourier(shipmentId, courierId);

    as(courier2Id);
    expect(await courierAdvance(shipmentId, "DELIVERED")).toEqual({
      error: "notFound",
    });
    expect(
      (await prisma.subOrder.findUnique({ where: { id: subOrderId } }))?.status,
    ).toBe("SHIPPED");
  });

  it("rejects assignment to a non-courier user", async () => {
    const { shipmentId } = await makeShippedParcel();
    as(adminId);
    expect(await assignCourier(shipmentId, fx.buyerId)).toEqual({
      error: "invalidDriver",
    });
  });

  it("blocks a non-admin from assigning", async () => {
    const { shipmentId } = await makeShippedParcel();
    as(courierId);
    expect(await assignCourier(shipmentId, courierId)).toEqual({
      error: "forbidden",
    });
  });
});

// Exercises failed-delivery + proof-of-delivery against local Postgres.
// Boundaries mocked: auth() (impersonation), revalidatePath, getLocale.
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
let courier2Id: string;
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const courier = await prisma.user.create({
    data: { email: `crr-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const courier2 = await prisma.user.create({
    data: { email: `crr2-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  courierId = courier.id;
  courier2Id = courier2.id;
  extraUserIds.push(courier.id, courier2.id);
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

// A shipped parcel already assigned to our courier (COD by default).
async function makeAssignedParcel(
  paymentMethod: "COD" | "HEZALLI_BALANCE" = "COD",
) {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod,
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

describe("courierFailDelivery", () => {
  it("logs a failed attempt but keeps the parcel in play, then allows retry", async () => {
    const { subOrderId, shipmentId } = await makeAssignedParcel();

    as(courierId);
    expect(
      await courierFailDelivery(shipmentId, "unreachable", "No answer"),
    ).toEqual({ ok: true });

    const ship = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        status: true,
        attemptCount: true,
        attempts: true,
        events: { select: { status: true, note: true } },
      },
    });
    expect(ship?.status).toBe("FAILED");
    expect(ship?.attemptCount).toBe(1);
    expect(ship?.attempts).toHaveLength(1);
    expect(ship?.attempts[0]).toMatchObject({
      outcome: "FAILED",
      reason: "unreachable",
      note: "No answer",
      courierId,
    });
    // Public timeline shows the FAILED status; note is the free text only.
    expect(ship?.events.some((e) => e.status === "FAILED")).toBe(true);

    // Sub-order stays SHIPPED so it can be re-attempted / reassigned.
    const sub = await prisma.subOrder.findUnique({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub?.status).toBe("SHIPPED");

    // Buyer was notified of the failed attempt.
    const note = await prisma.notification.findFirst({
      where: { userId: fx.buyerId, type: "SHIPMENT" },
      orderBy: { createdAt: "desc" },
    });
    expect(note?.title).toMatch(/unsuccessful/i);

    // Retry: driver marks out-for-delivery again.
    expect(await courierAdvance(shipmentId, "OUT_FOR_DELIVERY")).toEqual({
      ok: true,
    });
    expect(
      (await prisma.shipment.findUnique({ where: { id: shipmentId } }))?.status,
    ).toBe("OUT_FOR_DELIVERY");
  });

  it("rejects an unknown reason", async () => {
    const { shipmentId } = await makeAssignedParcel();
    as(courierId);
    expect(await courierFailDelivery(shipmentId, "aliens")).toEqual({
      error: "badReason",
    });
  });

  it("refuses a courier who isn't the assignee", async () => {
    const { shipmentId } = await makeAssignedParcel();
    as(courier2Id); // a courier, but not the one this parcel is assigned to
    expect(await courierFailDelivery(shipmentId, "refused")).toEqual({
      error: "notFound",
    });
  });
});

describe("proof of delivery", () => {
  it("records recipient + photo on the DELIVERED attempt and event note", async () => {
    const { subOrderId, shipmentId } = await makeAssignedParcel();

    as(courierId);
    expect(
      await courierAdvance(shipmentId, "DELIVERED", {
        recipientName: "  Mona Saleh ",
        photoKey: "proof/x/abc.jpg",
      }),
    ).toEqual({ ok: true });

    const ship = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        status: true,
        attemptCount: true,
        attempts: { where: { outcome: "DELIVERED" } },
        events: { where: { status: "DELIVERED" }, select: { note: true } },
      },
    });
    expect(ship?.status).toBe("DELIVERED");
    expect(ship?.attemptCount).toBe(1);
    expect(ship?.attempts[0]).toMatchObject({
      outcome: "DELIVERED",
      recipientName: "Mona Saleh", // trimmed
      proofPhotoKey: "proof/x/abc.jpg",
      courierId,
    });
    expect(ship?.events[0]?.note).toBe("Received by Mona Saleh");

    // COD still captured through the shared core.
    const sub = await prisma.subOrder.findUnique({
      where: { id: subOrderId },
      select: {
        status: true,
        order: { select: { payment: { select: { status: true } } } },
      },
    });
    expect(sub?.status).toBe("DELIVERED");
    expect(sub?.order.payment?.status).toBe("CONFIRMED");
  });

  it("a PREPAID parcel delivers fine with no proof", async () => {
    const { shipmentId } = await makeAssignedParcel("HEZALLI_BALANCE");
    as(courierId);
    expect(await courierAdvance(shipmentId, "DELIVERED")).toEqual({ ok: true });
    const ship = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { attempts: { select: { recipientName: true } } },
    });
    expect(ship?.attempts[0]?.recipientName).toBeNull();
  });

  it("a COD parcel requires at least one proof element", async () => {
    const { shipmentId } = await makeAssignedParcel("COD");
    as(courierId);
    // No code, no photo, no recipient → refused for a cash drop.
    expect(await courierAdvance(shipmentId, "DELIVERED")).toEqual({
      error: "proofRequired",
    });
    // A recipient name alone satisfies it.
    expect(
      await courierAdvance(shipmentId, "DELIVERED", { recipientName: "Ali" }),
    ).toEqual({ ok: true });
  });
});

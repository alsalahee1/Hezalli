// End-to-end custody chain for Hezalli Delivery Points against local Postgres:
// ship-via-point → receive → handover → deliver (fees, code proof), and the
// failure loop (fail → return → reschedule → re-handover → RTS).
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
import {
  pointHandoverParcel,
  pointReceiveParcel,
  pointReceiveReturn,
  pointReturnToSeller,
} from "@/lib/actions/point";
import { requestRedelivery } from "@/lib/actions/redelivery";
import { shipSubOrder } from "@/lib/actions/shipment";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let pointOwnerId: string;
let pointId: string;
let courierId: string;
let carrierId: string;
const extraUserIds: string[] = [];
const settingKeys = ["express_auto_assign", "max_delivery_attempts"];
let trackingSeq = 0;

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);

  const owner = await prisma.user.create({
    data: {
      email: `pt-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: "Test Point",
      phone: "770000002",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Test street 1",
    },
  });
  const courier = await prisma.user.create({
    data: { email: `pt-crr-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express T-${uniq}`, platformManaged: true },
  });
  pointOwnerId = owner.id;
  pointId = point.id;
  courierId = courier.id;
  carrierId = carrier.id;
  extraUserIds.push(owner.id, courier.id);

  // Deterministic handover: no auto-assignment on receive.
  await prisma.platformSetting.upsert({
    where: { key: "express_auto_assign" },
    create: { key: "express_auto_assign", value: false },
    update: { value: false },
  });
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({ where: { key: { in: settingKeys } } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
  // Point (and its ledger) cascade with the owner.
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

// Seller ships a PROCESSING sub-order through the point; returns the parcel.
async function shipViaPoint() {
  const { subOrderId, orderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "PROCESSING",
  });
  const trackingNumber =
    `PT${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  const res = await shipSubOrder(subOrderId, {
    carrierId,
    trackingNumber,
    deliveryPointId: pointId,
  });
  expect(res).toEqual({ ok: true });
  const shipment = await prisma.shipment.findUnique({
    where: { subOrderId },
    select: { id: true, status: true, deliveryCode: true, driverId: true },
  });
  return { subOrderId, orderId, trackingNumber, shipment: shipment! };
}

describe("ship via point", () => {
  it("starts LABEL_CREATED with a delivery code and no driver", async () => {
    const { shipment } = await shipViaPoint();
    expect(shipment.status).toBe("LABEL_CREATED");
    expect(shipment.driverId).toBeNull();
    expect(shipment.deliveryCode).toMatch(/^[0-9A-F]{10}$/);
  });

  it("refuses a point on a non-platform carrier", async () => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    const thirdParty = await prisma.carrier.create({
      data: { name: `3P-${Date.now().toString(36)}`, platformManaged: false },
    });
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(subOrderId, {
        carrierId: thirdParty.id,
        trackingNumber: "X123456",
        deliveryPointId: pointId,
      }),
    ).toEqual({ error: "pointNotAllowed" });
    await prisma.carrier.delete({ where: { id: thirdParty.id } });
  });
});

describe("happy path: receive → handover → deliver", () => {
  it("walks the full custody chain and pays everyone", async () => {
    const { subOrderId, trackingNumber, shipment } = await shipViaPoint();

    // Only the point's operator may receive it.
    as(courierId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({
      error: "forbidden",
    });

    as(pointOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
    expect(
      (await prisma.shipment.findUnique({ where: { id: shipment.id } }))
        ?.status,
    ).toBe("AT_POINT");
    // Receiving twice is a no-op error, not a duplicate event.
    expect(await pointReceiveParcel(trackingNumber)).toEqual({
      error: "badState",
    });

    // Handover needs a driver while unassigned.
    expect(await pointHandoverParcel(trackingNumber)).toEqual({
      error: "driverRequired",
    });
    expect(await pointHandoverParcel(trackingNumber, courierId)).toEqual({
      ok: true,
    });
    const afterHandover = await prisma.shipment.findUnique({
      where: { id: shipment.id },
      select: { status: true, driverId: true, events: true },
    });
    expect(afterHandover?.status).toBe("OUT_FOR_DELIVERY");
    expect(afterHandover?.driverId).toBe(courierId);
    expect(afterHandover?.events.some((e) => e.status === "PICKED_UP")).toBe(
      true,
    );

    // Wrong delivery code is a hard error; the right one is verified proof.
    as(courierId);
    expect(
      await courierAdvance(shipment.id, "DELIVERED", { deliveryCode: "NOPE" }),
    ).toEqual({ error: "badCode" });
    expect(
      await courierAdvance(shipment.id, "DELIVERED", {
        deliveryCode: shipment.deliveryCode!,
        recipientName: "The Buyer",
      }),
    ).toEqual({ ok: true });

    const done = await prisma.shipment.findUnique({
      where: { id: shipment.id },
      select: { status: true, attempts: true },
    });
    expect(done?.status).toBe("DELIVERED");
    expect(done?.attempts[0]).toMatchObject({
      outcome: "DELIVERED",
      codeVerified: true,
    });

    // The point earned its handling fee inside the delivery transaction.
    const fee = await prisma.deliveryPointLedgerEntry.findFirst({
      where: { pointId, subOrderId, type: "HANDLING_FEE" },
    });
    expect(Number(fee?.amountUsd)).toBeCloseTo(0.5);
    // The courier ledger got its usual COD + earning rows too.
    const courierRows = await prisma.courierLedgerEntry.findMany({
      where: { courierId, subOrderId },
      select: { type: true },
    });
    expect(courierRows.map((r) => r.type).sort()).toEqual([
      "COD_COLLECTED",
      "EARNING",
    ]);
  });

  it("blocks driver-side moves while the point still holds the parcel", async () => {
    const { trackingNumber, shipment } = await shipViaPoint();
    as(pointOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
    // Assign the driver directly (dispatch-style) without a handover scan.
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { driverId: courierId },
    });
    as(courierId);
    expect(await courierAdvance(shipment.id, "OUT_FOR_DELIVERY")).toEqual({
      error: "badState",
    });
    expect(await courierFailDelivery(shipment.id, "unreachable")).toEqual({
      error: "badState",
    });
  });
});

describe("failure loop: fail → return → reschedule → re-handover → RTS", () => {
  it("cycles the parcel through the point and ends with return-to-seller", async () => {
    await prisma.platformSetting.upsert({
      where: { key: "max_delivery_attempts" },
      create: { key: "max_delivery_attempts", value: 2 },
      update: { value: 2 },
    });

    const { subOrderId, trackingNumber, shipment } = await shipViaPoint();
    as(pointOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
    expect(await pointHandoverParcel(trackingNumber, courierId)).toEqual({
      ok: true,
    });

    // Attempt 1 fails at the doorstep; RTS is not possible yet.
    as(courierId);
    expect(
      await courierFailDelivery(shipment.id, "unreachable", "no answer"),
    ).toEqual({ ok: true });
    as(pointOwnerId);
    expect(await pointReturnToSeller(trackingNumber)).toEqual({
      error: "badState",
    });
    expect(await pointReceiveReturn(trackingNumber)).toEqual({ ok: true });
    expect(
      (await prisma.shipment.findUnique({ where: { id: shipment.id } }))
        ?.status,
    ).toBe("RETURNED_TO_POINT");

    // Buyer books a new day.
    const day = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    as(fx.buyerId);
    expect(await requestRedelivery(subOrderId, day, "after 4pm")).toEqual({
      ok: true,
    });
    const rebooked = await prisma.shipment.findUnique({
      where: { id: shipment.id },
      select: { redeliverAt: true, redeliverNote: true },
    });
    expect(rebooked?.redeliverAt?.toISOString().slice(0, 10)).toBe(day);
    expect(rebooked?.redeliverNote).toBe("after 4pm");
    // Point operator was told about the reschedule.
    expect(
      await prisma.notification.findFirst({
        where: { userId: pointOwnerId, title: { contains: "Redelivery" } },
      }),
    ).toBeTruthy();

    // Re-handover (driver already assigned — no driverId needed), attempt 2
    // fails, parcel returns, and now attempts are exhausted → RTS.
    as(pointOwnerId);
    expect(await pointHandoverParcel(trackingNumber)).toEqual({ ok: true });
    as(courierId);
    expect(await courierFailDelivery(shipment.id, "refused")).toEqual({
      ok: true,
    });
    as(pointOwnerId);
    expect(await pointReceiveReturn(trackingNumber)).toEqual({ ok: true });
    expect(await pointReturnToSeller(trackingNumber, "2 strikes")).toEqual({
      ok: true,
    });

    const final = await prisma.shipment.findUnique({
      where: { id: shipment.id },
      select: { status: true, attemptCount: true },
    });
    expect(final?.status).toBe("RETURNED");
    expect(final?.attemptCount).toBe(2);

    // Seller was told to collect the parcel.
    expect(
      await prisma.notification.findFirst({
        where: { userId: fx.sellerUserId, title: { contains: "returned" } },
      }),
    ).toBeTruthy();

    // Redelivery can't be requested on a terminal parcel.
    as(fx.buyerId);
    expect(await requestRedelivery(subOrderId, day)).toEqual({
      error: "badState",
    });
  });
});

// Origin transfer fee (docs/DELIVERY-POINTS.md §16): a delivered two-hop
// parcel credits BOTH hubs — destination handling fee + origin transfer fee —
// in the shared delivery transaction. Single-hop credits only the destination.
// Boundaries mocked: auth(), revalidatePath, getLocale.
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

import { courierAdvance } from "@/lib/actions/courier";
import { pointHandoverParcel, pointReceiveParcel } from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let originOwnerId: string;
let destOwnerId: string;
let originPointId: string;
let destPointId: string;
let courierId: string;
let carrierId: string;
let trackingSeq = 0;
const userIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const mkUser = (tag: string, roles: string[]) =>
    prisma.user.create({
      data: {
        email: `tf-${tag}-${uniq}@t.local`,
        roles: roles as never,
        locale: "en",
      },
    });
  const o1 = await mkUser("o1", ["DELIVERY_POINT"]);
  const o2 = await mkUser("o2", ["DELIVERY_POINT"]);
  const crr = await mkUser("crr", ["COURIER"]);
  const origin = await prisma.deliveryPoint.create({
    data: {
      ownerId: o1.id,
      name: "TF Origin",
      phone: "770000010",
      governorate: "Sanaa",
      city: "Sanaa",
      addressLine: "A st",
    },
  });
  const dest = await prisma.deliveryPoint.create({
    data: {
      ownerId: o2.id,
      name: "TF Dest",
      phone: "770000011",
      governorate: "Aden",
      city: "Aden",
      addressLine: "B st",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express F-${uniq}`, platformManaged: true },
  });
  originOwnerId = o1.id;
  destOwnerId = o2.id;
  originPointId = origin.id;
  destPointId = dest.id;
  courierId = crr.id;
  carrierId = carrier.id;
  userIds.push(o1.id, o2.id, crr.id);
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

// Ship, walk the hops, and deliver. Returns the sub-order id.
async function deliverParcel(withOrigin: boolean) {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "PROCESSING",
  });
  const trackingNumber =
    `TF${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  expect(
    await shipSubOrder(subOrderId, {
      carrierId,
      trackingNumber,
      deliveryPointId: destPointId,
      ...(withOrigin ? { originPointId } : {}),
    }),
  ).toEqual({ ok: true });

  if (withOrigin) {
    as(originOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
    expect(await pointHandoverParcel(trackingNumber, courierId)).toEqual({
      ok: true,
    });
  }
  as(destOwnerId);
  expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
  // Auto-assign may have claimed the parcel (setting races with other
  // suites) — hand it to whichever driver holds it, else our courier.
  const pre = await prisma.shipment.findUnique({
    where: { subOrderId },
    select: { id: true, driverId: true },
  });
  const driver = pre?.driverId ?? courierId;
  expect(await pointHandoverParcel(trackingNumber, driver)).toEqual({
    ok: true,
  });
  as(driver);
  expect(await courierAdvance(pre!.id, "DELIVERED")).toEqual({ ok: true });
  return subOrderId;
}

describe("origin transfer fee", () => {
  it("pays both hubs on a delivered two-hop parcel", async () => {
    const subOrderId = await deliverParcel(true);
    const fees = await prisma.deliveryPointLedgerEntry.findMany({
      where: { subOrderId, type: "HANDLING_FEE" },
      select: { pointId: true, amountUsd: true },
    });
    const byPoint = new Map(fees.map((f) => [f.pointId, Number(f.amountUsd)]));
    expect(byPoint.get(destPointId)).toBeCloseTo(0.5); // point_handling_fee
    expect(byPoint.get(originPointId)).toBeCloseTo(0.25); // point_transfer_fee
    expect(fees).toHaveLength(2);
  });

  it("pays only the destination on a single-hop parcel", async () => {
    const subOrderId = await deliverParcel(false);
    const fees = await prisma.deliveryPointLedgerEntry.findMany({
      where: { subOrderId, type: "HANDLING_FEE" },
      select: { pointId: true },
    });
    expect(fees).toHaveLength(1);
    expect(fees[0].pointId).toBe(destPointId);
  });
});

// Point capacity & smart selection (docs/DELIVERY-POINTS.md §8) against local
// Postgres: load counting, full-point filtering + ordering, routing rejection,
// and the forced-pickup exemption.
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

import { placeOrder } from "@/lib/actions/order";
import { shipSubOrder } from "@/lib/actions/shipment";
import { checkPointRoutable, listRoutablePoints } from "@/lib/point-select";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let ownerId: string;
let tinyPointId: string; // capacity 1, in the fixture's governorate (Aden)
let bigPointId: string; // unlimited, other governorate
let carrierId: string;
let trackingSeq = 0;

const tick = () =>
  `PC${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);

  const owner = await prisma.user.create({
    data: {
      email: `cap-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  ownerId = owner.id;
  // Two points under one owner isn't allowed (unique ownerId) — second owner.
  const owner2 = await prisma.user.create({
    data: {
      email: `cap-own2-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const tiny = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `A Tiny ${uniq}`,
      phone: "770000004",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Small shop",
      capacity: 1,
    },
  });
  const big = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner2.id,
      name: `Z Big ${uniq}`,
      phone: "770000005",
      governorate: "Sanaa",
      city: "Sanaa",
      addressLine: "Big shop",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express C-${uniq}`, platformManaged: true },
  });
  tinyPointId = tiny.id;
  bigPointId = big.id;
  carrierId = carrier.id;
});

afterAll(async () => {
  await fx.cleanup();
  await prisma.deliveryPoint
    .deleteMany({ where: { id: { in: [tinyPointId, bigPointId] } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { email: { contains: "cap-own" } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

// Route one parcel to a point via the seller ship flow (occupies capacity
// from LABEL_CREATED on).
async function routeParcelTo(pointId: string) {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "PROCESSING",
  });
  as(fx.sellerUserId);
  const res = await shipSubOrder(subOrderId, {
    carrierId,
    trackingNumber: tick(),
    deliveryPointId: pointId,
  });
  expect(res).toEqual({ ok: true });
  return subOrderId;
}

describe("listRoutablePoints", () => {
  it("orders destination-governorate matches first and hides full points", async () => {
    const before = await listRoutablePoints("Aden");
    const tinyIdx = before.findIndex((p) => p.id === tinyPointId);
    const bigIdx = before.findIndex((p) => p.id === bigPointId);
    expect(tinyIdx).toBeGreaterThanOrEqual(0);
    expect(bigIdx).toBeGreaterThanOrEqual(0);
    // Aden point leads for an Aden destination despite its "A…" vs "Z…" name
    // being irrelevant — governorate wins.
    expect(tinyIdx).toBeLessThan(bigIdx);

    // Fill the tiny point (capacity 1) — it disappears from the picker.
    await routeParcelTo(tinyPointId);
    const after = await listRoutablePoints("Aden");
    expect(after.some((p) => p.id === tinyPointId)).toBe(false);
    expect(after.some((p) => p.id === bigPointId)).toBe(true);

    expect(await checkPointRoutable(tinyPointId)).toBe("full");
    expect(await checkPointRoutable(bigPointId)).toBe("ok");
    expect(await checkPointRoutable("nope")).toBe("unavailable");
  });
});

describe("routing gates", () => {
  it("rejects new seller routing and pickup checkout to a full point", async () => {
    // tiny is full from the previous test (state ordered within this file).
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(subOrderId, {
        carrierId,
        trackingNumber: tick(),
        deliveryPointId: tinyPointId,
      }),
    ).toEqual({ error: "pointFull" });

    as(fx.buyerId);
    expect(
      await placeOrder({
        addressId: fx.addressId,
        items: [{ variantId: fx.variantId, quantity: 1 }],
        paymentMethod: "COD",
        shippingMethods: { [fx.storeId]: "PICKUP" },
        pickupPointId: tinyPointId,
      }),
    ).toEqual({ error: "pointFull" });
  });

  it("still honors a committed pickup destination that filled up meanwhile", async () => {
    // A pickup order already recorded against the (now-full) tiny point:
    // the seller can still ship it — capacity gates NEW routing only.
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { shippingMethod: "PICKUP", pickupPointId: tinyPointId },
    });
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(subOrderId, { carrierId, trackingNumber: tick() }),
    ).toEqual({ ok: true });
    const shipment = await prisma.shipment.findUnique({
      where: { subOrderId },
      select: { deliveryPointId: true },
    });
    expect(shipment?.deliveryPointId).toBe(tinyPointId);
  });

  it("unlimited points keep accepting routing", async () => {
    await routeParcelTo(bigPointId);
    await routeParcelTo(bigPointId);
    expect(await checkPointRoutable(bigPointId)).toBe("ok");
  });
});

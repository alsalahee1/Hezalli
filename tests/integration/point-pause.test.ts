// Hub vacation mode (docs/DELIVERY-POINTS.md §42c): a paused point stops
// receiving NEW routing and drops off the public directory, while the
// counter keeps working — committed pickups still ship to it and its
// receive scan still accepts announced parcels. Runs against local Postgres.
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

import { pointReceiveParcel, setPointPaused } from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import { publicPointsByGovernorate } from "@/lib/point-public";
import { checkPointRoutable, listRoutablePoints } from "@/lib/point-select";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let ownerId: string;
let pointId: string;
let carrierId: string;
let uniqGov: string;

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  uniqGov = `PauseHub-${uniq}`;
  const owner = await prisma.user.create({
    data: {
      email: `pp-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Pause Point ${uniq}`,
      phone: "770000013",
      governorate: uniqGov,
      city: "Aden",
      addressLine: "Pause st",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express P-${uniq}`, platformManaged: true },
  });
  ownerId = owner.id;
  pointId = point.id;
  carrierId = carrier.id;
});

afterAll(async () => {
  await prisma.auditLog
    .deleteMany({ where: { actorId: ownerId } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: ownerId } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

const pausedAt = () =>
  prisma.deliveryPoint
    .findUniqueOrThrow({ where: { id: pointId }, select: { pausedAt: true } })
    .then((p) => p.pausedAt);

const inDirectory = async () =>
  (await publicPointsByGovernorate()).some((g) =>
    g.points.some((p) => p.id === pointId),
  );

describe("hub vacation mode", () => {
  it("pauses routing + directory, keeps the counter working, resumes", async () => {
    // Open: routable and public.
    expect((await listRoutablePoints()).some((p) => p.id === pointId)).toBe(
      true,
    );
    expect(await checkPointRoutable(pointId)).toBe("ok");
    expect(await inDirectory()).toBe(true);

    // Pause (self-service, audited).
    as(ownerId);
    expect(await setPointPaused(true)).toEqual({ ok: true });
    expect(await pausedAt()).toBeTruthy();
    expect(
      await prisma.auditLog.count({
        where: { actorId: ownerId, action: "point.pause" },
      }),
    ).toBeGreaterThanOrEqual(1);

    // No new routing, hidden from the public directory.
    expect((await listRoutablePoints()).some((p) => p.id === pointId)).toBe(
      false,
    );
    expect(await checkPointRoutable(pointId)).toBe("unavailable");
    expect(await inDirectory()).toBe(false);

    // A pickup order committed to this hub still ships to it (same
    // exemption as capacity), and the counter still accepts the parcel.
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { shippingMethod: "PICKUP", pickupPointId: pointId },
    });
    const trackingNumber = `PP${Date.now().toString(36)}`.toUpperCase();
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(subOrderId, { carrierId, trackingNumber }),
    ).toEqual({ ok: true });
    as(ownerId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });

    // Resume: routable and public again.
    expect(await setPointPaused(false)).toEqual({ ok: true });
    expect(await pausedAt()).toBeNull();
    expect(await checkPointRoutable(pointId)).toBe("ok");
    expect(await inDirectory()).toBe(true);

    // Only the operator may toggle.
    as(fx.buyerId);
    expect(await setPointPaused(true)).toEqual({ error: "forbidden" });
  });
});

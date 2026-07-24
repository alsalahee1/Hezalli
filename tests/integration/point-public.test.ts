// Public network views (docs/DELIVERY-POINTS.md §24): the /points directory
// and the track page's pickup-hub lookup. Other suites create points in the
// shared database, so assertions target our own hubs, not exact totals.
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

import { pointReceiveParcel } from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import {
  pickupHubForShipment,
  publicPointsByGovernorate,
} from "@/lib/point-public";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let ownerId: string;
let suspendedOwnerId: string;
let pointId: string;
let carrierId: string;
let uniq: string;

beforeAll(async () => {
  fx = await makeFixture();
  uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: {
      email: `pb-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const sOwner = await prisma.user.create({
    data: {
      email: `pb-sus-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Public Point ${uniq}`,
      phone: "770000015",
      governorate: "Taiz",
      city: "Taiz",
      addressLine: "Public st",
    },
  });
  await prisma.deliveryPoint.create({
    data: {
      ownerId: sOwner.id,
      name: `Hidden Point ${uniq}`,
      phone: "770000016",
      governorate: "Taiz",
      city: "Taiz",
      addressLine: "Hidden st",
      status: "SUSPENDED",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express P-${uniq}`, platformManaged: true },
  });
  ownerId = owner.id;
  suspendedOwnerId = sOwner.id;
  pointId = point.id;
  carrierId = carrier.id;
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: ownerId } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user
    .deleteMany({ where: { id: { in: [ownerId, suspendedOwnerId] } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

describe("publicPointsByGovernorate", () => {
  it("lists ACTIVE hubs grouped by governorate; suspended hubs hidden", async () => {
    const groups = await publicPointsByGovernorate();
    const taiz = groups.find((g) => g.governorate === "Taiz");
    expect(taiz).toBeDefined();
    const names = taiz!.points.map((p) => p.name);
    expect(names).toContain(`Public Point ${uniq}`);
    expect(names).not.toContain(`Hidden Point ${uniq}`);
    // Shopfront fields only.
    const mine = taiz!.points.find((p) => p.id === pointId)!;
    expect(mine).toEqual({
      id: pointId,
      name: `Public Point ${uniq}`,
      governorate: "Taiz",
      city: "Taiz",
      addressLine: "Public st",
      phone: "770000015",
      // No hours published on the fixture → no open/closed chip.
      openNow: null,
    });
  });
});

describe("pickupHubForShipment", () => {
  it("resolves the hub only while the parcel is held there", async () => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { shippingMethod: "PICKUP", pickupPointId: pointId },
    });
    const trackingNumber = `PB${uniq}A`;
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(subOrderId, { carrierId, trackingNumber }),
    ).toEqual({ ok: true });

    // Announced but not yet received → no card.
    let ship = await prisma.shipment.findUniqueOrThrow({
      where: { subOrderId },
      select: { status: true, atPointId: true },
    });
    expect(await pickupHubForShipment(ship)).toBeNull();

    // Received at the counter → the hub's shopfront info.
    as(ownerId);
    expect(await pointReceiveParcel(trackingNumber)).toMatchObject({
      ok: true,
    });
    ship = await prisma.shipment.findUniqueOrThrow({
      where: { subOrderId },
      select: { status: true, atPointId: true },
    });
    const hub = await pickupHubForShipment(ship);
    expect(hub?.name).toBe(`Public Point ${uniq}`);
    expect(hub?.phone).toBe("770000015");
  });
});

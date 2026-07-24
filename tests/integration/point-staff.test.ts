// Point staff (docs/DELIVERY-POINTS.md §42d): the owner attaches existing
// accounts to the hub as employees with job tiers — every tier works parcels,
// money and management stay scoped, and payouts never leave the owner. Runs
// against local Postgres.
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

import {
  pointDriverCashIn,
  pointReceiveParcel,
  setPointPaused,
} from "@/lib/actions/point";
import { requestPointPayout } from "@/lib/actions/point-payout";
import {
  addPointStaff,
  adminSetPointStaffActive,
  removePointStaff,
  setPointStaffActive,
  setPointStaffRole,
} from "@/lib/actions/point-staff";
import { shipSubOrder } from "@/lib/actions/shipment";
import { requireDeliveryPoint } from "@/lib/authz";
import { pointStaffActivity } from "@/lib/point-staff-activity";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let ownerId: string;
let pointId: string;
let carrierId: string;
let managerId: string;
let organizerId: string;
let otherOwnerId: string;
let adminId: string;
let userIds: string[];

const uniq = Date.now().toString(36);

beforeAll(async () => {
  fx = await makeFixture();
  const owner = await prisma.user.create({
    data: {
      email: `ps-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Staff Point ${uniq}`,
      phone: "770000014",
      governorate: `StaffHub-${uniq}`,
      city: "Aden",
      addressLine: "Staff st",
    },
  });
  const manager = await prisma.user.create({
    data: {
      email: `ps-mgr-${uniq}@t.local`,
      phone: `7791${uniq}`,
      locale: "en",
    },
  });
  const organizer = await prisma.user.create({
    data: { email: `ps-org-${uniq}@t.local`, locale: "en" },
  });
  // A second hub owner — may never be hired as staff.
  const otherOwner = await prisma.user.create({
    data: {
      email: `ps-own2-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  await prisma.deliveryPoint.create({
    data: {
      ownerId: otherOwner.id,
      name: `Other Point ${uniq}`,
      phone: "770000015",
      governorate: `StaffHub2-${uniq}`,
      city: "Aden",
      addressLine: "Other st",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express S-${uniq}`, platformManaged: true },
  });
  const admin = await prisma.user.create({
    data: {
      email: `ps-adm-${uniq}@t.local`,
      roles: ["DELIVERY_MANAGER"],
      locale: "en",
    },
  });
  ownerId = owner.id;
  pointId = point.id;
  carrierId = carrier.id;
  managerId = manager.id;
  organizerId = organizer.id;
  otherOwnerId = otherOwner.id;
  adminId = admin.id;
  userIds = [owner.id, manager.id, organizer.id, otherOwner.id, admin.id];
});

afterAll(async () => {
  await prisma.auditLog
    .deleteMany({ where: { actorId: { in: userIds } } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

describe("point staff", () => {
  it("hires, scopes each tier, pauses, and removes", async () => {
    // Owner hires a manager (by phone) and an organizer (by email).
    as(ownerId);
    expect(await addPointStaff(`7791${uniq}`, "MANAGER")).toEqual({
      ok: true,
    });
    expect(await addPointStaff(`ps-org-${uniq}@t.local`, "ORGANIZER")).toEqual({
      ok: true,
    });
    expect(
      await prisma.auditLog.count({
        where: { actorId: ownerId, action: "point.staffAdd" },
      }),
    ).toBe(2);
    expect(
      await prisma.notification.count({ where: { userId: managerId } }),
    ).toBe(1);

    // Guards: unknown account, double-hire, hub owners, and staff of
    // another hub are all refused.
    expect(await addPointStaff("000000000", "CASHIER")).toEqual({
      error: "userNotFound",
    });
    expect(await addPointStaff(`7791${uniq}`, "CASHIER")).toEqual({
      error: "alreadyStaff",
    });
    expect(await addPointStaff(`ps-own2-${uniq}@t.local`, "CASHIER")).toEqual({
      error: "ownsPoint",
    });
    as(otherOwnerId);
    expect(await addPointStaff(`7791${uniq}`, "CASHIER")).toEqual({
      error: "staffElsewhere",
    });

    // Membership is the grant: the manager resolves to this hub with their
    // tier, no DELIVERY_POINT role involved.
    as(managerId);
    expect(await requireDeliveryPoint()).toEqual({
      userId: managerId,
      pointId,
      access: "MANAGER",
    });

    // Tier scoping — manager: may run the shop (pause), may not move the
    // owner's earnings; may not touch their own row.
    expect(await setPointPaused(true)).toEqual({ ok: true });
    expect(await setPointPaused(false)).toEqual({ ok: true });
    expect(await requestPointPayout(5)).toEqual({ error: "forbidden" });
    const selfRow = await prisma.pointStaff.findUniqueOrThrow({
      where: { userId: managerId },
      select: { id: true },
    });
    expect(await setPointStaffRole(selfRow.id, "CASHIER")).toEqual({
      error: "isSelf",
    });

    // Tier scoping — organizer: parcels yes, money and management no.
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { shippingMethod: "PICKUP", pickupPointId: pointId },
    });
    const trackingNumber = `PS${Date.now().toString(36)}`.toUpperCase();
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(subOrderId, { carrierId, trackingNumber }),
    ).toEqual({ ok: true });
    as(organizerId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });

    // Accountability: the receive scan records WHICH person acted, and the
    // per-staff activity rollup attributes the parcel to the organizer.
    const ev = await prisma.shipmentEvent.findFirst({
      where: { shipment: { trackingNumber }, status: "AT_POINT" },
      select: { actorId: true },
    });
    expect(ev?.actorId).toBe(organizerId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const activity = await pointStaffActivity(pointId, startOfDay, new Date());
    expect(
      activity.find((r) => r.userId === organizerId)?.received,
    ).toBeGreaterThanOrEqual(1);

    expect(await pointDriverCashIn("any-driver", 5)).toEqual({
      error: "forbidden",
    });
    expect(await setPointPaused(true)).toEqual({ error: "forbidden" });
    expect(await addPointStaff("777777777", "CASHIER")).toEqual({
      error: "forbidden",
    });

    // Manager (not just the owner) can re-scope others' jobs.
    const orgRow = await prisma.pointStaff.findUniqueOrThrow({
      where: { userId: organizerId },
      select: { id: true },
    });
    as(managerId);
    expect(await setPointStaffRole(orgRow.id, "CASHIER")).toEqual({
      ok: true,
    });

    // Pausing a member revokes access without losing the row.
    as(ownerId);
    expect(await setPointStaffActive(orgRow.id, false)).toEqual({ ok: true });
    as(organizerId);
    expect(await requireDeliveryPoint()).toBeNull();
    as(ownerId);
    expect(await setPointStaffActive(orgRow.id, true)).toEqual({ ok: true });
    as(organizerId);
    expect(await requireDeliveryPoint()).not.toBeNull();

    // Removal deletes the membership; the user account survives.
    as(ownerId);
    expect(await removePointStaff(orgRow.id)).toEqual({ ok: true });
    expect(
      await prisma.pointStaff.findUnique({ where: { userId: organizerId } }),
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: organizerId } }),
    ).not.toBeNull();

    // The employee is notified as their standing changes: hire, role change,
    // pause, reinstate, removal — at least the four management events above.
    expect(
      await prisma.notification.count({
        where: { userId: organizerId, type: "SHIPMENT" },
      }),
    ).toBeGreaterThanOrEqual(4);

    // A stranger can't manage anyone's roster.
    as(fx.buyerId);
    expect(await removePointStaff(selfRow.id)).toEqual({ error: "forbidden" });

    // Ops (delivery-manager) can freeze a member's access without the owner —
    // and a non-ops user cannot. selfRow is the manager's membership row.
    expect(await adminSetPointStaffActive(pointId, selfRow.id, false)).toEqual({
      error: "forbidden",
    });
    as(adminId);
    expect(await adminSetPointStaffActive(pointId, selfRow.id, false)).toEqual({
      ok: true,
    });
    as(managerId);
    expect(await requireDeliveryPoint()).toBeNull();
    as(adminId);
    expect(await adminSetPointStaffActive(pointId, selfRow.id, true)).toEqual({
      ok: true,
    });
    as(managerId);
    expect(await requireDeliveryPoint()).not.toBeNull();
  });
});

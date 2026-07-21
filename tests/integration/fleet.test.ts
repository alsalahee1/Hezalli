// Fleet-partner rollups + admin management actions. Local Postgres.
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

import { requireFleetOwner } from "@/lib/authz";
import {
  assignCourierToFleet,
  createFleet,
  removeCourierFromFleet,
  setFleetOwner,
} from "@/lib/actions/fleet";
import { fleetDetail, listFleetsWithStats } from "@/lib/fleet";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let adminId: string;
let driverA: string;
let driverB: string;
let fleetId: string;
const cleanupUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const stamp = Date.now().toString(36);
  const admin = await prisma.user.create({
    data: {
      email: `fadm-${stamp}@t.local`,
      roles: ["ADMIN"],
      name: "Fleet Admin",
    },
  });
  adminId = admin.id;
  const a = await prisma.user.create({
    data: {
      email: `fda-${stamp}@t.local`,
      roles: ["COURIER"],
      name: "Driver A",
    },
  });
  const b = await prisma.user.create({
    data: {
      email: `fdb-${stamp}@t.local`,
      roles: ["COURIER"],
      name: "Driver B",
    },
  });
  driverA = a.id;
  driverB = b.id;
  cleanupUserIds.push(admin.id, a.id, b.id);

  // Driver A: one delivered parcel + 50 COD on hand.
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "DELIVERED",
  });
  await prisma.shipment.create({
    data: {
      subOrderId,
      status: "DELIVERED",
      platformManaged: true,
      driverId: driverA,
      deliveredAt: new Date(),
    },
  });
  await prisma.courierLedgerEntry.create({
    data: { courierId: driverA, type: "COD_COLLECTED", amountUsd: 50 },
  });
});

afterAll(async () => {
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId: { in: [driverA, driverB] } } })
    .catch(() => {});
  if (fleetId) {
    await prisma.user
      .updateMany({ where: { fleetId }, data: { fleetId: null } })
      .catch(() => {});
    await prisma.fleet.delete({ where: { id: fleetId } }).catch(() => {});
  }
  await prisma.user
    .deleteMany({ where: { id: { in: cleanupUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

describe("createFleet + membership", () => {
  it("rejects a non-admin", async () => {
    as(fx.buyerId);
    const res = await createFleet({ name: "Nope" });
    expect(res.error).toBe("forbidden");
  });

  it("creates a fleet and assigns couriers", async () => {
    as(adminId);
    const created = await createFleet({
      name: "Swift Riders",
      contactPhone: "+100",
    });
    expect(created.fleetId).toBeTruthy();
    fleetId = created.fleetId!;

    expect(
      (await assignCourierToFleet({ fleetId, courierId: driverA })).ok,
    ).toBe(true);
    expect(
      (await assignCourierToFleet({ fleetId, courierId: driverB })).ok,
    ).toBe(true);

    // A non-courier can't be assigned.
    const bad = await assignCourierToFleet({ fleetId, courierId: fx.buyerId });
    expect(bad.error).toBe("notCourier");
  });
});

describe("fleetDetail rollup", () => {
  it("rolls up drivers, deliveries, and cash on hand", async () => {
    const detail = await fleetDetail(fleetId);
    expect(detail).not.toBeNull();
    expect(detail!.totals.drivers).toBe(2);
    expect(detail!.totals.delivered).toBeGreaterThanOrEqual(1);
    expect(detail!.totals.cashOnHand).toBe(50);
    const a = detail!.drivers.find((d) => d.courierId === driverA);
    expect(a?.cashOnHand).toBe(50);
    expect(a?.delivered).toBeGreaterThanOrEqual(1);
  });

  it("appears in the fleet list with stats", async () => {
    const rows = await listFleetsWithStats();
    const mine = rows.find((r) => r.id === fleetId);
    expect(mine).toBeTruthy();
    expect(mine!.totals.drivers).toBe(2);
    expect(mine!.totals.cashOnHand).toBe(50);
  });
});

describe("owner assignment + fleet portal gate", () => {
  it("only a member can be made owner, and ownership grants the portal", async () => {
    as(adminId);
    // A non-member cannot be owner.
    const notMember = await setFleetOwner({ fleetId, courierId: fx.buyerId });
    expect(notMember.error).toBe("notMember");

    // Make driver A the owner.
    expect((await setFleetOwner({ fleetId, courierId: driverA })).ok).toBe(
      true,
    );

    // Driver A now passes the fleet-owner gate.
    as(driverA);
    const gate = await requireFleetOwner();
    expect(gate?.fleetId).toBe(fleetId);

    // A different driver does not.
    as(driverB);
    expect(await requireFleetOwner()).toBeNull();
  });

  it("removing the owner from the fleet clears ownership", async () => {
    as(adminId);
    expect((await removeCourierFromFleet({ courierId: driverA })).ok).toBe(
      true,
    );
    const fleet = await prisma.fleet.findUnique({
      where: { id: fleetId },
      select: { ownerId: true },
    });
    expect(fleet?.ownerId).toBeNull();
    // And the ex-owner no longer passes the gate.
    as(driverA);
    expect(await requireFleetOwner()).toBeNull();
  });
});

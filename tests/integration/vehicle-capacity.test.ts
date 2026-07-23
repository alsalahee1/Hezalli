// Ops tuning vehicle capacity (setVehicleCapacity): delivery-manager-gated,
// validated, audited, stored as a PlatformSetting override that the assigner
// reads live — and resettable to the shipped defaults. Local Postgres.
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

import { setVehicleCapacity } from "@/lib/actions/courier";
import { autoAssignShipment } from "@/lib/courier-assign";
import {
  effectiveVehicleCapacity,
  VEHICLE_CAPACITY,
  VEHICLE_CAPACITY_SETTING_KEY,
} from "@/lib/courier-capacity";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let managerId: string;
let buyerRoleId: string;
let bikeCourier: string;
const userIds: string[] = [];
const settingKeys = [
  VEHICLE_CAPACITY_SETTING_KEY,
  "dispatch_hours_start",
  "dispatch_hours_end",
];

beforeAll(async () => {
  fx = await makeFixture();
  for (const key of ["dispatch_hours_start", "dispatch_hours_end"]) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: 0 },
      update: { value: 0 },
    });
  }
  const uniq = Date.now().toString(36);
  // A governorate only this suite uses keeps batching out of the picture.
  await prisma.address.update({
    where: { id: fx.addressId },
    data: { governorate: `VCapGov-${uniq}` },
  });
  const manager = await prisma.user.create({
    data: {
      email: `vc-dm-${uniq}@t.local`,
      roles: ["DELIVERY_MANAGER"],
      locale: "en",
    },
  });
  const buyer = await prisma.user.create({
    data: { email: `vc-b-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  const bike = await prisma.user.create({
    data: {
      email: `vc-bike-${uniq}@t.local`,
      roles: ["COURIER"],
      locale: "en",
      courierVehicleType: "motorbike",
    },
  });
  // A car courier so a parcel too heavy for the tuned motorbike still has a
  // capable taker.
  const car = await prisma.user.create({
    data: {
      email: `vc-car-${uniq}@t.local`,
      roles: ["COURIER"],
      locale: "en",
      courierVehicleType: "car",
    },
  });
  managerId = manager.id;
  buyerRoleId = buyer.id;
  bikeCourier = bike.id;
  userIds.push(manager.id, buyer.id, bike.id, car.id);
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({ where: { key: { in: settingKeys } } })
    .catch(() => {});
  await prisma.auditLog
    .deleteMany({ where: { entityId: VEHICLE_CAPACITY_SETTING_KEY } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
  await fx.cleanup();
});

describe("setVehicleCapacity", () => {
  it("is forbidden for non-delivery-staff", async () => {
    as(buyerRoleId);
    const res = await setVehicleCapacity("motorbike", {
      maxWeightKg: 5,
      maxVolumeLiters: 50,
      maxParcels: 5,
      maxItemLongestSideCm: 50,
    });
    expect(res.error).toBe("forbidden");
  });

  it("rejects unknown vehicles and out-of-range values", async () => {
    as(managerId);
    expect(
      (
        await setVehicleCapacity("rocket", {
          maxWeightKg: 5,
          maxVolumeLiters: 50,
          maxParcels: 5,
          maxItemLongestSideCm: 50,
        })
      ).error,
    ).toBe("badVehicle");
    expect(
      (
        await setVehicleCapacity("motorbike", {
          maxWeightKg: -1,
          maxVolumeLiters: 50,
          maxParcels: 5,
          maxItemLongestSideCm: 50,
        })
      ).error,
    ).toBe("badCapacity");
  });

  it("stores an override the assigner reads live, audited", async () => {
    as(managerId);
    // Tighten the motorbike to 5 kg — well under the shipped 30 kg.
    const res = await setVehicleCapacity("motorbike", {
      maxWeightKg: 5,
      maxVolumeLiters: 150,
      maxParcels: 12,
      maxItemLongestSideCm: 60,
    });
    expect(res.ok).toBe(true);

    const table = await effectiveVehicleCapacity();
    expect(table.motorbike.maxWeightGrams).toBe(5_000);
    expect(table.van).toEqual(VEHICLE_CAPACITY.van); // untouched

    const audit = await prisma.auditLog.findFirst({
      where: { action: "vehicle.capacity", actorId: managerId },
    });
    expect(audit).toBeTruthy();

    // A 10 kg parcel fits the SHIPPED motorbike profile but not the tuned
    // one — the bike courier must be skipped now.
    await prisma.product.update({
      where: { id: fx.productId },
      data: { weightGrams: 10_000 },
    });
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const s = await prisma.shipment.create({
      data: {
        subOrderId,
        status: "IN_TRANSIT",
        platformManaged: true,
        shippedAt: new Date(),
      },
      select: { id: true },
    });
    const chosen = await autoAssignShipment(s.id);
    expect(chosen).toBeTruthy();
    expect(chosen).not.toBe(bikeCourier);
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { status: "COMPLETED" },
    });
  });

  it("reset returns the vehicle to the shipped defaults", async () => {
    as(managerId);
    const res = await setVehicleCapacity("motorbike", null);
    expect(res.ok).toBe(true);
    const table = await effectiveVehicleCapacity();
    expect(table.motorbike).toEqual(VEHICLE_CAPACITY.motorbike);
  });
});

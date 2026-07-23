// Driver vacation mode: a paused courier gets no automatic work — board
// pings, auto-assignment, and board claims all skip them — while manual
// resume restores everything. Runs against local Postgres.
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

import { courierClaimJob, setCourierPaused } from "@/lib/actions/courier";
import { dispatchShippedParcel } from "@/lib/job-board";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let driverA: string;
let driverB: string;
let uniqGov: string;
const extraUserIds: string[] = [];

const settingKeys = [
  "job_board_enabled",
  "job_board_window_minutes",
  "job_board_max_active_jobs",
  "dispatch_hours_start",
  "dispatch_hours_end",
  "express_auto_assign",
  "courier_assign_strategy",
];
const setSetting = (key: string, value: unknown) =>
  prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  uniqGov = `PauseGov-${uniq}`;
  // Parcels of this suite go to a governorate only driverA is stationed in,
  // so the "nearest" strategy must pick them whenever they're eligible.
  await prisma.address.update({
    where: { id: fx.addressId },
    data: { governorate: uniqGov },
  });
  const a = await prisma.user.create({
    data: { email: `cp-a-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const b = await prisma.user.create({
    data: { email: `cp-b-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  driverA = a.id;
  driverB = b.id;
  extraUserIds.push(a.id, b.id);
  await prisma.courierLocation.create({
    data: { userId: driverA, lat: 0, lng: 0, governorate: uniqGov },
  });

  await setSetting("job_board_window_minutes", 15);
  await setSetting("job_board_max_active_jobs", 0);
  await setSetting("dispatch_hours_start", 0); // 24/7
  await setSetting("dispatch_hours_end", 0);
  await setSetting("express_auto_assign", true);
  await setSetting("courier_assign_strategy", "nearest");
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({ where: { key: { in: settingKeys } } })
    .catch(() => {});
  await prisma.auditLog
    .deleteMany({ where: { actorId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.courierLocation
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

// A direct platform parcel exactly as the ship action creates it.
async function shippedParcel() {
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
  return s.id;
}

const pausedAt = (id: string) =>
  prisma.user
    .findUniqueOrThrow({ where: { id }, select: { courierPausedAt: true } })
    .then((u) => u.courierPausedAt);

const boardPings = (id: string) =>
  prisma.notification.count({
    where: { userId: id, title: { contains: "board" } },
  });

describe("driver vacation mode", () => {
  it("toggles self-service and is audited", async () => {
    as(driverA);
    expect(await setCourierPaused(true)).toEqual({ ok: true });
    expect(await pausedAt(driverA)).toBeTruthy();
    expect(
      await prisma.auditLog.count({
        where: { actorId: driverA, action: "courier.pause" },
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(await setCourierPaused(false)).toEqual({ ok: true });
    expect(await pausedAt(driverA)).toBeNull();
    // Not a courier → refused.
    as(fx.buyerId);
    expect(await setCourierPaused(true)).toEqual({ error: "forbidden" });
  });

  it("auto-assignment picks the local driver while active, skips them paused", async () => {
    await setSetting("job_board_enabled", false);

    // Active: driverA is the only courier in the parcel's governorate.
    const p1 = await shippedParcel();
    await dispatchShippedParcel(p1);
    const s1 = await prisma.shipment.findUniqueOrThrow({
      where: { id: p1 },
      select: { driverId: true },
    });
    expect(s1.driverId).toBe(driverA);

    // Paused: the same setup must land on anyone BUT driverA.
    as(driverA);
    await setCourierPaused(true);
    const p2 = await shippedParcel();
    await dispatchShippedParcel(p2);
    const s2 = await prisma.shipment.findUniqueOrThrow({
      where: { id: p2 },
      select: { driverId: true },
    });
    expect(s2.driverId).not.toBe(driverA);
    await setCourierPaused(false);
  });

  it("board pings skip paused drivers; claims are refused until resume", async () => {
    await setSetting("job_board_enabled", true);
    as(driverA);
    await setCourierPaused(true);

    const beforeA = await boardPings(driverA);
    const beforeB = await boardPings(driverB);
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    expect(await boardPings(driverA)).toBe(beforeA); // quiet while paused
    expect(await boardPings(driverB)).toBe(beforeB + 1);

    // Claiming from the board is new work too — refused while paused.
    expect(await courierClaimJob(p)).toEqual({ error: "paused" });

    await setCourierPaused(false);
    expect(await courierClaimJob(p)).toEqual({ ok: true });
    const s = await prisma.shipment.findUniqueOrThrow({
      where: { id: p },
      select: { driverId: true },
    });
    expect(s.driverId).toBe(driverA);
  });
});

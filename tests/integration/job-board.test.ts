// Open driver job board (docs/EXPRESS-DELIVERY.md §4b): boarding on ship,
// first-tap-wins claims with the COD and active-jobs gates, and the sweep's
// board-then-push escalation. Runs against local Postgres.
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

import { courierClaimJob } from "@/lib/actions/courier";
import { dispatchShippedParcel } from "@/lib/job-board";
import { sweepCourierOffers } from "@/lib/offer-sweep";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let driverA: string;
let driverB: string;
const extraUserIds: string[] = [];

// Settings this suite pins so it is deterministic at any wall-clock time.
const settingKeys = [
  "job_board_enabled",
  "job_board_window_minutes",
  "job_board_max_active_jobs",
  "courier_offer_timeout_minutes",
  "courier_offer_max_rounds",
  "dispatch_hours_start",
  "dispatch_hours_end",
  "express_auto_assign",
  "courier_assign_strategy",
  "driver_cash_limit",
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
  const a = await prisma.user.create({
    data: { email: `jb-a-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const b = await prisma.user.create({
    data: { email: `jb-b-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  driverA = a.id;
  driverB = b.id;
  extraUserIds.push(a.id, b.id);

  await setSetting("job_board_enabled", true);
  await setSetting("job_board_window_minutes", 15);
  await setSetting("job_board_max_active_jobs", 0);
  await setSetting("courier_offer_timeout_minutes", 30);
  await setSetting("courier_offer_max_rounds", 2);
  await setSetting("dispatch_hours_start", 0); // 24/7 unless a test overrides
  await setSetting("dispatch_hours_end", 0);
  await setSetting("express_auto_assign", true);
  await setSetting("courier_assign_strategy", "balanced");
  await setSetting("driver_cash_limit", 50);
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({ where: { key: { in: settingKeys } } })
    .catch(() => {});
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

// A direct (no point) platform parcel exactly as the ship action creates it.
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

const shipmentOf = (id: string) =>
  prisma.shipment.findUniqueOrThrow({
    where: { id },
    select: {
      driverId: true,
      boardedAt: true,
      assignmentEscalatedAt: true,
      status: true,
    },
  });

describe("open job board", () => {
  it("dispatch posts a parcel on the board instead of pushing an offer", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);

    const s = await shipmentOf(p);
    expect(s.boardedAt).toBeTruthy();
    expect(s.driverId).toBeNull();
    expect(await prisma.shipmentOffer.count({ where: { shipmentId: p } })).toBe(
      0,
    );
    // Every active courier heard about it (no locations shared → global fan-out).
    const pings = await prisma.notification.count({
      where: {
        userId: { in: [driverA, driverB] },
        title: { contains: "board" },
      },
    });
    expect(pings).toBeGreaterThanOrEqual(2);
  });

  it("board off → dispatch falls through to the classic push offer", async () => {
    await setSetting("job_board_enabled", false);
    const p = await shippedParcel();
    await dispatchShippedParcel(p);

    const s = await shipmentOf(p);
    expect(s.boardedAt).toBeNull();
    expect(s.driverId).toBeTruthy();
    expect(
      await prisma.shipmentOffer.count({
        where: { shipmentId: p, status: "OFFERED" },
      }),
    ).toBe(1);
    await setSetting("job_board_enabled", true);
  });

  it("a claim takes the job: driver set, ACCEPTED offer recorded", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);

    as(driverA);
    expect(await courierClaimJob(p)).toEqual({ ok: true });

    const s = await shipmentOf(p);
    expect(s.driverId).toBe(driverA);
    const offer = await prisma.shipmentOffer.findUnique({
      where: { shipmentId_driverId: { shipmentId: p, driverId: driverA } },
    });
    expect(offer?.status).toBe("ACCEPTED");
    expect(offer?.respondedAt).toBeTruthy();
  });

  it("first tap wins — the loser gets 'taken'", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);

    as(driverA);
    expect(await courierClaimJob(p)).toEqual({ ok: true });
    as(driverB);
    expect(await courierClaimJob(p)).toEqual({ error: "taken" });
    expect((await shipmentOf(p)).driverId).toBe(driverA);
  });

  it("claiming clears the dispatch-escalation flag, like a manual assign", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    await prisma.shipment.update({
      where: { id: p },
      data: { assignmentEscalatedAt: new Date() },
    });

    as(driverB);
    expect(await courierClaimJob(p)).toEqual({ ok: true });
    expect((await shipmentOf(p)).assignmentEscalatedAt).toBeNull();
  });

  it("a COD-blocked driver can't claim", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);

    // Put driver A over the cash limit (base 50, no deposits/trust).
    const entry = await prisma.courierLedgerEntry.create({
      data: {
        courierId: driverA,
        type: "COD_COLLECTED",
        amountUsd: 500,
        note: "test",
      },
    });
    as(driverA);
    expect(await courierClaimJob(p)).toEqual({ error: "codBlocked" });
    expect((await shipmentOf(p)).driverId).toBeNull();
    await prisma.courierLedgerEntry.delete({ where: { id: entry.id } });
  });

  it("a parcel too heavy for the driver's vehicle can't be claimed", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    // A 100 kg parcel vs. a bicycle (15 kg max) — same gate as auto-assign.
    const { subOrderId } = await prisma.shipment.findUniqueOrThrow({
      where: { id: p },
      select: { subOrderId: true },
    });
    await prisma.orderItem.updateMany({
      where: { subOrderId },
      data: { weightGramsSnapshot: 100_000 },
    });
    await prisma.user.update({
      where: { id: driverA },
      data: { courierVehicleType: "bicycle" },
    });

    as(driverA);
    expect(await courierClaimJob(p)).toEqual({ error: "noCapacity" });
    expect((await shipmentOf(p)).driverId).toBeNull();

    // A van takes it fine.
    await prisma.user.update({
      where: { id: driverA },
      data: { courierVehicleType: "van" },
    });
    expect(await courierClaimJob(p)).toEqual({ ok: true });
    await prisma.user.update({
      where: { id: driverA },
      data: { courierVehicleType: null },
    });
  });

  it("the active-jobs cap blocks hoarding", async () => {
    // A fresh driver — the cap counts ALL active jobs, including ones the
    // other suite drivers claimed in earlier tests.
    const c = await prisma.user.create({
      data: {
        email: `jb-c-${Date.now().toString(36)}@t.local`,
        roles: ["COURIER"],
        locale: "en",
      },
    });
    extraUserIds.push(c.id);
    await setSetting("job_board_max_active_jobs", 1);
    const first = await shippedParcel();
    const second = await shippedParcel();
    await dispatchShippedParcel(first);
    await dispatchShippedParcel(second);

    as(c.id);
    expect(await courierClaimJob(first)).toEqual({ ok: true });
    expect(await courierClaimJob(second)).toEqual({ error: "tooManyJobs" });
    await setSetting("job_board_max_active_jobs", 0);
  });

  it("unclaimed past the window, the sweep starts push-offers; inside it, board-only", async () => {
    const fresh = await shippedParcel();
    const stale = await shippedParcel();
    await dispatchShippedParcel(fresh);
    await dispatchShippedParcel(stale);
    await prisma.shipment.update({
      where: { id: stale },
      data: { boardedAt: new Date(Date.now() - 16 * 60_000) },
    });

    await sweepCourierOffers();

    // The stale parcel got a push offer; the fresh one is still board-only.
    expect((await shipmentOf(stale)).driverId).toBeTruthy();
    expect(
      await prisma.shipmentOffer.count({
        where: { shipmentId: stale, status: "OFFERED" },
      }),
    ).toBe(1);
    expect((await shipmentOf(fresh)).driverId).toBeNull();
    expect(
      await prisma.shipmentOffer.count({ where: { shipmentId: fresh } }),
    ).toBe(0);
  });

  it("pull-only mode (auto-assign off): the sweep never pushes a boarded parcel", async () => {
    await setSetting("express_auto_assign", false);
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    await prisma.shipment.update({
      where: { id: p },
      data: { boardedAt: new Date(Date.now() - 60 * 60_000) },
    });

    await sweepCourierOffers();
    const s = await shipmentOf(p);
    expect(s.driverId).toBeNull();
    expect(await prisma.shipmentOffer.count({ where: { shipmentId: p } })).toBe(
      0,
    );
    await setSetting("express_auto_assign", true);
  });

  it("night parcels queue; the first sweep after opening boards them", async () => {
    const { dispatchLocalHour } = await import("@/lib/dispatch-hours");
    const h = dispatchLocalHour();
    await setSetting("dispatch_hours_start", (h + 2) % 24);
    await setSetting("dispatch_hours_end", (h + 4) % 24);

    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    expect((await shipmentOf(p)).boardedAt).toBeNull();

    await setSetting("dispatch_hours_start", 0);
    await setSetting("dispatch_hours_end", 0);
    const res = await sweepCourierOffers();
    expect(res.boarded).toBeGreaterThanOrEqual(1);
    const s = await shipmentOf(p);
    expect(s.boardedAt).toBeTruthy();
    expect(s.driverId).toBeNull(); // boarded, not pushed — the window is fresh
  });
});

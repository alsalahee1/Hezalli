// Pickup deadline (docs/EXPRESS-DELIVERY.md §4a): an ACCEPTED job whose
// driver never scanned the parcel is taken back after
// `pickup_deadline_hours` and re-dispatched; a driver who scanned keeps the
// job; forced/manual assignments (no accepted-offer row) are exempt.
// Runs against local Postgres.
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

import { courierAdvance, courierClaimJob } from "@/lib/actions/courier";
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

const settingKeys = [
  "pickup_deadline_hours",
  "board_reminder_minutes",
  "job_board_enabled",
  "job_board_window_minutes",
  "job_board_max_active_jobs",
  "courier_offer_timeout_minutes",
  "courier_offer_max_rounds",
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
  const a = await prisma.user.create({
    data: { email: `pd-a-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const b = await prisma.user.create({
    data: { email: `pd-b-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  driverA = a.id;
  driverB = b.id;
  extraUserIds.push(a.id, b.id);

  await setSetting("pickup_deadline_hours", 4);
  await setSetting("board_reminder_minutes", 0);
  await setSetting("job_board_enabled", true);
  await setSetting("job_board_window_minutes", 15);
  await setSetting("job_board_max_active_jobs", 0);
  await setSetting("courier_offer_timeout_minutes", 30);
  await setSetting("courier_offer_max_rounds", 3);
  await setSetting("dispatch_hours_start", 0); // 24/7
  await setSetting("dispatch_hours_end", 0);
  await setSetting("express_auto_assign", true);
  await setSetting("courier_assign_strategy", "balanced");
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({ where: { key: { in: settingKeys } } })
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

// Claim a boarded parcel as `driverId`, then backdate the acceptance so the
// deadline (4h in this suite) has lapsed.
async function claimedAndOverdue(shipmentId: string, driverId: string) {
  as(driverId);
  expect(await courierClaimJob(shipmentId)).toEqual({ ok: true });
  await prisma.shipmentOffer.update({
    where: { shipmentId_driverId: { shipmentId, driverId } },
    data: { respondedAt: new Date(Date.now() - 5 * 3_600_000) },
  });
}

const shipmentOf = (id: string) =>
  prisma.shipment.findUniqueOrThrow({
    where: { id },
    select: { driverId: true, boardedAt: true, status: true },
  });
const offerOf = (shipmentId: string, driverId: string) =>
  prisma.shipmentOffer.findUnique({
    where: { shipmentId_driverId: { shipmentId, driverId } },
  });

describe("pickup deadline", () => {
  it("reclaims an accepted job never scanned, notifies, and re-dispatches", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    await claimedAndOverdue(p, driverA);

    const res = await sweepCourierOffers();
    expect(res.reclaimed).toBeGreaterThanOrEqual(1);

    // Taken back: EXPIRED with the machine-readable reason, driver notified.
    const offer = await offerOf(p, driverA);
    expect(offer?.status).toBe("EXPIRED");
    expect(offer?.reason).toBe("pickup_timeout");
    expect(
      await prisma.notification.count({
        where: { userId: driverA, title: { contains: "pickup deadline" } },
      }),
    ).toBeGreaterThanOrEqual(1);

    // Re-dispatched: the cascade moved it to the OTHER driver (the reclaimed
    // one is excluded by their expired row).
    const after = await shipmentOf(p);
    expect(after.driverId).toBeTruthy();
    expect(after.driverId).not.toBe(driverA);
    expect((await offerOf(p, after.driverId!))?.status).toBe("OFFERED");
  });

  it("a driver who scanned keeps the job past the deadline", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    await claimedAndOverdue(p, driverA);
    as(driverA);
    expect(await courierAdvance(p, "PICKED_UP")).toEqual({ ok: true });

    await sweepCourierOffers();
    const after = await shipmentOf(p);
    expect(after.driverId).toBe(driverA);
    expect((await offerOf(p, driverA))?.status).toBe("ACCEPTED");
  });

  it("deadline 0 turns the reclaim off", async () => {
    await setSetting("pickup_deadline_hours", 0);
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    await claimedAndOverdue(p, driverA);

    const res = await sweepCourierOffers();
    expect(res.reclaimed).toBe(0);
    expect((await shipmentOf(p)).driverId).toBe(driverA);
    await setSetting("pickup_deadline_hours", 4);
  });

  it("within the deadline the job is untouched", async () => {
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    as(driverB);
    expect(await courierClaimJob(p)).toEqual({ ok: true }); // fresh accept

    await sweepCourierOffers();
    expect((await shipmentOf(p)).driverId).toBe(driverB);
    expect((await offerOf(p, driverB))?.status).toBe("ACCEPTED");
  });

  it("pull-only mode: a reclaimed parcel goes back on the board, no push offer", async () => {
    await setSetting("express_auto_assign", false);
    const p = await shippedParcel();
    await dispatchShippedParcel(p);
    await claimedAndOverdue(p, driverA);

    const res = await sweepCourierOffers();
    expect(res.reclaimed).toBeGreaterThanOrEqual(1);
    const after = await shipmentOf(p);
    expect(after.driverId).toBeNull(); // unassigned again…
    expect(after.boardedAt).toBeTruthy(); // …and visible on the board
    expect(
      await prisma.shipmentOffer.count({
        where: { shipmentId: p, status: "OFFERED" },
      }),
    ).toBe(0); // no push offer in pull-only mode
    await setSetting("express_auto_assign", true);
  });

  it("a forced/manual assignment (no accepted offer) is exempt", async () => {
    const p = await shippedParcel();
    // Ops-style direct assignment: driver set, no offer row at all.
    await prisma.shipment.update({
      where: { id: p },
      data: { driverId: driverA },
    });

    const res = await sweepCourierOffers();
    expect((await shipmentOf(p)).driverId).toBe(driverA);
    expect(res).toBeTruthy();
  });
});

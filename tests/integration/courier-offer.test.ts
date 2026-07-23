// Driver job offers (docs/EXPRESS-DELIVERY.md §4a): offer → accept / decline /
// expire, cascade with decliner exclusion, dispatch-hours queueing, and the
// one-shot ops escalation. Runs against local Postgres.
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

import { courierAdvance, courierRespondOffer } from "@/lib/actions/courier";
import { autoAssignShipment } from "@/lib/courier-assign";
import { dispatchLocalHour } from "@/lib/dispatch-hours";
import { sweepCourierOffers } from "@/lib/offer-sweep";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let staffId: string;
const extraUserIds: string[] = [];

// Settings this suite pins so it is deterministic at any wall-clock time.
const settingKeys = [
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
    data: { email: `off-a-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const b = await prisma.user.create({
    data: { email: `off-b-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const staff = await prisma.user.create({
    data: {
      email: `off-dm-${uniq}@t.local`,
      roles: ["DELIVERY_MANAGER"],
      locale: "en",
    },
  });
  staffId = staff.id;
  extraUserIds.push(a.id, b.id, staff.id);

  await setSetting("courier_offer_timeout_minutes", 30);
  await setSetting("courier_offer_max_rounds", 2);
  await setSetting("dispatch_hours_start", 0); // 24/7 unless a test overrides
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

const offerOf = (shipmentId: string, driverId: string) =>
  prisma.shipmentOffer.findUnique({
    where: { shipmentId_driverId: { shipmentId, driverId } },
  });
const shipmentOf = (id: string) =>
  prisma.shipment.findUniqueOrThrow({
    where: { id },
    select: { driverId: true, assignmentEscalatedAt: true, status: true },
  });

describe("driver job offers", () => {
  it("auto-assignment OFFERS: claims the driver and opens an accept window", async () => {
    const p = await shippedParcel();
    const chosen = await autoAssignShipment(p);
    expect(chosen).toBeTruthy();

    expect((await shipmentOf(p)).driverId).toBe(chosen);
    const offer = await offerOf(p, chosen!);
    expect(offer?.status).toBe("OFFERED");
    expect(offer!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("accepting locks the job in", async () => {
    const p = await shippedParcel();
    const chosen = await autoAssignShipment(p);
    as(chosen);
    expect(await courierRespondOffer(p, "ACCEPT")).toEqual({ ok: true });

    const offer = await offerOf(p, chosen!);
    expect(offer?.status).toBe("ACCEPTED");
    expect(offer?.respondedAt).toBeTruthy();
    expect((await shipmentOf(p)).driverId).toBe(chosen);
  });

  it("declining needs a valid reason", async () => {
    const p = await shippedParcel();
    const chosen = await autoAssignShipment(p);
    as(chosen);
    expect(await courierRespondOffer(p, "DECLINE", "nope")).toEqual({
      error: "badReason",
    });
  });

  it("declining releases the parcel and cascades to another courier", async () => {
    const p = await shippedParcel();
    const first = await autoAssignShipment(p);
    as(first);
    expect(await courierRespondOffer(p, "DECLINE", "too_far")).toEqual({
      ok: true,
    });

    const declined = await offerOf(p, first!);
    expect(declined?.status).toBe("REJECTED");
    expect(declined?.reason).toBe("too_far");

    // The cascade re-offered it — to somebody else, never the decliner.
    const after = await shipmentOf(p);
    expect(after.driverId).toBeTruthy();
    expect(after.driverId).not.toBe(first);
    expect((await offerOf(p, after.driverId!))?.status).toBe("OFFERED");
  });

  it("a dry cascade escalates to delivery staff exactly once", async () => {
    const p = await shippedParcel();
    const first = await autoAssignShipment(p);
    as(first);
    await courierRespondOffer(p, "DECLINE", "off_duty");
    const second = (await shipmentOf(p)).driverId;
    expect(second).toBeTruthy();
    as(second!);
    // max_rounds = 2: this second decline exhausts the cascade.
    expect(await courierRespondOffer(p, "DECLINE", "off_duty")).toEqual({
      ok: true,
    });

    const after = await shipmentOf(p);
    expect(after.driverId).toBeNull();
    expect(after.assignmentEscalatedAt).toBeTruthy();
    const alert = await prisma.notification.findFirst({
      where: { userId: staffId, title: { contains: "manual dispatch" } },
    });
    expect(alert).toBeTruthy();
  });

  it("the sweep expires a lapsed offer and re-offers the parcel", async () => {
    const p = await shippedParcel();
    const first = await autoAssignShipment(p);
    await prisma.shipmentOffer.update({
      where: { shipmentId_driverId: { shipmentId: p, driverId: first! } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await sweepCourierOffers();
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect((await offerOf(p, first!))?.status).toBe("EXPIRED");

    const after = await shipmentOf(p);
    expect(after.driverId).toBeTruthy();
    expect(after.driverId).not.toBe(first);
  });

  it("a driver who already scanned never loses the job to expiry", async () => {
    const p = await shippedParcel();
    const first = await autoAssignShipment(p);
    as(first);
    // First scan = implicit accept, even with the offer window lapsed.
    expect(await courierAdvance(p, "PICKED_UP")).toEqual({ ok: true });
    // Force the offer back to a lapsed OFFERED state — simulates the race
    // where the scan lands while the sweep is mid-run.
    await prisma.shipmentOffer.update({
      where: { shipmentId_driverId: { shipmentId: p, driverId: first! } },
      data: { expiresAt: new Date(Date.now() - 60_000), status: "OFFERED" },
    });

    await sweepCourierOffers();
    const after = await shipmentOf(p);
    expect(after.driverId).toBe(first);
    expect((await offerOf(p, first!))?.status).toBe("ACCEPTED");
  });

  it("night orders queue and go out with the morning wave", async () => {
    // Close dispatch around "now", then try to assign: nothing may happen.
    const h = dispatchLocalHour();
    await setSetting("dispatch_hours_start", (h + 2) % 24);
    await setSetting("dispatch_hours_end", (h + 4) % 24);

    const p = await shippedParcel();
    expect(await autoAssignShipment(p)).toBeNull();
    expect((await shipmentOf(p)).driverId).toBeNull();
    // The sweep also refuses to act while dispatch is closed.
    expect(await sweepCourierOffers()).toEqual({
      expired: 0,
      reclaimed: 0,
      waved: 0,
      boarded: 0,
      reescalated: 0,
    });

    // Morning: the window opens and the wave offers the queued parcel out.
    await setSetting("dispatch_hours_start", 0);
    await setSetting("dispatch_hours_end", 0);
    const res = await sweepCourierOffers();
    expect(res.waved).toBeGreaterThanOrEqual(1);

    const after = await shipmentOf(p);
    expect(after.driverId).toBeTruthy();
    expect((await offerOf(p, after.driverId!))?.status).toBe("OFFERED");
  });

  it("re-alerts staff about escalated parcels nobody assigned", async () => {
    const p = await shippedParcel();
    const staleAt = new Date(Date.now() - 25 * 3_600_000);
    await prisma.shipment.update({
      where: { id: p },
      data: { assignmentEscalatedAt: staleAt },
    });

    const res = await sweepCourierOffers();
    expect(res.reescalated).toBeGreaterThanOrEqual(1);

    const after = await shipmentOf(p);
    expect(after.driverId).toBeNull(); // re-alerted, not silently re-offered
    expect(after.assignmentEscalatedAt!.getTime()).toBeGreaterThan(
      staleAt.getTime(),
    );
    const reminder = await prisma.notification.findFirst({
      where: { userId: staffId, title: { contains: "still have no courier" } },
    });
    expect(reminder).toBeTruthy();
  });

  it("offer window 0 = classic forced assignment, no consent step", async () => {
    await setSetting("courier_offer_timeout_minutes", 0);
    const p = await shippedParcel();
    const chosen = await autoAssignShipment(p);
    expect(chosen).toBeTruthy();
    expect((await shipmentOf(p)).driverId).toBe(chosen);
    expect(await prisma.shipmentOffer.count({ where: { shipmentId: p } })).toBe(
      0,
    );
    await setSetting("courier_offer_timeout_minutes", 30);
  });
});

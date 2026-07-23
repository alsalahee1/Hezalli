// Driver reliability (lib/courier-reliability.ts): acceptance stats from
// ShipmentOffer history, the ranking tie-break, and the auto-offer gate for
// chronic decliners. Runs against local Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { autoAssignShipment } from "@/lib/courier-assign";
import { courierAcceptanceStats } from "@/lib/courier-reliability";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let flakyId: string; // declines everything
let solidId: string; // clean record
const extraUserIds: string[] = [];

const settingKeys = [
  "dispatch_hours_start",
  "dispatch_hours_end",
  "courier_offer_timeout_minutes",
  "driver_min_acceptance_rate",
  "driver_acceptance_min_offers",
];
const setSetting = (key: string, value: unknown) =>
  prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });

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

// Record an answered offer for `driverId` without going through dispatch.
async function historyOffer(
  driverId: string,
  status: "ACCEPTED" | "REJECTED" | "EXPIRED",
) {
  const shipmentId = await shippedParcel();
  await prisma.shipmentOffer.create({
    data: {
      shipmentId,
      driverId,
      status,
      expiresAt: new Date(),
      respondedAt: status === "EXPIRED" ? null : new Date(),
    },
  });
  // Park the parcel so it never competes in load counts or sweeps.
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { driverId, status: "DELIVERED" },
  });
  await prisma.subOrder.updateMany({
    where: { shipment: { id: shipmentId } },
    data: { status: "DELIVERED" },
  });
}

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const flaky = await prisma.user.create({
    data: { email: `rel-f-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const solid = await prisma.user.create({
    data: { email: `rel-s-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  flakyId = flaky.id;
  solidId = solid.id;
  extraUserIds.push(flaky.id, solid.id);

  await setSetting("dispatch_hours_start", 0);
  await setSetting("dispatch_hours_end", 0);
  await setSetting("courier_offer_timeout_minutes", 30);
  await setSetting("driver_min_acceptance_rate", 0);
  await setSetting("driver_acceptance_min_offers", 3);

  // Flaky: 1 accept, 2 declines, 1 expiry → 25%. Solid: 2 accepts → 100%.
  await historyOffer(flakyId, "ACCEPTED");
  await historyOffer(flakyId, "REJECTED");
  await historyOffer(flakyId, "REJECTED");
  await historyOffer(flakyId, "EXPIRED");
  await historyOffer(solidId, "ACCEPTED");
  await historyOffer(solidId, "ACCEPTED");
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

describe("courier reliability", () => {
  it("computes acceptance stats from answered offers", async () => {
    const stats = await courierAcceptanceStats([flakyId, solidId]);
    expect(stats.get(flakyId)).toMatchObject({ responded: 4, accepted: 1 });
    expect(stats.get(flakyId)?.rate).toBeCloseTo(0.25);
    expect(stats.get(solidId)).toMatchObject({ responded: 2, accepted: 2 });
    expect(stats.get(solidId)?.rate).toBe(1);
  });

  it("breaks ranking ties toward the more reliable driver", async () => {
    // Equal load (0 active jobs each) — the 25% driver must lose the tie.
    const p = await shippedParcel();
    expect(await autoAssignShipment(p)).toBe(solidId);
    // Unassign so the next test starts level again.
    await prisma.shipment.update({
      where: { id: p },
      data: { driverId: null },
    });
    await prisma.shipmentOffer.deleteMany({ where: { shipmentId: p } });
  });

  it("gates chronic decliners out of auto-offers when configured", async () => {
    await setSetting("driver_min_acceptance_rate", 50);
    // Give solid an active job so, without the gate, flaky (load 0) would win
    // on load. The gate must exclude flaky and pick solid anyway.
    const busy = await shippedParcel();
    await prisma.shipment.update({
      where: { id: busy },
      data: { driverId: solidId },
    });

    const p = await shippedParcel();
    expect(await autoAssignShipment(p)).toBe(solidId);
    await setSetting("driver_min_acceptance_rate", 0);
  });

  it("leaves drivers under the sample floor alone", async () => {
    // Raise the floor above flaky's 4 answers: the gate may not touch them,
    // so pure load ranking applies again and flaky (load 0) wins.
    await setSetting("driver_min_acceptance_rate", 50);
    await setSetting("driver_acceptance_min_offers", 10);

    const p = await shippedParcel();
    expect(await autoAssignShipment(p)).toBe(flakyId);
    await setSetting("driver_min_acceptance_rate", 0);
    await setSetting("driver_acceptance_min_offers", 3);
  });
});

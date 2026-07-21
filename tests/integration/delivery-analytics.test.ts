// Fleet analytics aggregation over shipments / attempts / ledger. Local Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { courierLeaderboard, deliveryOverview } from "@/lib/delivery-analytics";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let courierId: string;
const extraUserIds: string[] = [];
const HOUR = 3_600_000;

beforeAll(async () => {
  fx = await makeFixture();
  const c = await prisma.user.create({
    data: {
      email: `crr-${Date.now().toString(36)}@t.local`,
      roles: ["COURIER"],
      name: "Test Driver",
      locale: "en",
    },
  });
  courierId = c.id;
  extraUserIds.push(c.id);

  // Two delivered EXPRESS parcels: one on-time (2h), one late (past the 2-day
  // express max — shipped 5 days ago, delivered now). Second took 2 attempts.
  const now = Date.now();
  const mk = async (
    shipHoursAgo: number,
    deliverHoursAgo: number,
    attempts: number,
  ) => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "DELIVERED",
    });
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { shippingMethod: "EXPRESS" },
    });
    await prisma.shipment.create({
      data: {
        subOrderId,
        status: "DELIVERED",
        platformManaged: true,
        driverId: courierId,
        attemptCount: attempts,
        shippedAt: new Date(now - shipHoursAgo * HOUR),
        deliveredAt: new Date(now - deliverHoursAgo * HOUR),
      },
    });
  };
  await mk(3, 1, 1); // shipped 3h ago, delivered 1h ago → 2h, on-time
  await mk(5 * 24, 0, 2); // shipped 5d ago, delivered now → 120h, LATE, 2 attempts

  // Courier is holding 100 in COD.
  await prisma.courierLedgerEntry.create({
    data: { courierId, type: "COD_COLLECTED", amountUsd: 100 },
  });
});

afterAll(async () => {
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

describe("deliveryOverview", () => {
  it("computes delivered count, on-time %, avg time, attempts, COD", async () => {
    const o = await deliveryOverview(); // all-time
    expect(o.delivered).toBeGreaterThanOrEqual(2);
    // avg of the two we made is (2 + 120)/2 = 61h — but other suites may add
    // rows; assert our two are reflected via the specific facts instead.
    expect(o.avgHours).not.toBeNull();
    expect(o.onTimePct).not.toBeNull();
    expect(o.failedAttempts).toBeGreaterThanOrEqual(1); // the 2-attempt parcel
    expect(o.codOutstanding).toBeGreaterThanOrEqual(100);
  });
});

describe("courierLeaderboard", () => {
  it("counts a courier's deliveries and cash on hand", async () => {
    const rows = await courierLeaderboard();
    const me = rows.find((r) => r.courierId === courierId);
    expect(me).toBeTruthy();
    expect(me!.name).toBe("Test Driver");
    expect(me!.deliveries).toBe(2);
    expect(me!.cashOnHand).toBe(100);
  });
});

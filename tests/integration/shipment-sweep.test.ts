// Stuck-shipment sweep re-alerts (lib/shipment-sweep.ts): stuckFlaggedAt is
// last-alerted-at — a parcel still stuck 48h after the first alert alerts
// again instead of going quiet. Runs against local Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { sweepStuckShipments } from "@/lib/shipment-sweep";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let staffId: string;
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const staff = await prisma.user.create({
    data: {
      email: `ss-dm-${Date.now().toString(36)}@t.local`,
      roles: ["DELIVERY_MANAGER"],
      locale: "en",
    },
  });
  staffId = staff.id;
  extraUserIds.push(staff.id);
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

// A parcel un-moved for `stuckDays`, last alerted `flaggedHoursAgo` ago (null =
// never). updatedAt is @updatedAt, so backdating needs raw SQL.
async function stuckParcel(stuckDays: number, flaggedHoursAgo: number | null) {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "SHIPPED",
  });
  const s = await prisma.shipment.create({
    data: { subOrderId, status: "IN_TRANSIT", platformManaged: true },
    select: { id: true },
  });
  await prisma.$executeRaw`
    UPDATE "Shipment"
    SET "updatedAt" = now() - make_interval(days => ${stuckDays}),
        "stuckFlaggedAt" = CASE
          WHEN ${flaggedHoursAgo}::int IS NULL THEN NULL
          ELSE now() - make_interval(hours => ${flaggedHoursAgo})
        END
    WHERE id = ${s.id}`;
  return s.id;
}

const flaggedAtOf = async (id: string) =>
  (
    await prisma.shipment.findUniqueOrThrow({
      where: { id },
      select: { stuckFlaggedAt: true },
    })
  ).stuckFlaggedAt;

describe("stuck-shipment re-alerts", () => {
  it("re-alerts a parcel still stuck 48h+ after the last alert", async () => {
    const firstTime = await stuckParcel(8, null); // never alerted
    const ignored = await stuckParcel(8, 72); // alerted 3 days ago, still stuck
    const recent = await stuckParcel(8, 2); // alerted 2h ago — too soon

    const res = await sweepStuckShipments();
    expect(res.flagged).toBeGreaterThanOrEqual(2);

    const cutoff = Date.now() - 3_600_000;
    expect((await flaggedAtOf(firstTime))!.getTime()).toBeGreaterThan(cutoff);
    expect((await flaggedAtOf(ignored))!.getTime()).toBeGreaterThan(cutoff);
    // The recently-alerted parcel keeps its old stamp — no spam.
    expect((await flaggedAtOf(recent))!.getTime()).toBeLessThan(cutoff);

    const alert = await prisma.notification.findFirst({
      where: { userId: staffId, title: { contains: "stuck" } },
    });
    expect(alert).toBeTruthy();
  });
});

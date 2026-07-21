// Read-only analytics for the Hezalli Express fleet. Everything is derived from
// existing rows (shipments, delivery attempts, ratings, the courier ledger) —
// no new tables. Used by the admin delivery-performance dashboard.
import { courierRatingsByCourier } from "@/lib/courier-ratings";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";

export type DeliveryOverview = {
  delivered: number;
  avgHours: number | null; // mean shippedAt → deliveredAt, in hours
  onTimePct: number | null; // delivered within the tier's max ETA
  returned: number;
  failedAttempts: number;
  avgAttempts: number | null; // mean doorstep attempts per delivered parcel
  codOutstanding: number; // cash all couriers are still holding
};

// Fleet-wide figures. `sinceDays` bounds it to a recent window (default: all‑time).
export async function deliveryOverview(
  sinceDays?: number,
): Promise<DeliveryOverview> {
  const since =
    sinceDays && sinceDays > 0
      ? new Date(Date.now() - sinceDays * 86_400_000)
      : undefined;
  const shippedFilter = since ? { gte: since } : undefined;

  const settings = await getPlatformSettings();
  const etaMax = (method: string) =>
    method === "EXPRESS"
      ? settings.express_eta_max_days
      : settings.std_eta_max_days;

  const [delivered, returned, cod] = await Promise.all([
    prisma.shipment.findMany({
      where: {
        platformManaged: true,
        status: "DELIVERED",
        deliveredAt: { not: null },
        shippedAt: shippedFilter ? shippedFilter : { not: null },
      },
      select: {
        shippedAt: true,
        deliveredAt: true,
        attemptCount: true,
        subOrder: { select: { shippingMethod: true } },
      },
    }),
    prisma.shipment.count({
      where: {
        platformManaged: true,
        status: "RETURNED",
        ...(since ? { shippedAt: { gte: since } } : {}),
      },
    }),
    // Cash on hand across the whole fleet = COD_COLLECTED + REMITTANCE +
    // ADJUSTMENT (everything except EARNING / PAYOUT, which are the fee side).
    prisma.courierLedgerEntry.aggregate({
      where: { type: { in: ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT"] } },
      _sum: { amountUsd: true },
    }),
  ]);

  let hoursSum = 0;
  let hoursN = 0;
  let onTime = 0;
  let attemptsSum = 0;
  let attemptsN = 0;
  let failedAttempts = 0;

  for (const s of delivered) {
    if (s.shippedAt && s.deliveredAt) {
      const hrs = (s.deliveredAt.getTime() - s.shippedAt.getTime()) / 3_600_000;
      hoursSum += hrs;
      hoursN += 1;
      const dueBy =
        s.shippedAt.getTime() + etaMax(s.subOrder.shippingMethod) * 86_400_000;
      if (s.deliveredAt.getTime() <= dueBy) onTime += 1;
    }
    if (s.attemptCount != null) {
      attemptsSum += s.attemptCount;
      attemptsN += 1;
      // attemptCount includes the successful drop; the rest were failures.
      if (s.attemptCount > 1) failedAttempts += s.attemptCount - 1;
    }
  }

  return {
    delivered: delivered.length,
    avgHours: hoursN ? round1(hoursSum / hoursN) : null,
    onTimePct: hoursN ? Math.round((onTime / hoursN) * 100) : null,
    returned,
    failedAttempts,
    avgAttempts: attemptsN ? round1(attemptsSum / attemptsN) : null,
    codOutstanding: round2(Number(cod._sum.amountUsd ?? 0)),
  };
}

export type CourierLeaderRow = {
  courierId: string;
  name: string;
  deliveries: number;
  rating: number | null;
  ratingCount: number;
  cashOnHand: number;
};

// Per-courier leaderboard: completed deliveries, average rating, cash on hand.
// Sorted by deliveries desc.
export async function courierLeaderboard(): Promise<CourierLeaderRow[]> {
  const [couriers, byDriver, ledger, ratings] = await Promise.all([
    prisma.user.findMany({
      where: { roles: { has: "COURIER" } },
      select: { id: true, name: true, email: true },
    }),
    prisma.shipment.groupBy({
      by: ["driverId"],
      where: { status: "DELIVERED", driverId: { not: null } },
      _count: { _all: true },
    }),
    prisma.courierLedgerEntry.groupBy({
      by: ["courierId"],
      where: { type: { in: ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT"] } },
      _sum: { amountUsd: true },
    }),
    courierRatingsByCourier(),
  ]);

  const deliveriesBy = new Map(
    byDriver.map((g) => [g.driverId as string, g._count._all]),
  );
  const cashBy = new Map(
    ledger.map((g) => [g.courierId, Number(g._sum.amountUsd ?? 0)]),
  );

  return couriers
    .map((c) => {
      const r = ratings.get(c.id);
      return {
        courierId: c.id,
        name: c.name ?? c.email ?? c.id.slice(-6),
        deliveries: deliveriesBy.get(c.id) ?? 0,
        rating: r ? r.avg : null,
        ratingCount: r ? r.count : 0,
        cashOnHand: round2(cashBy.get(c.id) ?? 0),
      };
    })
    .sort((a, b) => b.deliveries - a.deliveries);
}

function round1(n: number): number {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? 0 : v;
}
function round2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

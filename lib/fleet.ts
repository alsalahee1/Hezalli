// Fleet-partner rollups: per-fleet and per-driver figures derived from existing
// rows (couriers, shipments, the courier ledger, ratings) — no new accounting.
// Used by the admin fleet console and the read-only fleet-owner dashboard.
import { courierRatingsByCourier } from "@/lib/courier-ratings";
import { prisma } from "@/lib/prisma";

// Ledger types that make up a courier's CASH ON HAND (everything except the
// fee side, EARNING / PAYOUT) — mirrors lib/courier-ledger.ts.
const CASH_TYPES = ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT"] as const;
const EARNING_TYPES = ["EARNING", "PAYOUT"] as const;

function round2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

export type DriverStats = {
  courierId: string;
  name: string;
  suspended: boolean;
  activeJobs: number;
  delivered: number;
  cashOnHand: number;
  earningsOwed: number;
  rating: number | null;
  ratingCount: number;
};

export type FleetTotals = {
  drivers: number;
  activeJobs: number;
  delivered: number;
  cashOnHand: number;
  earningsOwed: number;
  rating: number | null; // delivery-weighted average across the fleet
  ratingCount: number;
};

// Per-driver stats for a set of couriers, keyed by courier id. Batched: four
// grouped queries regardless of how many drivers are in the set.
async function driverStatsFor(
  couriers: {
    id: string;
    name: string | null;
    email: string | null;
    isSuspended: boolean;
  }[],
): Promise<Map<string, DriverStats>> {
  const ids = couriers.map((c) => c.id);
  const out = new Map<string, DriverStats>();
  if (ids.length === 0) return out;

  const [active, delivered, cash, earnings, ratings] = await Promise.all([
    prisma.shipment.groupBy({
      by: ["driverId"],
      where: {
        driverId: { in: ids },
        subOrder: { status: "SHIPPED" },
      },
      _count: { _all: true },
    }),
    prisma.shipment.groupBy({
      by: ["driverId"],
      where: { driverId: { in: ids }, status: "DELIVERED" },
      _count: { _all: true },
    }),
    prisma.courierLedgerEntry.groupBy({
      by: ["courierId"],
      where: { courierId: { in: ids }, type: { in: [...CASH_TYPES] } },
      _sum: { amountUsd: true },
    }),
    prisma.courierLedgerEntry.groupBy({
      by: ["courierId"],
      where: { courierId: { in: ids }, type: { in: [...EARNING_TYPES] } },
      _sum: { amountUsd: true },
    }),
    courierRatingsByCourier(),
  ]);

  const activeBy = new Map(
    active.map((g) => [g.driverId as string, g._count._all]),
  );
  const deliveredBy = new Map(
    delivered.map((g) => [g.driverId as string, g._count._all]),
  );
  const cashBy = new Map(
    cash.map((g) => [g.courierId, Number(g._sum.amountUsd ?? 0)]),
  );
  const earnBy = new Map(
    earnings.map((g) => [g.courierId, Number(g._sum.amountUsd ?? 0)]),
  );

  for (const c of couriers) {
    const r = ratings.get(c.id);
    out.set(c.id, {
      courierId: c.id,
      name: c.name ?? c.email ?? c.id.slice(-6),
      suspended: c.isSuspended,
      activeJobs: activeBy.get(c.id) ?? 0,
      delivered: deliveredBy.get(c.id) ?? 0,
      cashOnHand: round2(cashBy.get(c.id) ?? 0),
      earningsOwed: round2(earnBy.get(c.id) ?? 0),
      rating: r ? r.avg : null,
      ratingCount: r ? r.count : 0,
    });
  }
  return out;
}

function sumTotals(rows: DriverStats[]): FleetTotals {
  let ratingWeighted = 0;
  let ratingCount = 0;
  const totals = rows.reduce(
    (acc, d) => {
      acc.activeJobs += d.activeJobs;
      acc.delivered += d.delivered;
      acc.cashOnHand += d.cashOnHand;
      acc.earningsOwed += d.earningsOwed;
      if (d.rating != null && d.ratingCount > 0) {
        ratingWeighted += d.rating * d.ratingCount;
        ratingCount += d.ratingCount;
      }
      return acc;
    },
    { activeJobs: 0, delivered: 0, cashOnHand: 0, earningsOwed: 0 },
  );
  return {
    drivers: rows.length,
    activeJobs: totals.activeJobs,
    delivered: totals.delivered,
    cashOnHand: round2(totals.cashOnHand),
    earningsOwed: round2(totals.earningsOwed),
    rating: ratingCount
      ? Math.round((ratingWeighted / ratingCount) * 10) / 10
      : null,
    ratingCount,
  };
}

export type FleetSummary = {
  id: string;
  name: string;
  isActive: boolean;
  contactPhone: string | null;
  ownerName: string | null;
  totals: FleetTotals;
};

// Every fleet with its rolled-up totals. For the admin fleet console.
export async function listFleetsWithStats(): Promise<FleetSummary[]> {
  const fleets = await prisma.fleet.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      contactPhone: true,
      owner: { select: { name: true, email: true } },
      couriers: {
        select: { id: true, name: true, email: true, isSuspended: true },
      },
    },
  });

  const everyCourier = fleets.flatMap((f) => f.couriers);
  const stats = await driverStatsFor(everyCourier);

  return fleets.map((f) => {
    const rows = f.couriers
      .map((c) => stats.get(c.id))
      .filter((d): d is DriverStats => Boolean(d));
    return {
      id: f.id,
      name: f.name,
      isActive: f.isActive,
      contactPhone: f.contactPhone,
      ownerName: f.owner?.name ?? f.owner?.email ?? null,
      totals: sumTotals(rows),
    };
  });
}

export type FleetDetail = {
  id: string;
  name: string;
  isActive: boolean;
  contactPhone: string | null;
  contactEmail: string | null;
  ownerId: string | null;
  ownerLabel: string | null;
  drivers: DriverStats[];
  totals: FleetTotals;
};

// One fleet with its roster (per-driver stats) + totals. `null` if not found.
export async function fleetDetail(
  fleetId: string,
): Promise<FleetDetail | null> {
  const fleet = await prisma.fleet.findUnique({
    where: { id: fleetId },
    select: {
      id: true,
      name: true,
      isActive: true,
      contactPhone: true,
      contactEmail: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
      couriers: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, isSuspended: true },
      },
    },
  });
  if (!fleet) return null;

  const stats = await driverStatsFor(fleet.couriers);
  const drivers = fleet.couriers
    .map((c) => stats.get(c.id))
    .filter((d): d is DriverStats => Boolean(d));

  return {
    id: fleet.id,
    name: fleet.name,
    isActive: fleet.isActive,
    contactPhone: fleet.contactPhone,
    contactEmail: fleet.contactEmail,
    ownerId: fleet.ownerId,
    ownerLabel: fleet.owner?.name ?? fleet.owner?.email ?? null,
    drivers,
    totals: sumTotals(drivers),
  };
}

// COD credit control (docs/DELIVERY-POINTS.md §32). Nobody may hold more of
// Hezalli's cash than the future income they'd lose by keeping it: a courier
// over their cash limit — or sitting on any COD past the age limit — stops
// receiving new assignments until they remit; a point over its cash limit
// stops receiving new routing and driver cash-ins. Remittances settle the
// OLDEST cash first (FIFO), so "overdue" means cash collected before the
// cutoff that is still not covered by everything remitted since.
//
// The cash limit is per-holder credit, not one flat number:
//   driver limit = driver_cash_limit (base)
//                + security deposit (admin-recorded, 1:1)
//                + wallet COD hold (self-pledged HezalliPay balance, counted
//                  as min(codHoldUsd, availableUsd) so an unbacked hold is
//                  worth nothing — see docs §36)
//                + trust bonus (every trust_step_deliveries completed
//                  deliveries add trust_step_bonus_usd, capped at
//                  trust_bonus_cap_usd)
//                + badge bonus (every earned quality/reliability badge —
//                  lib/courier-badges.ts, milestones excluded — adds
//                  badge_bonus_usd, capped at badge_bonus_cap_usd)
//   point limit  = point_cash_limit + the point's deposit (1:1)
// Deposits are optional — a driver with none simply lives on base + history.
// The age limit stays fixed for everyone: trusted or not, cash must not sit.
import { prisma } from "@/lib/prisma";
import { getPlatformSettings, type PlatformSettings } from "@/lib/settings";

// Money comparisons on round2-normalized sums; absorbs float noise.
const EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CourierCodStatus = {
  blocked: boolean;
  reason: "over_limit" | "overdue" | null;
  cashOnHand: number;
  // EFFECTIVE limit (base + deposit + wallet hold + trust); 0 = check off
  cashLimit: number;
  baseLimit: number;
  deposit: number;
  walletHold: number; // effective pledged collateral, min(hold, balance)
  trustBonus: number;
  badgeBonus: number; // limit earned from quality badges (lib/courier-badges.ts)
  deliveries: number; // completed deliveries backing the trust bonus
  maxAgeHours: number; // 0 = check off
  oldestUnpaidAt: Date | null; // when the oldest still-unsettled COD was taken
};

type CourierCash = {
  cashOnHand: number;
  collected: number;
  deliveries: number; // EARNING entries = completed platform deliveries
};

async function cashByCourier(
  courierIds: string[],
): Promise<Map<string, CourierCash>> {
  const out = new Map<string, CourierCash>();
  if (courierIds.length === 0) return out;
  const grouped = await prisma.courierLedgerEntry.groupBy({
    by: ["courierId", "type"],
    where: {
      courierId: { in: courierIds },
      type: { in: ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT", "EARNING"] },
    },
    _sum: { amountUsd: true },
    _count: { _all: true },
  });
  for (const g of grouped) {
    const cur = out.get(g.courierId) ?? {
      cashOnHand: 0,
      collected: 0,
      deliveries: 0,
    };
    const amt = Number(g._sum.amountUsd ?? 0);
    if (g.type === "EARNING") {
      cur.deliveries = g._count._all;
    } else {
      cur.cashOnHand += amt; // REMITTANCE/negative ADJUSTMENT stored signed
      if (g.type === "COD_COLLECTED") cur.collected += amt;
    }
    out.set(g.courierId, cur);
  }
  return out;
}

function trustBonus(deliveries: number, s: PlatformSettings): number {
  if (s.trust_step_deliveries <= 0 || s.trust_step_bonus_usd <= 0) return 0;
  const earned =
    Math.floor(deliveries / s.trust_step_deliveries) * s.trust_step_bonus_usd;
  return round2(Math.min(earned, Math.max(0, s.trust_bonus_cap_usd)));
}

// Quality work earns limit too: each earned non-milestone badge
// (lib/courier-badges.ts — top rated, 5-star streak, first-attempt, on-time,
// verified) adds badge_bonus_usd, capped. Milestone badges are excluded —
// delivery volume already earns limit through the trust bonus above.
async function badgeBonusByCourier(
  courierIds: string[],
  s: PlatformSettings,
): Promise<Map<string, number>> {
  if (
    courierIds.length === 0 ||
    s.badge_bonus_usd <= 0 ||
    s.badge_bonus_cap_usd <= 0
  )
    return new Map();
  const grouped = await prisma.courierBadgeAward.groupBy({
    by: ["courierId"],
    where: {
      courierId: { in: courierIds },
      badgeId: { not: { startsWith: "deliveries_" } },
    },
    _count: { _all: true },
  });
  return new Map(
    grouped.map((g) => [
      g.courierId,
      round2(
        Math.min(g._count._all * s.badge_bonus_usd, s.badge_bonus_cap_usd),
      ),
    ]),
  );
}

type Collateral = { deposit: number; walletHold: number };

async function collateralByCourier(
  courierIds: string[],
): Promise<Map<string, Collateral>> {
  if (courierIds.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: courierIds } },
    select: {
      id: true,
      courierDepositUsd: true,
      wallet: { select: { availableUsd: true, codHoldUsd: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      {
        deposit: Number(r.courierDepositUsd),
        // A pledge only counts while the money is actually in the wallet.
        walletHold: Math.max(
          0,
          Math.min(
            Number(r.wallet?.codHoldUsd ?? 0),
            Number(r.wallet?.availableUsd ?? 0),
          ),
        ),
      },
    ]),
  );
}

/**
 * The subset of `courierIds` that must NOT receive new assignments: cash on
 * hand over their personal limit (base + deposit + trust bonus), or (FIFO)
 * cash collected before the `driver_cod_max_age_hours` cutoff not yet covered
 * by remittances. A few grouped queries regardless of fleet size.
 */
export async function codBlockedCourierIds(
  courierIds: string[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (courierIds.length === 0) return blocked;
  const settings = await getPlatformSettings();
  const limit = settings.driver_cash_limit;
  const maxAgeHours = settings.driver_cod_max_age_hours;
  if (limit <= 0 && maxAgeHours <= 0) return blocked;

  const cash = await cashByCourier(courierIds);
  const holders = courierIds.filter(
    (id) => (cash.get(id)?.cashOnHand ?? 0) > EPS,
  );

  if (limit > 0 && holders.length > 0) {
    const [collateral, badgeBonus] = await Promise.all([
      collateralByCourier(holders),
      badgeBonusByCourier(holders, settings),
    ]);
    for (const id of holders) {
      const c = cash.get(id)!;
      const col = collateral.get(id) ?? { deposit: 0, walletHold: 0 };
      const personal =
        limit +
        col.deposit +
        col.walletHold +
        trustBonus(c.deliveries, settings) +
        (badgeBonus.get(id) ?? 0);
      if (c.cashOnHand > personal + EPS) blocked.add(id);
    }
  }

  if (maxAgeHours > 0 && holders.length > 0) {
    const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);
    // COD taken before the cutoff, per driver. FIFO: it is overdue when it
    // exceeds everything settled so far (collected − cashOnHand).
    const old = await prisma.courierLedgerEntry.groupBy({
      by: ["courierId"],
      where: {
        courierId: { in: holders },
        type: "COD_COLLECTED",
        createdAt: { lt: cutoff },
      },
      _sum: { amountUsd: true },
    });
    for (const g of old) {
      const c = cash.get(g.courierId)!;
      const settled = c.collected - c.cashOnHand;
      if (Number(g._sum.amountUsd ?? 0) > settled + EPS)
        blocked.add(g.courierId);
    }
  }
  return blocked;
}

/**
 * One courier's standing under COD credit control — powers the driver-app
 * banner and the admin badge/limit breakdown. `oldestUnpaidAt` is the
 * collection time of the first COD entry not yet covered by remittances
 * (FIFO walk).
 */
export async function courierCodStatus(
  courierId: string,
): Promise<CourierCodStatus> {
  const settings = await getPlatformSettings();
  const baseLimit = settings.driver_cash_limit;
  const maxAgeHours = settings.driver_cod_max_age_hours;

  const [cashMap, collateralMap, badgeBonusMap] = await Promise.all([
    cashByCourier([courierId]),
    collateralByCourier([courierId]),
    badgeBonusByCourier([courierId], settings),
  ]);
  const cash = cashMap.get(courierId) ?? {
    cashOnHand: 0,
    collected: 0,
    deliveries: 0,
  };
  const col = collateralMap.get(courierId) ?? { deposit: 0, walletHold: 0 };
  const deposit = round2(col.deposit);
  const walletHold = round2(col.walletHold);
  const bonus = trustBonus(cash.deliveries, settings);
  const badgeBonus = badgeBonusMap.get(courierId) ?? 0;
  const cashLimit =
    baseLimit > 0
      ? round2(baseLimit + deposit + walletHold + bonus + badgeBonus)
      : 0;
  const base = {
    cashOnHand: round2(cash.cashOnHand),
    cashLimit,
    baseLimit,
    deposit,
    walletHold,
    trustBonus: bonus,
    badgeBonus,
    deliveries: cash.deliveries,
    maxAgeHours,
  };
  if (cash.cashOnHand <= EPS)
    return { ...base, blocked: false, reason: null, oldestUnpaidAt: null };

  // FIFO walk: the first collection the settled total doesn't reach is the
  // oldest cash the driver still holds.
  const settled = cash.collected - cash.cashOnHand;
  const entries = await prisma.courierLedgerEntry.findMany({
    where: { courierId, type: "COD_COLLECTED" },
    orderBy: { createdAt: "asc" },
    select: { amountUsd: true, createdAt: true },
  });
  let cum = 0;
  let oldestUnpaidAt: Date | null = null;
  for (const e of entries) {
    cum += Number(e.amountUsd);
    if (cum > settled + EPS) {
      oldestUnpaidAt = e.createdAt;
      break;
    }
  }

  const overLimit = cashLimit > 0 && cash.cashOnHand > cashLimit + EPS;
  const overdue =
    maxAgeHours > 0 &&
    oldestUnpaidAt != null &&
    Date.now() - oldestUnpaidAt.getTime() > maxAgeHours * 3600_000;
  return {
    ...base,
    blocked: overLimit || overdue,
    // Age is the harder violation to clear — surface it first.
    reason: overdue ? "overdue" : overLimit ? "over_limit" : null,
    oldestUnpaidAt,
  };
}

/**
 * Point ids (from `pointIds`) whose unremitted cash (counter COD + driver
 * cash-ins − remittances) exceeds their personal limit (`point_cash_limit`
 * + the point's deposit) — excluded from new routing and barred from taking
 * more driver cash.
 */
export async function cashBlockedPointIds(
  pointIds: string[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (pointIds.length === 0) return blocked;
  const limit = (await getPlatformSettings()).point_cash_limit;
  if (limit <= 0) return blocked;

  const [grouped, points] = await Promise.all([
    prisma.deliveryPointLedgerEntry.groupBy({
      by: ["pointId"],
      where: {
        pointId: { in: pointIds },
        type: { in: ["COD_COLLECTED", "DRIVER_CASH_IN", "COD_REMITTANCE"] },
      },
      _sum: { amountUsd: true },
    }),
    prisma.deliveryPoint.findMany({
      where: { id: { in: pointIds } },
      select: { id: true, depositUsd: true },
    }),
  ]);
  const depositBy = new Map(points.map((p) => [p.id, Number(p.depositUsd)]));
  for (const g of grouped) {
    const personal = limit + (depositBy.get(g.pointId) ?? 0);
    if (Number(g._sum.amountUsd ?? 0) > personal + EPS) blocked.add(g.pointId);
  }
  return blocked;
}

// ---------------------------------------------------------------------------
// Cash exposure report (docs §40): the owner's daily question — "how much of
// Hezalli's money is in other people's pockets right now?" — answered with a
// handful of grouped queries. Aging uses the same FIFO rule as the block:
// cash collected before a cutoff is overdue when it exceeds everything
// settled so far.
// ---------------------------------------------------------------------------

export type ExposureHolder = {
  id: string;
  name: string;
  cashOnHand: number;
  limit: number; // personal limit (0 when the check is off)
  collateral: number; // deposit (+ effective wallet hold for drivers)
  overdue24: number; // cash older than 24h, FIFO
  overdue48: number; // cash older than 48h, FIFO
  blocked: boolean;
};

export type CodExposureReport = {
  totalOutstanding: number;
  driverCash: number;
  pointCash: number;
  totalCollateral: number;
  coverage: number; // collateral / outstanding, capped at 1 (1 = fully covered)
  fresh: number; // held < 24h
  aging24: number; // held 24–48h
  aging48: number; // held > 48h
  blockedDrivers: number;
  blockedPoints: number;
  holdersCount: number;
  topDrivers: ExposureHolder[];
  topPoints: ExposureHolder[];
};

async function overdueByCourier(
  courierIds: string[],
  cutoff: Date,
): Promise<Map<string, number>> {
  if (courierIds.length === 0) return new Map();
  const old = await prisma.courierLedgerEntry.groupBy({
    by: ["courierId"],
    where: {
      courierId: { in: courierIds },
      type: "COD_COLLECTED",
      createdAt: { lt: cutoff },
    },
    _sum: { amountUsd: true },
  });
  return new Map(old.map((g) => [g.courierId, Number(g._sum.amountUsd ?? 0)]));
}

async function overdueByPoint(
  pointIds: string[],
  cutoff: Date,
): Promise<Map<string, number>> {
  if (pointIds.length === 0) return new Map();
  const old = await prisma.deliveryPointLedgerEntry.groupBy({
    by: ["pointId"],
    where: {
      pointId: { in: pointIds },
      type: { in: ["COD_COLLECTED", "DRIVER_CASH_IN"] },
      createdAt: { lt: cutoff },
    },
    _sum: { amountUsd: true },
  });
  return new Map(old.map((g) => [g.pointId, Number(g._sum.amountUsd ?? 0)]));
}

/** Platform-wide COD cash picture for the admin / delivery-manager dashboard. */
export async function codExposureReport(topN = 10): Promise<CodExposureReport> {
  const settings = await getPlatformSettings();
  const now = Date.now();
  const cut24 = new Date(now - 24 * 3600_000);
  const cut48 = new Date(now - 48 * 3600_000);
  const maxAgeMs = settings.driver_cod_max_age_hours * 3600_000;
  const cutMaxAge =
    settings.driver_cod_max_age_hours > 0 ? new Date(now - maxAgeMs) : null;

  // ---- Drivers ------------------------------------------------------------
  const grouped = await prisma.courierLedgerEntry.groupBy({
    by: ["courierId", "type"],
    where: {
      type: { in: ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT", "EARNING"] },
    },
    _sum: { amountUsd: true },
    _count: { _all: true },
  });
  const cash = new Map<
    string,
    { cashOnHand: number; collected: number; deliveries: number }
  >();
  for (const g of grouped) {
    const cur = cash.get(g.courierId) ?? {
      cashOnHand: 0,
      collected: 0,
      deliveries: 0,
    };
    const amt = Number(g._sum.amountUsd ?? 0);
    if (g.type === "EARNING") cur.deliveries = g._count._all;
    else {
      cur.cashOnHand += amt;
      if (g.type === "COD_COLLECTED") cur.collected += amt;
    }
    cash.set(g.courierId, cur);
  }
  const holders = [...cash.entries()]
    .filter(([, c]) => c.cashOnHand > EPS)
    .map(([id]) => id);

  const [users, old24, old48, oldMax, badgeBonus] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: holders } },
      select: {
        id: true,
        name: true,
        email: true,
        courierDepositUsd: true,
        wallet: { select: { availableUsd: true, codHoldUsd: true } },
      },
    }),
    overdueByCourier(holders, cut24),
    overdueByCourier(holders, cut48),
    cutMaxAge
      ? overdueByCourier(holders, cutMaxAge)
      : new Map<string, number>(),
    badgeBonusByCourier(holders, settings),
  ]);
  const userBy = new Map(users.map((u) => [u.id, u]));

  const drivers: ExposureHolder[] = holders.map((id) => {
    const c = cash.get(id)!;
    const u = userBy.get(id);
    const deposit = Number(u?.courierDepositUsd ?? 0);
    const holdEff = Math.max(
      0,
      Math.min(
        Number(u?.wallet?.codHoldUsd ?? 0),
        Number(u?.wallet?.availableUsd ?? 0),
      ),
    );
    const limit =
      settings.driver_cash_limit > 0
        ? round2(
            settings.driver_cash_limit +
              deposit +
              holdEff +
              trustBonus(c.deliveries, settings) +
              (badgeBonus.get(id) ?? 0),
          )
        : 0;
    const settled = c.collected - c.cashOnHand;
    const over = (m: Map<string, number>) =>
      round2(Math.max(0, Math.min(c.cashOnHand, (m.get(id) ?? 0) - settled)));
    const overdueMax = cutMaxAge ? over(oldMax as Map<string, number>) : 0;
    return {
      id,
      name: u?.name ?? u?.email ?? id.slice(-6),
      cashOnHand: round2(c.cashOnHand),
      limit,
      collateral: round2(deposit + holdEff),
      overdue24: over(old24),
      overdue48: over(old48),
      blocked:
        (limit > 0 && c.cashOnHand > limit + EPS) ||
        (cutMaxAge != null && overdueMax > EPS),
    };
  });

  // ---- Points ---------------------------------------------------------------
  const pGrouped = await prisma.deliveryPointLedgerEntry.groupBy({
    by: ["pointId", "type"],
    where: {
      type: { in: ["COD_COLLECTED", "DRIVER_CASH_IN", "COD_REMITTANCE"] },
    },
    _sum: { amountUsd: true },
  });
  const pCash = new Map<string, { cashOnHand: number; collected: number }>();
  for (const g of pGrouped) {
    const cur = pCash.get(g.pointId) ?? { cashOnHand: 0, collected: 0 };
    const amt = Number(g._sum.amountUsd ?? 0);
    cur.cashOnHand += amt;
    if (g.type !== "COD_REMITTANCE") cur.collected += amt;
    pCash.set(g.pointId, cur);
  }
  const pHolders = [...pCash.entries()]
    .filter(([, c]) => c.cashOnHand > EPS)
    .map(([id]) => id);

  const [pointRows, pOld24, pOld48] = await Promise.all([
    prisma.deliveryPoint.findMany({
      where: { id: { in: pHolders } },
      select: { id: true, name: true, depositUsd: true },
    }),
    overdueByPoint(pHolders, cut24),
    overdueByPoint(pHolders, cut48),
  ]);
  const pointBy = new Map(pointRows.map((p) => [p.id, p]));

  const points: ExposureHolder[] = pHolders.map((id) => {
    const c = pCash.get(id)!;
    const p = pointBy.get(id);
    const deposit = Number(p?.depositUsd ?? 0);
    const limit =
      settings.point_cash_limit > 0
        ? round2(settings.point_cash_limit + deposit)
        : 0;
    const settled = c.collected - c.cashOnHand;
    const over = (m: Map<string, number>) =>
      round2(Math.max(0, Math.min(c.cashOnHand, (m.get(id) ?? 0) - settled)));
    return {
      id,
      name: p?.name ?? id.slice(-6),
      cashOnHand: round2(c.cashOnHand),
      limit,
      collateral: round2(deposit),
      overdue24: over(pOld24),
      overdue48: over(pOld48),
      blocked: limit > 0 && c.cashOnHand > limit + EPS,
    };
  });

  // ---- Totals ---------------------------------------------------------------
  const all = [...drivers, ...points];
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const totalOutstanding = sum(all.map((h) => h.cashOnHand));
  const overdue24 = sum(all.map((h) => h.overdue24));
  const overdue48 = sum(all.map((h) => h.overdue48));
  const totalCollateral = sum(all.map((h) => h.collateral));
  const byCash = (a: ExposureHolder, b: ExposureHolder) =>
    b.cashOnHand - a.cashOnHand;

  return {
    totalOutstanding,
    driverCash: sum(drivers.map((h) => h.cashOnHand)),
    pointCash: sum(points.map((h) => h.cashOnHand)),
    totalCollateral,
    coverage:
      totalOutstanding > 0
        ? Math.min(1, totalCollateral / totalOutstanding)
        : 1,
    fresh: round2(totalOutstanding - overdue24),
    aging24: round2(overdue24 - overdue48),
    aging48: overdue48,
    blockedDrivers: drivers.filter((h) => h.blocked).length,
    blockedPoints: points.filter((h) => h.blocked).length,
    holdersCount: all.length,
    topDrivers: drivers.sort(byCash).slice(0, topN),
    topPoints: points.sort(byCash).slice(0, topN),
  };
}

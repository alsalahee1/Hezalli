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
    const collateral = await collateralByCourier(holders);
    for (const id of holders) {
      const c = cash.get(id)!;
      const col = collateral.get(id) ?? { deposit: 0, walletHold: 0 };
      const personal =
        limit +
        col.deposit +
        col.walletHold +
        trustBonus(c.deliveries, settings);
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

  const [cashMap, collateralMap] = await Promise.all([
    cashByCourier([courierId]),
    collateralByCourier([courierId]),
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
  const cashLimit =
    baseLimit > 0 ? round2(baseLimit + deposit + walletHold + bonus) : 0;
  const base = {
    cashOnHand: round2(cash.cashOnHand),
    cashLimit,
    baseLimit,
    deposit,
    walletHold,
    trustBonus: bonus,
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

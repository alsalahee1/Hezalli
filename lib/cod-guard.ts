// COD credit control (docs/DELIVERY-POINTS.md §32). Nobody may hold more of
// Hezalli's cash than the future income they'd lose by keeping it: a courier
// over the cash limit — or sitting on any COD past the age limit — stops
// receiving new assignments until they remit; a point over its cash limit
// stops receiving new routing and driver cash-ins. Remittances settle the
// OLDEST cash first (FIFO), so "overdue" means cash collected before the
// cutoff that is still not covered by everything remitted since.
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";

// Money comparisons on round2-normalized sums; absorbs float noise.
const EPS = 0.005;

export type CourierCodStatus = {
  blocked: boolean;
  reason: "over_limit" | "overdue" | null;
  cashOnHand: number;
  cashLimit: number; // 0 = check off
  maxAgeHours: number; // 0 = check off
  oldestUnpaidAt: Date | null; // when the oldest still-unsettled COD was taken
};

type CashByCourier = Map<string, { cashOnHand: number; collected: number }>;

async function cashByCourier(courierIds: string[]): Promise<CashByCourier> {
  const out: CashByCourier = new Map();
  if (courierIds.length === 0) return out;
  const grouped = await prisma.courierLedgerEntry.groupBy({
    by: ["courierId", "type"],
    where: {
      courierId: { in: courierIds },
      type: { in: ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT"] },
    },
    _sum: { amountUsd: true },
  });
  for (const g of grouped) {
    const cur = out.get(g.courierId) ?? { cashOnHand: 0, collected: 0 };
    const amt = Number(g._sum.amountUsd ?? 0);
    cur.cashOnHand += amt; // REMITTANCE/negative ADJUSTMENT stored signed
    if (g.type === "COD_COLLECTED") cur.collected += amt;
    out.set(g.courierId, cur);
  }
  return out;
}

/**
 * The subset of `courierIds` that must NOT receive new assignments: cash on
 * hand over `driver_cash_limit`, or (FIFO) cash collected before the
 * `driver_cod_max_age_hours` cutoff not yet covered by remittances. One
 * settings read + two grouped queries regardless of fleet size.
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

  if (limit > 0) {
    for (const id of holders) {
      if (cash.get(id)!.cashOnHand > limit + EPS) blocked.add(id);
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
 * banner and the admin badge. `oldestUnpaidAt` is the collection time of the
 * first COD entry not yet covered by remittances (FIFO walk).
 */
export async function courierCodStatus(
  courierId: string,
): Promise<CourierCodStatus> {
  const settings = await getPlatformSettings();
  const cashLimit = settings.driver_cash_limit;
  const maxAgeHours = settings.driver_cod_max_age_hours;

  const cash = (await cashByCourier([courierId])).get(courierId) ?? {
    cashOnHand: 0,
    collected: 0,
  };
  const base = {
    cashOnHand: Math.round(cash.cashOnHand * 100) / 100,
    cashLimit,
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
 * cash-ins − remittances) exceeds `point_cash_limit` — excluded from new
 * routing and barred from taking more driver cash.
 */
export async function cashBlockedPointIds(
  pointIds: string[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (pointIds.length === 0) return blocked;
  const limit = (await getPlatformSettings()).point_cash_limit;
  if (limit <= 0) return blocked;

  const grouped = await prisma.deliveryPointLedgerEntry.groupBy({
    by: ["pointId"],
    where: {
      pointId: { in: pointIds },
      type: { in: ["COD_COLLECTED", "DRIVER_CASH_IN", "COD_REMITTANCE"] },
    },
    _sum: { amountUsd: true },
  });
  for (const g of grouped) {
    if (Number(g._sum.amountUsd ?? 0) > limit + EPS) blocked.add(g.pointId);
  }
  return blocked;
}

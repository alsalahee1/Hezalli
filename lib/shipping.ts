// Shipping quotes. Fees are zone-based (Phase 10): a buyer's governorate maps
// to a ShippingZone, and each store sets a per-zone rate (flat fee + optional
// "free over X"). Stores with no configured rate for the destination fall back
// to the platform default. All amounts are USD.
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

// Fallback when a store has no rate for the destination zone and no platform
// default is configured. Mirrors the Phase 8 flat rate.
export const DEFAULT_SHIPPING_FEE = 5;
export const DEFAULT_FREE_OVER = 50;

export type ShipGroup = { storeId: string; subtotal: number };

async function shippingDefaults(): Promise<{ fee: number; freeOver: number }> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: ["default_shipping_fee", "free_shipping_over"] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const fee = map.get("default_shipping_fee");
  const freeOver = map.get("free_shipping_over");
  return {
    fee:
      Number.isFinite(fee) && (fee as number) >= 0
        ? (fee as number)
        : DEFAULT_SHIPPING_FEE,
    freeOver:
      Number.isFinite(freeOver) && (freeOver as number) > 0
        ? (freeOver as number)
        : DEFAULT_FREE_OVER,
  };
}

/** The zone that serves a governorate, or null if none is defined. */
export async function resolveZoneId(
  governorate: string,
): Promise<string | null> {
  const zone = await prisma.shippingZone.findFirst({
    where: { governorates: { has: governorate } },
    select: { id: true },
  });
  return zone?.id ?? null;
}

/**
 * Shipping fee per store for a destination governorate. Returns a map keyed by
 * storeId. A store's own rate wins; otherwise the platform default applies.
 * "Free over X" waives the fee once the store subtotal reaches the threshold.
 */
export async function quoteShippingForStores(
  governorate: string,
  groups: ShipGroup[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (groups.length === 0) return out;

  const [zoneId, defaults] = await Promise.all([
    resolveZoneId(governorate),
    shippingDefaults(),
  ]);
  const rates = zoneId
    ? await prisma.shippingRate.findMany({
        where: { storeId: { in: groups.map((g) => g.storeId) }, zoneId },
        select: { storeId: true, feeUsd: true, freeOver: true },
      })
    : [];
  const byStore = new Map(rates.map((r) => [r.storeId, r]));

  for (const g of groups) {
    const r = byStore.get(g.storeId);
    const fee = r ? Number(r.feeUsd) : defaults.fee;
    const freeOver = r
      ? r.freeOver != null
        ? Number(r.freeOver)
        : null
      : defaults.freeOver;
    const isFree = freeOver != null && g.subtotal >= freeOver;
    out.set(g.storeId, isFree ? 0 : round2(fee));
  }
  return out;
}

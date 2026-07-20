// Shipping quotes. Fees are zone-based (Phase 10): a buyer's governorate maps
// to a ShippingZone, and each store sets a per-zone rate (flat fee + optional
// "free over X"). Stores with no configured rate for the destination fall back
// to the platform default. All amounts are USD.
//
// Each store group also offers an optional EXPRESS tier — our own Hezalli
// Express delivery — priced separately (per-zone express fee, else the platform
// default) with a faster delivery-time estimate. "Free over X" waives the
// STANDARD fee only; express is a paid premium and is always charged.
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

// Fallback when a store has no rate for the destination zone and no platform
// default is configured. Mirrors the Phase 8 flat rate.
export const DEFAULT_SHIPPING_FEE = 5;
export const DEFAULT_FREE_OVER = 50;
export const DEFAULT_EXPRESS_FEE = 10;
// Delivery-time estimates (days) shown at checkout when the admin hasn't
// overridden them in platform settings.
export const DEFAULT_STD_ETA: [number, number] = [3, 7];
export const DEFAULT_EXPRESS_ETA: [number, number] = [1, 2];

export type ShipGroup = { storeId: string; subtotal: number };
export type ShippingMethod = "STANDARD" | "EXPRESS" | "PICKUP";

export type ShipOption = {
  method: ShippingMethod;
  fee: number;
  etaMinDays: number;
  etaMaxDays: number;
};
export type StoreShipOptions = {
  standard: ShipOption;
  /** Null when the platform has express delivery switched off. */
  express: ShipOption | null;
  /**
   * Collect-from-a-Hezalli-Point option (docs/DELIVERY-POINTS.md §6). Null
   * when points are off or no ACTIVE point exists. ETA is the standard range
   * (time for the parcel to reach the point).
   */
  pickup: ShipOption | null;
};

type ShippingConfig = {
  fee: number;
  freeOver: number;
  expressEnabled: boolean;
  expressFee: number;
  pointsEnabled: boolean;
  pickupFee: number;
  stdEta: [number, number];
  expressEta: [number, number];
};

function num(v: unknown, fallback: number, positive = false): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (positive ? n <= 0 : n < 0) return fallback;
  return n;
}

async function shippingConfig(): Promise<ShippingConfig> {
  const rows = await prisma.platformSetting.findMany({
    where: {
      key: {
        in: [
          "default_shipping_fee",
          "free_shipping_over",
          "express_enabled",
          "default_express_fee",
          "std_eta_min_days",
          "std_eta_max_days",
          "express_eta_min_days",
          "express_eta_max_days",
          "points_enabled",
          "pickup_fee",
        ],
      },
    },
    select: { key: true, value: true },
  });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const stdMin = num(m.get("std_eta_min_days"), DEFAULT_STD_ETA[0], true);
  const stdMax = num(m.get("std_eta_max_days"), DEFAULT_STD_ETA[1], true);
  const expMin = num(
    m.get("express_eta_min_days"),
    DEFAULT_EXPRESS_ETA[0],
    true,
  );
  const expMax = num(
    m.get("express_eta_max_days"),
    DEFAULT_EXPRESS_ETA[1],
    true,
  );
  return {
    fee: num(m.get("default_shipping_fee"), DEFAULT_SHIPPING_FEE),
    freeOver: num(m.get("free_shipping_over"), DEFAULT_FREE_OVER, true),
    // Default on: express is available unless the admin explicitly turns it off.
    expressEnabled: m.has("express_enabled")
      ? m.get("express_enabled") === true || m.get("express_enabled") === "true"
      : true,
    expressFee: num(m.get("default_express_fee"), DEFAULT_EXPRESS_FEE, true),
    // Default on, like express: pickup is offered unless explicitly disabled.
    pointsEnabled: m.has("points_enabled")
      ? m.get("points_enabled") === true || m.get("points_enabled") === "true"
      : true,
    pickupFee: num(m.get("pickup_fee"), 0),
    stdEta: [Math.min(stdMin, stdMax), Math.max(stdMin, stdMax)],
    expressEta: [Math.min(expMin, expMax), Math.max(expMin, expMax)],
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
 * Shipping options per store for a destination governorate. Returns a map keyed
 * by storeId, each with a STANDARD option and (when the platform enables it) an
 * EXPRESS option. A store's own rate wins; otherwise the platform default
 * applies. "Free over X" waives the standard fee once the store subtotal
 * reaches the threshold — express is never waived.
 */
export async function quoteShippingForStores(
  governorate: string,
  groups: ShipGroup[],
): Promise<Map<string, StoreShipOptions>> {
  const out = new Map<string, StoreShipOptions>();
  if (groups.length === 0) return out;

  const [zoneId, cfg] = await Promise.all([
    resolveZoneId(governorate),
    shippingConfig(),
  ]);
  // Pickup is offered only when at least one point can actually receive it.
  const hasActivePoint = cfg.pointsEnabled
    ? (await prisma.deliveryPoint.count({ where: { status: "ACTIVE" } })) > 0
    : false;
  const rates = zoneId
    ? await prisma.shippingRate.findMany({
        where: { storeId: { in: groups.map((g) => g.storeId) }, zoneId },
        select: {
          storeId: true,
          feeUsd: true,
          freeOver: true,
          expressFeeUsd: true,
        },
      })
    : [];
  const byStore = new Map(rates.map((r) => [r.storeId, r]));

  for (const g of groups) {
    const r = byStore.get(g.storeId);
    const stdFee = r ? Number(r.feeUsd) : cfg.fee;
    const freeOver = r
      ? r.freeOver != null
        ? Number(r.freeOver)
        : null
      : cfg.freeOver;
    const isFree = freeOver != null && g.subtotal >= freeOver;
    const standard: ShipOption = {
      method: "STANDARD",
      fee: isFree ? 0 : round2(stdFee),
      etaMinDays: cfg.stdEta[0],
      etaMaxDays: cfg.stdEta[1],
    };

    let express: ShipOption | null = null;
    if (cfg.expressEnabled) {
      const expFee =
        r && r.expressFeeUsd != null ? Number(r.expressFeeUsd) : cfg.expressFee;
      express = {
        method: "EXPRESS",
        fee: round2(expFee),
        etaMinDays: cfg.expressEta[0],
        etaMaxDays: cfg.expressEta[1],
      };
    }

    const pickup: ShipOption | null = hasActivePoint
      ? {
          method: "PICKUP",
          fee: round2(cfg.pickupFee),
          etaMinDays: cfg.stdEta[0],
          etaMaxDays: cfg.stdEta[1],
        }
      : null;

    out.set(g.storeId, { standard, express, pickup });
  }
  return out;
}

/**
 * Pick the authoritative fee/option for a buyer's chosen method. Falls back to
 * standard when express was requested but isn't available (platform off) — the
 * server never trusts a client-supplied fee.
 */
export function resolveShippingChoice(
  opts: StoreShipOptions | undefined,
  method: ShippingMethod,
): ShipOption {
  if (!opts) {
    return {
      method: "STANDARD",
      fee: 0,
      etaMinDays: DEFAULT_STD_ETA[0],
      etaMaxDays: DEFAULT_STD_ETA[1],
    };
  }
  if (method === "EXPRESS" && opts.express) return opts.express;
  if (method === "PICKUP" && opts.pickup) return opts.pickup;
  return opts.standard;
}

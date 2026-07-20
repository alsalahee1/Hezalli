// Platform settings live in the PlatformSetting key/value table. This module is
// the single source of truth for the keys, their types, and their defaults.
// Individual consumers (finance, returns, payouts, shipping) read the same keys
// so an admin edit here changes real behavior.
import { prisma } from "@/lib/prisma";

export type PlatformSettings = {
  platform_name: string;
  platform_logo: string;
  commission_rate: number; // decimal fraction, e.g. 0.10 = 10%
  return_window_days: number;
  return_response_days: number;
  auto_complete_days: number;
  min_payout_usd: number;
  cod_enabled: boolean;
  maintenance_mode: boolean;
  // Express delivery tier (our own Hezalli Express). When off, only standard
  // shipping is offered at checkout. Fee is the platform-wide express price a
  // store falls back to when it hasn't set its own per-zone express fee. ETAs
  // are the delivery-time estimates (in days) shown to buyers at checkout.
  express_enabled: boolean;
  default_express_fee: number;
  std_eta_min_days: number;
  std_eta_max_days: number;
  express_eta_min_days: number;
  express_eta_max_days: number;
  // Auto-hand a shipped Hezalli Express parcel to the least-loaded courier.
  express_auto_assign: boolean;
  // How auto-assignment chooses a courier: "balanced" (fewest active jobs) or
  // "nearest" (a driver in the destination governorate, then fewest jobs).
  courier_assign_strategy: "balanced" | "nearest";
  // Flat fee (USD) Hezalli pays a courier for each completed Hezalli Express
  // delivery — accrued to the driver's earnings ledger on delivery.
  courier_delivery_fee: number;
  // Hezalli Delivery Points (partner parcel hubs — docs/DELIVERY-POINTS.md).
  // When off, sellers can't route parcels through a point. Handling fee is the
  // USD amount a point earns per delivered parcel routed through it. Max
  // attempts is when the point should return a failing parcel to the seller.
  points_enabled: boolean;
  point_handling_fee: number;
  max_delivery_attempts: number;
  // Wallet top-ups (Step 19.3). Per-transaction bounds + a standing balance cap
  // that limits how much unverified users may hold; VERIFIED users get a
  // multiple of the cap (see lib/wallet-limits.ts).
  wallet_topup_min_usd: number;
  wallet_topup_max_usd: number;
  wallet_balance_cap_usd: number;
  // Wallet cashback (Step 19.5): fraction of items total credited to the
  // buyer's wallet on order completion. 0 = off (default).
  wallet_cashback_rate: number;
  // Peer-to-peer wallet transfers (Step 19.5+). LICENSED ONLY — money
  // transmission is regulated; keep false until authorized. Default off.
  wallet_p2p_enabled: boolean;
  // Bill payment & airtime top-up (Step 19.7). A provider-ready framework;
  // purchases are fulfilled manually by an admin until a biller/telco API is
  // wired. Off by default — admins enable it in Admin → Settings.
  wallet_bills_enabled: boolean;
  // Active bill/airtime fulfilment provider id (Step 19.13). "manual" = admin
  // fulfils each purchase; a registered adapter id auto-resolves it. See
  // lib/providers/bill-provider.ts.
  wallet_bills_provider: string;
  // Outflow velocity caps (Step 19.10). Ceilings on how much can LEAVE a wallet
  // (send + cash-out + bill/airtime) over rolling 24h / 30d windows, before the
  // VERIFIED multiplier. 0 = no limit. See lib/wallet-velocity.ts.
  wallet_daily_outflow_usd: number;
  wallet_monthly_outflow_usd: number;
};

export const SETTING_DEFAULTS: PlatformSettings = {
  platform_name: "Hezalli",
  platform_logo: "",
  commission_rate: 0.1,
  return_window_days: 7,
  return_response_days: 2,
  auto_complete_days: 3,
  min_payout_usd: 10,
  cod_enabled: true,
  maintenance_mode: false,
  express_enabled: true,
  default_express_fee: 10,
  std_eta_min_days: 3,
  std_eta_max_days: 7,
  express_eta_min_days: 1,
  express_eta_max_days: 2,
  express_auto_assign: true,
  courier_assign_strategy: "balanced",
  courier_delivery_fee: 1.5,
  points_enabled: true,
  point_handling_fee: 0.5,
  max_delivery_attempts: 3,
  wallet_topup_min_usd: 1,
  wallet_topup_max_usd: 500,
  wallet_balance_cap_usd: 2000,
  // Cashback to the buyer's wallet on completed orders, as a fraction of the
  // items total. Off by default (0); admins turn it on in Admin → Settings.
  wallet_cashback_rate: 0,
  wallet_p2p_enabled: false,
  wallet_bills_enabled: false,
  wallet_bills_provider: "manual",
  wallet_daily_outflow_usd: 1000,
  wallet_monthly_outflow_usd: 5000,
};

export const SETTING_KEYS = Object.keys(
  SETTING_DEFAULTS,
) as (keyof PlatformSettings)[];

function coerce<K extends keyof PlatformSettings>(
  key: K,
  raw: unknown,
): PlatformSettings[K] {
  const def = SETTING_DEFAULTS[key];
  if (raw == null) return def;
  if (typeof def === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : def) as PlatformSettings[K];
  }
  if (typeof def === "boolean") {
    return (raw === true || raw === "true") as PlatformSettings[K];
  }
  return String(raw) as PlatformSettings[K];
}

/** All platform settings, merged over defaults. One query. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: SETTING_KEYS as string[] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...SETTING_DEFAULTS };
  for (const k of SETTING_KEYS) {
    if (byKey.has(k)) out[k] = coerce(k, byKey.get(k)) as never;
  }
  return out;
}

/** Read a single setting (targeted query) for hot paths. */
export async function getSetting<K extends keyof PlatformSettings>(
  key: K,
): Promise<PlatformSettings[K]> {
  const row = await prisma.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return coerce(key, row?.value);
}

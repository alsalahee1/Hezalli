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
  // Wallet top-ups (Step 19.3). Per-transaction bounds + a standing balance cap
  // that limits how much unverified users may hold; VERIFIED users get a
  // multiple of the cap (see lib/wallet-limits.ts).
  wallet_topup_min_usd: number;
  wallet_topup_max_usd: number;
  wallet_balance_cap_usd: number;
  // Wallet cashback (Step 19.5): fraction of items total credited to the
  // buyer's wallet on order completion. 0 = off (default).
  wallet_cashback_rate: number;
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
  wallet_topup_min_usd: 1,
  wallet_topup_max_usd: 500,
  wallet_balance_cap_usd: 2000,
  wallet_cashback_rate: 0,
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

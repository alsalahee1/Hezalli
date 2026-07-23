// Server-side display-currency resolution (DECISIONS.md §3). The buyer picks
// a display currency (cookie); the YER rate additionally depends on their
// currency zone, resolved from a governorate — the delivery address at
// checkout, or the default saved address while browsing.
import { cache } from "react";
import { cookies } from "next/headers";

import {
  CURRENCY_ZONE_COOKIE,
  CURRENCY_ZONES,
  DISPLAY_CURRENCY_COOKIE,
  isDisplayCurrency,
  isSelectableZone,
  pickRate,
  USD_DISPLAY,
  zoneForGovernorate,
  type CurrencyZone,
  type DisplayCurrency,
  type DisplayCurrencyCode,
  type SelectableZone,
} from "@/lib/currency-constants";
import { prisma } from "@/lib/prisma";

/** Buyer's chosen display currency from the cookie; YER by default. */
export async function getDisplayCurrencyCode(): Promise<DisplayCurrencyCode> {
  try {
    const store = await cookies();
    const value = store.get(DISPLAY_CURRENCY_COOKIE)?.value;
    return isDisplayCurrency(value) ? value : "YER";
  } catch {
    // No request scope (integration tests, background jobs) → the default.
    return "YER";
  }
}

/**
 * Buyer's explicit rial-market pick (Sana'a old rial vs Aden new rial), or
 * null when they never chose one. Overrides the address-derived zone for
 * browsing display only — never for the checkout snapshot.
 */
export async function getPreferredZone(): Promise<SelectableZone | null> {
  try {
    const store = await cookies();
    const value = store.get(CURRENCY_ZONE_COOKIE)?.value;
    return isSelectableZone(value) ? value : null;
  } catch {
    // No request scope (integration tests, background jobs).
    return null;
  }
}

/**
 * Rate for a currency in `zone` — or, when no explicit zone is given, the
 * zone of `governorate` (DEFAULT-zone fallback).
 */
export async function getRateFor(
  code: DisplayCurrencyCode,
  governorate: string | null | undefined,
  zone?: CurrencyZone,
): Promise<DisplayCurrency> {
  if (code === "USD") return USD_DISPLAY;
  const resolvedZone = zone ?? zoneForGovernorate(governorate);
  const rows = await prisma.exchangeRate.findMany({
    where: { currency: code },
    select: { currency: true, zone: true, rate: true },
  });
  const rate = pickRate(
    rows.map((r) => ({ ...r, rate: Number(r.rate) })),
    code,
    resolvedZone,
  );
  // No configured rate → fail safe to USD rather than show a wrong price.
  return rate ? { code, rate, zone: resolvedZone } : USD_DISPLAY;
}

/**
 * Display currency for browsing: cookie choice + the zone of the buyer's
 * default saved address (guests and address-less buyers get the DEFAULT-zone
 * rate until checkout pins the delivery governorate).
 */
/** Per-zone rate map so checkout matches the delivery address the buyer picks. */
export type ZoneRates = {
  code: DisplayCurrencyCode;
  byZone: Record<CurrencyZone, number>;
};

export async function getZoneRates(
  code: DisplayCurrencyCode,
): Promise<ZoneRates> {
  const byZone = { DEFAULT: 1, NORTH: 1, SOUTH: 1 } as Record<
    CurrencyZone,
    number
  >;
  if (code === "USD") return { code, byZone };
  const rows = (
    await prisma.exchangeRate.findMany({
      where: { currency: code },
      select: { currency: true, zone: true, rate: true },
    })
  ).map((r) => ({ ...r, rate: Number(r.rate) }));
  for (const zone of CURRENCY_ZONES) {
    const rate = pickRate(rows, code, zone);
    // No configured rate at all → fail safe to USD for every zone.
    if (rate == null) return { code: "USD", byZone };
    byZone[zone] = rate;
  }
  return { code, byZone };
}

export const getRequestDisplayCurrency = cache(
  async (): Promise<DisplayCurrency> => {
    // Lazy import: pulling next-auth in statically would drag its Next.js
    // runtime deps into everything that imports this module (e.g. lib/search
    // via its callers), which breaks non-Next contexts like the test runner.
    const { auth } = await import("@/auth");
    const session = await auth();
    return getDisplayCurrency(session?.user?.id);
  },
);

export async function getDisplayCurrency(
  userId?: string | null,
): Promise<DisplayCurrency> {
  const code = await getDisplayCurrencyCode();
  if (code === "USD") return USD_DISPLAY;
  // Explicit rial-market pick wins over everything.
  const preferred = await getPreferredZone();
  if (preferred) return getRateFor(code, null, preferred);
  if (userId) {
    // Otherwise the buyer's home governorate (chosen at signup) sets the
    // default market; then the default shipping address; then the fallback.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { homeGovernorate: true },
    });
    if (user?.homeGovernorate) return getRateFor(code, user.homeGovernorate);
    const address = await prisma.address.findFirst({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: { governorate: true },
    });
    return getRateFor(code, address?.governorate);
  }
  return getRateFor(code, null);
}

// Server-side display-currency resolution (DECISIONS.md §3). The buyer picks
// a display currency (cookie); the YER rate additionally depends on their
// currency zone, resolved from a governorate — the delivery address at
// checkout, or the default saved address while browsing.
import { cache } from "react";
import { cookies } from "next/headers";

import {
  CURRENCY_ZONES,
  DISPLAY_CURRENCY_COOKIE,
  isDisplayCurrency,
  pickRate,
  USD_DISPLAY,
  zoneForGovernorate,
  type CurrencyZone,
  type DisplayCurrency,
  type DisplayCurrencyCode,
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

/** Rate for a currency in the zone of `governorate` (DEFAULT-zone fallback). */
export async function getRateFor(
  code: DisplayCurrencyCode,
  governorate: string | null | undefined,
): Promise<DisplayCurrency> {
  if (code === "USD") return USD_DISPLAY;
  const rows = await prisma.exchangeRate.findMany({
    where: { currency: code },
    select: { currency: true, zone: true, rate: true },
  });
  const rate = pickRate(
    rows.map((r) => ({ ...r, rate: Number(r.rate) })),
    code,
    zoneForGovernorate(governorate),
  );
  // No configured rate → fail safe to USD rather than show a wrong price.
  return rate ? { code, rate } : USD_DISPLAY;
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
  const address = userId
    ? await prisma.address.findFirst({
        where: { userId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        select: { governorate: true },
      })
    : null;
  return getRateFor(code, address?.governorate);
}

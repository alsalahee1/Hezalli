// Client-safe currency primitives (DECISIONS.md §3). Prices are stored in
// USD; buyers view them converted at admin-managed rates. Yemen's rial
// circulates at two very different values — the old rial around Sana'a and
// the floating rial around Aden — so YER rates are keyed by a currency
// *zone* derived from the governorate, not a single national rate.

export const DISPLAY_CURRENCY_COOKIE = "hz_currency";
// Buyer's explicit rial-market choice (NORTH = Sana'a old rial, SOUTH = Aden
// new rial). When set it overrides the address-derived zone for *browsing*
// display; the checkout snapshot always uses the delivery address's zone so a
// COD courier collects in the rial that circulates at the destination.
export const CURRENCY_ZONE_COOKIE = "hz_currency_zone";

export const DISPLAY_CURRENCIES = ["USD", "YER", "SAR", "AED"] as const;
export type DisplayCurrencyCode = (typeof DISPLAY_CURRENCIES)[number];

export const CURRENCY_ZONES = ["DEFAULT", "NORTH", "SOUTH"] as const;
export type CurrencyZone = (typeof CURRENCY_ZONES)[number];

export function isDisplayCurrency(
  value: string | undefined,
): value is DisplayCurrencyCode {
  return !!value && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

/** The two rial markets a buyer can explicitly pick between. */
export const SELECTABLE_ZONES = ["NORTH", "SOUTH"] as const;
export type SelectableZone = (typeof SELECTABLE_ZONES)[number];

export function isSelectableZone(
  value: string | undefined,
): value is SelectableZone {
  return value === "NORTH" || value === "SOUTH";
}

/**
 * Coerce a resolved zone to one of the two buyer-facing rial markets. The
 * DEFAULT fallback row is seeded/managed at the floating (Aden) value, so it
 * presents as SOUTH.
 */
export function selectableZoneOf(
  zone: CurrencyZone | undefined,
): SelectableZone {
  return zone === "NORTH" ? "NORTH" : "SOUTH";
}

// Governorates where the old (pre-2016-issue) rial circulates. Everything
// else on the GOVERNORATES list (lib/yemen.ts) uses the floating rial —
// zoneForGovernorate falls through to SOUTH so a new governorate value never
// silently lands on the wrong unique key.
const NORTH_GOVERNORATES = new Set([
  "Amanat Al Asimah",
  "Sana'a",
  "Al Hudaydah",
  "Ibb",
  "Dhamar",
  "Hajjah",
  "Sa'dah",
  "Al Mahwit",
  "Amran",
  "Raymah",
  "Al Jawf",
  "Al Bayda",
]);

/** Currency zone for a stored governorate value; DEFAULT when unknown. */
export function zoneForGovernorate(
  governorate: string | null | undefined,
): CurrencyZone {
  if (!governorate) return "DEFAULT";
  return NORTH_GOVERNORATES.has(governorate) ? "NORTH" : "SOUTH";
}

/** The display-conversion snapshot a page renders prices with. */
export type DisplayCurrency = {
  code: DisplayCurrencyCode;
  /** Units of `code` per 1 USD. Always 1 for USD. */
  rate: number;
  /** The currency zone the rate was resolved for (meaningful for YER). */
  zone?: CurrencyZone;
};

export const USD_DISPLAY: DisplayCurrency = { code: "USD", rate: 1 };

type RateRow = { currency: string; zone: string; rate: number };

/** Zone-specific rate, falling back to the DEFAULT-zone row, else null. */
export function pickRate(
  rows: RateRow[],
  currency: DisplayCurrencyCode,
  zone: CurrencyZone,
): number | null {
  const exact = rows.find((r) => r.currency === currency && r.zone === zone);
  if (exact && exact.rate > 0) return exact.rate;
  const fallback = rows.find(
    (r) => r.currency === currency && r.zone === "DEFAULT",
  );
  return fallback && fallback.rate > 0 ? fallback.rate : null;
}

/**
 * Format a stored-USD amount in the buyer's display currency. Rial amounts
 * are large and have no circulating sub-unit, so YER rounds to whole rials.
 */
export function formatMoney(
  usd: number,
  display: DisplayCurrency,
  locale: string,
): string {
  const code = display.rate > 0 ? display.code : "USD";
  const rate = display.rate > 0 ? display.rate : 1;
  return new Intl.NumberFormat(locale === "ar" ? "ar" : "en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: code === "YER" ? 0 : 2,
  }).format(usd * rate);
}

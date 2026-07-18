// Scheduled discounts. A seller sets a sale price (`price`) with the original
// kept in `compareAtPrice`, optionally bounded by a [saleStartsAt, saleEndsAt]
// window. Inside the window the sale is live (charged at `price`, `compareAt`
// struck through); outside a set window the item reverts to the original price.
// With no window, a compareAt is treated as an always-on discount (unchanged).

type Decimalish = { toString(): string } | number | null;

export type PricedVariant = {
  price: Decimalish;
  compareAtPrice: Decimalish;
  saleStartsAt: Date | string | null;
  saleEndsAt: Date | string | null;
};

const n = (v: Decimalish): number => (v == null ? 0 : Number(v));
const time = (v: Date | string | null): number | null =>
  v == null ? null : new Date(v).getTime();

export function saleActive(v: PricedVariant, now = Date.now()): boolean {
  if (v.compareAtPrice == null) return false;
  const start = time(v.saleStartsAt);
  const end = time(v.saleEndsAt);
  if (start != null && now < start) return false;
  if (end != null && now > end) return false;
  return true;
}

// Effective charged price + strike-through price for a variant right now.
export function effectivePrice(
  v: PricedVariant,
  now = Date.now(),
): { price: number; compareAt: number | null } {
  const price = n(v.price);
  const compareAt = v.compareAtPrice == null ? null : n(v.compareAtPrice);
  if (compareAt == null) return { price, compareAt: null };

  const hasWindow = v.saleStartsAt != null || v.saleEndsAt != null;
  if (hasWindow && !saleActive(v, now)) {
    // Outside the scheduled window → revert to the original price.
    return { price: compareAt, compareAt: null };
  }
  return { price, compareAt };
}

// Shared product helpers for the buyer-facing catalog (Phase 6+).
// Prices are stored in USD; display-currency conversion is a later concern.
import { localizedName } from "@/lib/categories";

export function formatUsd(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

type VariantLike = {
  price: unknown;
  compareAtPrice?: unknown;
  stock?: number;
  isActive?: boolean;
};

/** Cheapest active variant's price + its compare-at (for strike-through). */
export function priceInfo(variants: VariantLike[]) {
  const active = variants.filter((v) => v.isActive !== false);
  const pool = active.length ? active : variants;
  let min = Infinity;
  let cheapest: VariantLike | undefined;
  for (const v of pool) {
    const p = Number(v.price);
    if (Number.isFinite(p) && p < min) {
      min = p;
      cheapest = v;
    }
  }
  if (!Number.isFinite(min)) min = 0;
  const max = pool.reduce((m, v) => Math.max(m, Number(v.price) || 0), min);
  const compareAt =
    cheapest?.compareAtPrice != null ? Number(cheapest.compareAtPrice) : null;
  const onSale = compareAt != null && compareAt > min;
  const pctOff = onSale ? Math.round((1 - min / compareAt) * 100) : null;
  const totalStock = pool.reduce((s, v) => s + (v.stock ?? 0), 0);
  return { min, max, compareAt: onSale ? compareAt : null, pctOff, totalStock };
}

export type ProductCardItem = {
  id: string;
  slug: string;
  title: string;
  cover: string | null;
  priceLabel: string;
  priceMaxLabel: string | null; // set when the product has a price range
  compareAtLabel: string | null;
  pctOff: number | null;
  rating: number;
  ratingCount: number;
  condition: "NEW" | "USED";
  outOfStock: boolean;
  storeName?: string;
};

type CardSource = {
  id: string;
  slug: string;
  title: unknown;
  condition: "NEW" | "USED";
  ratingAvg: number;
  ratingCount: number;
  images: { url: string }[];
  variants: VariantLike[];
  store?: { name: string } | null;
};

/** Map a queried product (with images + variants) to a display card item. */
export function toCardItem(p: CardSource, locale: string): ProductCardItem {
  const { min, max, compareAt, pctOff, totalStock } = priceInfo(p.variants);
  return {
    id: p.id,
    slug: p.slug,
    title: localizedName(p.title, locale),
    cover: p.images[0]?.url ?? null,
    priceLabel: formatUsd(min, locale),
    priceMaxLabel: max > min ? formatUsd(max, locale) : null,
    compareAtLabel: compareAt != null ? formatUsd(compareAt, locale) : null,
    pctOff,
    rating: p.ratingAvg,
    ratingCount: p.ratingCount,
    condition: p.condition,
    outOfStock: totalStock <= 0,
    storeName: p.store?.name ?? undefined,
  };
}

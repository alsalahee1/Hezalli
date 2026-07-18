// Pure listing types + URL parsing, safe to import from client components
// (no Prisma / server-only imports). The query engine lives in lib/search.ts.

export const SORT_KEYS = [
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
  "top_rated",
  "best_selling",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const PAGE_SIZE = 24;

export type ListingParams = {
  q: string;
  category: string; // category slug ("" = any)
  brand: string; // brand slug
  seller: string; // store slug
  minPrice: number | null;
  maxPrice: number | null;
  rating: number | null; // minimum average rating
  condition: "NEW" | "USED" | "";
  instock: boolean;
  sort: SortKey;
  page: number;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : (v ?? "")).trim();
}
function num(v: string | string[] | undefined): number | null {
  const s = str(v);
  const n = Number(s);
  return Number.isFinite(n) && s !== "" ? n : null;
}

export function parseListingParams(sp: RawSearchParams): ListingParams {
  const sortRaw = str(sp.sort) as SortKey;
  const cond = str(sp.condition).toUpperCase();
  return {
    q: str(sp.q),
    category: str(sp.category),
    brand: str(sp.brand),
    seller: str(sp.seller),
    minPrice: num(sp.minPrice),
    maxPrice: num(sp.maxPrice),
    rating: num(sp.rating),
    condition: cond === "NEW" || cond === "USED" ? cond : "",
    instock: str(sp.instock) === "1",
    sort: SORT_KEYS.includes(sortRaw) ? sortRaw : "relevance",
    page: Math.max(1, Number(str(sp.page)) || 1),
  };
}

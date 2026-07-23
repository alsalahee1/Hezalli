// Shared listing engine for /search and /c/[slug] (Step 6.2).
//
// Text matching uses Postgres full-text search (to_tsvector/plainto_tsquery,
// 'simple' config so it works for both Arabic and English without stemming).
// Everything else — filters, facet counts, sorting, pagination — runs over the
// matched set with Prisma. At catalog scale this is plenty; Meilisearch can
// replace the text layer later (Phase 17) without changing the callers.
import { localizedName } from "@/lib/categories";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  PAGE_SIZE,
  parseListingParams,
  type ListingParams,
  type RawSearchParams,
} from "@/lib/listing";
import { prisma } from "@/lib/prisma";
import { type DisplayCurrency } from "@/lib/currency-constants";
import { toCardItem, type ProductCardItem } from "@/lib/products";

// Product-only text expression. MUST stay byte-identical to the expression in the
// GIN index (migration 20260720130000) so the planner uses the index instead of
// recomputing a tsvector for every ACTIVE product per query.
const PROD_FTS_EXPR = `to_tsvector('simple',
  coalesce(p.title->>'en','') || ' ' || coalesce(p.title->>'ar','') || ' ' ||
  coalesce(p.description->>'en','') || ' ' || coalesce(p.description->>'ar',''))`;

/**
 * Full-text match → map of productId → relevance rank. Product title/description
 * matches use the GIN index above; brand-name matches (a small table) are unioned
 * in with a low constant rank so they sort below direct text hits.
 */
async function ftsRanks(q: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<{ id: string; rank: number }[]>(
    `SELECT p.id, ts_rank(${PROD_FTS_EXPR}, plainto_tsquery('simple', $1))::float AS rank
       FROM "Product" p
      WHERE p.status = 'ACTIVE'
        AND ${PROD_FTS_EXPR} @@ plainto_tsquery('simple', $1)
     UNION
     SELECT p.id, 0.01::float AS rank
       FROM "Product" p
       JOIN "Brand" b ON b.id = p."brandId"
      WHERE p.status = 'ACTIVE'
        AND to_tsvector('simple', coalesce(b.name, '')) @@ plainto_tsquery('simple', $1)`,
    q,
  );
  // A product can match on both text and brand — keep the higher rank.
  const ranks = new Map<string, number>();
  for (const r of rows) {
    const rank = Number(r.rank);
    ranks.set(r.id, Math.max(ranks.get(r.id) ?? 0, rank));
  }
  return ranks;
}

/** Build the Prisma filter, optionally ignoring one dimension (for facets). */
function buildWhere(
  p: ListingParams,
  ids: string[] | null,
  skip?: "category" | "brand" | "seller" | "price",
): Prisma.ProductWhereInput {
  // Only show products from active stores (suspended or on-vacation are hidden).
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    store: { status: "ACTIVE", isOnVacation: false },
  };
  if (ids) where.id = { in: ids };
  if (p.category && skip !== "category") where.category = { slug: p.category };
  if (p.brand && skip !== "brand") where.brand = { slug: p.brand };
  if (p.seller && skip !== "seller")
    where.store = { slug: p.seller, status: "ACTIVE", isOnVacation: false };
  if (p.condition) where.condition = p.condition;
  if (p.rating != null) where.ratingAvg = { gte: p.rating };

  const variant: Prisma.ProductVariantWhereInput = { isActive: true };
  let variantFiltered = false;
  if (p.instock) {
    variant.stock = { gt: 0 };
    variantFiltered = true;
  }
  if (skip !== "price" && (p.minPrice != null || p.maxPrice != null)) {
    variant.price = {};
    if (p.minPrice != null) variant.price.gte = p.minPrice;
    if (p.maxPrice != null) variant.price.lte = p.maxPrice;
    variantFiltered = true;
  }
  if (variantFiltered) where.variants = { some: variant };
  return where;
}

export type Facets = {
  categories: {
    slug: string;
    name: string;
    icon: string | null;
    count: number;
  }[];
  brands: { slug: string; name: string; count: number }[];
  sellers: { slug: string; name: string; count: number }[];
  priceBounds: { min: number; max: number } | null;
};

export type ListingResult = {
  items: ProductCardItem[];
  total: number;
  page: number;
  totalPages: number;
  facets: Facets;
  params: ListingParams;
};

// The exact product projection toCardItem() consumes.
const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  condition: true,
  ratingAvg: true,
  ratingCount: true,
  createdAt: true,
  images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
  variants: {
    where: { isActive: true },
    select: { id: true, price: true, compareAtPrice: true, stock: true },
  },
  store: { select: { name: true } },
} satisfies Prisma.ProductSelect;

/**
 * Resolve the ordered product ids for the requested page. Column-based sorts
 * (newest / top_rated / no-query relevance) paginate directly in SQL — no scan.
 * The computed sorts (price / best_selling / query relevance) still rank the
 * matched set, but over a lightweight id+price projection rather than full card
 * data, and only the page's ids flow on to the heavy card fetch.
 */
async function pageProductIds(
  where: Prisma.ProductWhereInput,
  params: ListingParams,
  ranks: Map<string, number> | null,
  skip: number,
  take: number,
): Promise<string[]> {
  if (params.sort === "newest" || (params.sort === "relevance" && !ranks)) {
    const rows = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  if (params.sort === "top_rated") {
    const rows = await prisma.product.findMany({
      where,
      orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
      skip,
      take,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // Computed sorts: rank the matched set over a minimal projection.
  const rows = await prisma.product.findMany({
    where,
    select: {
      id: true,
      variants: {
        where: { isActive: true },
        select: { id: true, price: true },
      },
    },
  });

  let keyed: { id: string; key: number }[];
  if (params.sort === "best_selling") {
    const variantIds = rows.flatMap((r) => r.variants.map((v) => v.id));
    const soldByProduct = new Map<string, number>();
    if (variantIds.length) {
      const grouped = await prisma.orderItem.groupBy({
        by: ["variantId"],
        where: {
          variantId: { in: variantIds },
          subOrder: { status: "COMPLETED" },
        },
        _sum: { quantity: true },
      });
      const soldByVariant = new Map(
        grouped.map((g) => [g.variantId, g._sum.quantity ?? 0]),
      );
      for (const r of rows) {
        let s = 0;
        for (const v of r.variants) s += soldByVariant.get(v.id) ?? 0;
        soldByProduct.set(r.id, s);
      }
    }
    keyed = rows.map((r) => ({ id: r.id, key: soldByProduct.get(r.id) ?? 0 }));
    keyed.sort((a, b) => b.key - a.key);
  } else if (params.sort === "price_asc" || params.sort === "price_desc") {
    const minPriceOf = (r: (typeof rows)[number]) =>
      r.variants.length
        ? Math.min(...r.variants.map((v) => Number(v.price)))
        : Number.POSITIVE_INFINITY;
    keyed = rows.map((r) => ({ id: r.id, key: minPriceOf(r) }));
    keyed.sort((a, b) =>
      params.sort === "price_asc" ? a.key - b.key : b.key - a.key,
    );
  } else {
    // relevance with a query: order by FTS rank.
    keyed = rows.map((r) => ({ id: r.id, key: ranks?.get(r.id) ?? 0 }));
    keyed.sort((a, b) => b.key - a.key);
  }
  return keyed.slice(skip, skip + take).map((k) => k.id);
}

export async function getListing(
  sp: RawSearchParams,
  locale: string,
  opts: { categorySlug?: string; display?: DisplayCurrency } = {},
): Promise<ListingResult> {
  const params = parseListingParams(sp);
  if (opts.categorySlug) params.category = opts.categorySlug;

  const ranks = params.q ? await ftsRanks(params.q) : null;
  const ftsIdList = ranks ? [...ranks.keys()] : null;
  // A search that matched nothing → short-circuit to an empty result.
  if (ranks && ftsIdList!.length === 0) {
    return emptyResult(params, locale);
  }

  const where = buildWhere(params, ftsIdList);

  // Total is an indexed count; pagination + ordering are resolved to a page of
  // ids without materializing the whole catalog's card data.
  const total = await prisma.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const skip = (page - 1) * PAGE_SIZE;

  const [pageIds, facets] = await Promise.all([
    pageProductIds(where, params, ranks, skip, PAGE_SIZE),
    buildFacets(params, ftsIdList, locale),
  ]);

  // Heavy card fetch for just this page, re-ordered to match the ranking.
  const cards = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    select: CARD_SELECT,
  });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const items = pageIds
    .map((id) => byId.get(id))
    .filter((c): c is (typeof cards)[number] => Boolean(c))
    .map((m) => toCardItem(m, locale, opts.display));

  return { items, total, page, totalPages, facets, params };
}

async function buildFacets(
  params: ListingParams,
  ids: string[] | null,
  locale: string,
): Promise<Facets> {
  const [catGroups, brandGroups, sellerGroups, priceAgg] = await Promise.all([
    prisma.product.groupBy({
      by: ["categoryId"],
      where: buildWhere(params, ids, "category"),
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ["brandId"],
      where: buildWhere(params, ids, "brand"),
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ["storeId"],
      where: buildWhere(params, ids, "seller"),
      _count: { _all: true },
    }),
    prisma.productVariant.aggregate({
      where: {
        isActive: true,
        product: buildWhere(params, ids, "price"),
      },
      _min: { price: true },
      _max: { price: true },
    }),
  ]);

  // Only load the category/brand/store records that actually appear in the
  // results — never the whole tables.
  const catIds = catGroups.map((g) => g.categoryId);
  const brandIds = brandGroups
    .map((g) => g.brandId)
    .filter((x): x is string => Boolean(x));
  const storeIds = sellerGroups.map((g) => g.storeId);
  const [categories, brands, stores] = await Promise.all([
    catIds.length
      ? prisma.category.findMany({
          where: { id: { in: catIds } },
          select: { id: true, slug: true, name: true, icon: true },
        })
      : [],
    brandIds.length
      ? prisma.brand.findMany({
          where: { id: { in: brandIds } },
          select: { id: true, slug: true, name: true },
        })
      : [],
    storeIds.length
      ? prisma.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, slug: true, name: true },
        })
      : [],
  ]);

  const catCount = new Map(catGroups.map((g) => [g.categoryId, g._count._all]));
  const brandCount = new Map(
    brandGroups.map((g) => [g.brandId, g._count._all]),
  );
  const sellerCount = new Map(
    sellerGroups.map((g) => [g.storeId, g._count._all]),
  );

  const cats = categories
    .map((c) => ({
      slug: c.slug,
      name: localizedName(c.name, locale),
      icon: c.icon,
      count: catCount.get(c.id) ?? 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const brandFacets = brands
    .map((b) => ({
      slug: b.slug,
      name: b.name,
      count: brandCount.get(b.id) ?? 0,
    }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);

  const sellerFacets = stores
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      count: sellerCount.get(s.id) ?? 0,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const priceBounds =
    priceAgg._min.price != null && priceAgg._max.price != null
      ? {
          min: Math.floor(Number(priceAgg._min.price)),
          max: Math.ceil(Number(priceAgg._max.price)),
        }
      : null;

  return {
    categories: cats,
    brands: brandFacets,
    sellers: sellerFacets,
    priceBounds,
  };
}

function emptyResult(params: ListingParams, locale: string): ListingResult {
  void locale;
  return {
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    facets: { categories: [], brands: [], sellers: [], priceBounds: null },
    params,
  };
}

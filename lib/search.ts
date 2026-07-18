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
import { toCardItem, type ProductCardItem } from "@/lib/products";

const FTS_EXPR = `to_tsvector('simple',
  coalesce(p.title->>'en','') || ' ' || coalesce(p.title->>'ar','') || ' ' ||
  coalesce(p.description->>'en','') || ' ' || coalesce(p.description->>'ar','') || ' ' ||
  coalesce(b.name,''))`;

/** Full-text match → map of productId → relevance rank. */
async function ftsRanks(q: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<{ id: string; rank: number }[]>(
    `SELECT p.id, ts_rank(${FTS_EXPR}, plainto_tsquery('simple', $1))::float AS rank
     FROM "Product" p
     LEFT JOIN "Brand" b ON b.id = p."brandId"
     WHERE p.status = 'ACTIVE' AND ${FTS_EXPR} @@ plainto_tsquery('simple', $1)`,
    q,
  );
  return new Map(rows.map((r) => [r.id, Number(r.rank)]));
}

/** Build the Prisma filter, optionally ignoring one dimension (for facets). */
function buildWhere(
  p: ListingParams,
  ids: string[] | null,
  skip?: "category" | "brand" | "seller" | "price",
): Prisma.ProductWhereInput {
  // Only show products from active stores (suspended stores are hidden).
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    store: { status: "ACTIVE" },
  };
  if (ids) where.id = { in: ids };
  if (p.category && skip !== "category") where.category = { slug: p.category };
  if (p.brand && skip !== "brand") where.brand = { slug: p.brand };
  if (p.seller && skip !== "seller")
    where.store = { slug: p.seller, status: "ACTIVE" };
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

export async function getListing(
  sp: RawSearchParams,
  locale: string,
  opts: { categorySlug?: string } = {},
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

  const matched = await prisma.product.findMany({
    where,
    select: {
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
    },
  });

  // Sold counts (for best-selling) over the matched products' variants.
  const variantIds = matched.flatMap((m) => m.variants.map((v) => v.id));
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
    for (const m of matched) {
      let s = 0;
      for (const v of m.variants) s += soldByVariant.get(v.id) ?? 0;
      soldByProduct.set(m.id, s);
    }
  }

  const minPriceOf = (m: (typeof matched)[number]) =>
    m.variants.length
      ? Math.min(...m.variants.map((v) => Number(v.price)))
      : Number.POSITIVE_INFINITY;

  const sorted = [...matched].sort((a, b) => {
    switch (params.sort) {
      case "newest":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "price_asc":
        return minPriceOf(a) - minPriceOf(b);
      case "price_desc":
        return minPriceOf(b) - minPriceOf(a);
      case "top_rated":
        return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
      case "best_selling":
        return (soldByProduct.get(b.id) ?? 0) - (soldByProduct.get(a.id) ?? 0);
      case "relevance":
      default:
        if (ranks) return (ranks.get(b.id) ?? 0) - (ranks.get(a.id) ?? 0);
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const items = pageItems.map((m) => toCardItem(m, locale));

  const facets = await buildFacets(params, ftsIdList, locale);

  return { items, total, page, totalPages, facets, params };
}

async function buildFacets(
  params: ListingParams,
  ids: string[] | null,
  locale: string,
): Promise<Facets> {
  const [
    catGroups,
    brandGroups,
    sellerGroups,
    priceAgg,
    categories,
    brands,
    stores,
  ] = await Promise.all([
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
    prisma.category.findMany({
      select: { id: true, slug: true, name: true, icon: true },
    }),
    prisma.brand.findMany({ select: { id: true, slug: true, name: true } }),
    prisma.store.findMany({ select: { id: true, slug: true, name: true } }),
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

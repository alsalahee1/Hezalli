// Reviews: querying, summaries, and denormalized rating recomputation. Product
// and store rating fields are kept in sync so cards/search stay fast. Hidden
// (moderated) reviews are excluded everywhere.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const REVIEW_SORTS = ["newest", "highest", "lowest", "photos"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
export const REVIEWS_PAGE_SIZE = 8;

export function parseReviewSort(v: string | undefined): ReviewSort {
  return (REVIEW_SORTS as readonly string[]).includes(v ?? "")
    ? (v as ReviewSort)
    : "newest";
}

export async function getReviewSummary(productId: string) {
  const rows = await prisma.review.groupBy({
    by: ["rating"],
    where: { productId, hidden: false },
    _count: { _all: true },
  });
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    dist[r.rating] = r._count._all;
    count += r._count._all;
    sum += r.rating * r._count._all;
  }
  return { avg: count ? sum / count : 0, count, dist };
}

export async function getReviews(
  productId: string,
  sort: ReviewSort,
  page: number,
) {
  const where: Prisma.ReviewWhereInput = {
    productId,
    hidden: false,
    ...(sort === "photos" ? { images: { some: {} } } : {}),
  };
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
    sort === "highest"
      ? [{ rating: "desc" }, { createdAt: "desc" }]
      : sort === "lowest"
        ? [{ rating: "asc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];
  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy,
      skip: (page - 1) * REVIEWS_PAGE_SIZE,
      take: REVIEWS_PAGE_SIZE,
      include: {
        images: true,
        buyer: { select: { name: true, image: true } },
      },
    }),
  ]);
  return { total, reviews };
}

// Recompute a product's denormalized rating, then its store's rating.
export async function recomputeProductRating(productId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { productId, hidden: false },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAvg: Number((agg._avg.rating ?? 0).toFixed(2)),
      ratingCount: agg._count._all,
    },
    select: { storeId: true },
  });
  await recomputeStoreRating(product.storeId);
}

// Store rating = average over all non-hidden reviews of the store's products.
export async function recomputeStoreRating(storeId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { hidden: false, product: { storeId } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.store.update({
    where: { id: storeId },
    data: {
      ratingAvg: Number((agg._avg.rating ?? 0).toFixed(2)),
      ratingCount: agg._count._all,
    },
  });
}

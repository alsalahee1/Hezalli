// Aggregated buyer ratings per courier, for the admin fleet views.
import { prisma } from "@/lib/prisma";

export type CourierRating = { avg: number; count: number };

// One row per courier who has at least one rating: average stars (1 dp) + count.
export async function courierRatingsByCourier(): Promise<
  Map<string, CourierRating>
> {
  const grouped = await prisma.deliveryRating.groupBy({
    by: ["courierId"],
    _avg: { stars: true },
    _count: { _all: true },
  });
  return new Map(
    grouped.map((g) => [
      g.courierId,
      { avg: round1(g._avg.stars ?? 0), count: g._count._all },
    ]),
  );
}

// A single courier's rating summary (avg + count; count 0 = never rated).
export async function courierRating(courierId: string): Promise<CourierRating> {
  const agg = await prisma.deliveryRating.aggregate({
    where: { courierId },
    _avg: { stars: true },
    _count: { _all: true },
  });
  return { avg: round1(agg._avg.stars ?? 0), count: agg._count._all };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

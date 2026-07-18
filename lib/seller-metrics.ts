// Seller sales analytics (Step 17.7 / 17.2). All aggregates are computed in
// SQL — never JS loops over rows. Revenue counts items sold on sub-orders that
// weren't cancelled or refunded; net earnings are realized on COMPLETED
// sub-orders. Per-product traffic uses the lifetime Product.views counter.
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

const DAY_MS = 86_400_000;
const LIVE = ["CANCELLED", "REFUNDED"];

export type TopProduct = {
  id: string;
  slug: string;
  title: Prisma.JsonValue;
  units: number;
  revenue: number;
  orders: number;
  views: number;
  conversion: number | null; // orders / views, or null when never viewed
};

export type SellerAnalytics = {
  days: number;
  revenue: number;
  prevRevenue: number;
  netEarnings: number;
  orders: number;
  prevOrders: number;
  units: number;
  aov: number;
  salesByDay: { day: string; total: number }[];
  topProducts: TopProduct[];
};

function pctChange(now: number, prev: number): number | null {
  if (prev === 0) return now === 0 ? 0 : null; // null → "new" (no baseline)
  return round2(((now - prev) / prev) * 100);
}

export async function sellerAnalytics(
  storeId: string,
  days = 30,
): Promise<
  SellerAnalytics & {
    revenueChange: number | null;
    ordersChange: number | null;
  }
> {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  since.setTime(since.getTime() - (days - 1) * DAY_MS); // inclusive window start
  const prevSince = new Date(since.getTime() - days * DAY_MS);

  const liveWindow: Prisma.SubOrderWhereInput = {
    storeId,
    createdAt: { gte: since },
    status: { notIn: LIVE as never },
  };

  const [curr, prev, earned, unitsAgg, salesRaw, topRaw] = await Promise.all([
    prisma.subOrder.aggregate({
      _sum: { itemsTotal: true },
      _count: { _all: true },
      where: liveWindow,
    }),
    prisma.subOrder.aggregate({
      _sum: { itemsTotal: true },
      _count: { _all: true },
      where: {
        storeId,
        createdAt: { gte: prevSince, lt: since },
        status: { notIn: LIVE as never },
      },
    }),
    prisma.subOrder.aggregate({
      _sum: { sellerNet: true },
      where: { storeId, status: "COMPLETED", completedAt: { gte: since } },
    }),
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: { subOrder: liveWindow },
    }),
    prisma.$queryRaw<{ day: Date; total: number }[]>`
      SELECT date_trunc('day', so."createdAt") AS day,
             SUM(so."itemsTotal")::float AS total
      FROM "SubOrder" so
      WHERE so."storeId" = ${storeId}
        AND so."createdAt" >= ${since}
        AND so."status" NOT IN ('CANCELLED','REFUNDED')
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<
      {
        id: string;
        slug: string;
        title: Prisma.JsonValue;
        views: number;
        units: number;
        revenue: number;
        orders: number;
      }[]
    >`
      SELECT p.id, p.slug, p.title, p.views,
             SUM(oi.quantity)::int AS units,
             SUM(oi."lineTotal")::float AS revenue,
             COUNT(DISTINCT so.id)::int AS orders
      FROM "OrderItem" oi
      JOIN "SubOrder" so ON so.id = oi."subOrderId"
      JOIN "ProductVariant" v ON v.id = oi."variantId"
      JOIN "Product" p ON p.id = v."productId"
      WHERE so."storeId" = ${storeId}
        AND so."createdAt" >= ${since}
        AND so."status" NOT IN ('CANCELLED','REFUNDED')
      GROUP BY p.id
      ORDER BY units DESC, revenue DESC
      LIMIT 8`,
  ]);

  const revenue = round2(Number(curr._sum.itemsTotal ?? 0));
  const prevRevenue = round2(Number(prev._sum.itemsTotal ?? 0));
  const orders = curr._count._all;
  const prevOrders = prev._count._all;
  const units = Number(unitsAgg._sum.quantity ?? 0);

  // Fill every day in the window so the chart shows a continuous series.
  const totalByDay = new Map(
    salesRaw.map((r) => [r.day.toISOString().slice(0, 10), Number(r.total)]),
  );
  const salesByDay: { day: string; total: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    salesByDay.push({ day: d, total: round2(totalByDay.get(d) ?? 0) });
  }

  const topProducts: TopProduct[] = topRaw.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    units: Number(r.units),
    revenue: round2(Number(r.revenue)),
    orders: Number(r.orders),
    views: Number(r.views),
    conversion:
      Number(r.views) > 0
        ? round2((Number(r.orders) / Number(r.views)) * 100)
        : null,
  }));

  return {
    days,
    revenue,
    prevRevenue,
    netEarnings: round2(Number(earned._sum.sellerNet ?? 0)),
    orders,
    prevOrders,
    units,
    aov: orders > 0 ? round2(revenue / orders) : 0,
    salesByDay,
    topProducts,
    revenueChange: pctChange(revenue, prevRevenue),
    ordersChange: pctChange(orders, prevOrders),
  };
}

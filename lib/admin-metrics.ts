// Admin KPI + report aggregates. All computed in SQL (aggregate/groupBy),
// never JS loops over rows. GMV counts placed orders that weren't cancelled or
// refunded; commission earned is realized on COMPLETED sub-orders.
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

const LIVE_ORDER = { notIn: ["CANCELLED", "REFUNDED"] as string[] };

export async function dashboardKpis() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    gmvMonth,
    gmvToday,
    ordersMonth,
    newUsersMonth,
    newSellers,
    activeDisputes,
    pendingPayouts,
    ordersByStatusRows,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: { createdAt: { gte: startOfMonth }, status: LIVE_ORDER as never },
    }),
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: { createdAt: { gte: startOfDay }, status: LIVE_ORDER as never },
    }),
    prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.sellerProfile.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.dispute.count({
      where: { status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }),
    prisma.payout.count({
      where: { status: { in: ["REQUESTED", "APPROVED"] } },
    }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const ordersByStatus: Record<string, number> = {};
  for (const r of ordersByStatusRows) ordersByStatus[r.status] = r._count._all;

  // Sales for the last 14 days (SQL date bucketing).
  const salesByDay = await prisma.$queryRaw<{ day: Date; total: number }[]>`
    SELECT date_trunc('day', "createdAt") AS day, SUM("grandTotal")::float AS total
    FROM "Order"
    WHERE "createdAt" >= ${new Date(now.getTime() - 13 * 86_400_000)}
      AND "status" NOT IN ('CANCELLED','REFUNDED')
    GROUP BY 1 ORDER BY 1`;

  return {
    gmvMonth: round2(Number(gmvMonth._sum.grandTotal ?? 0)),
    gmvToday: round2(Number(gmvToday._sum.grandTotal ?? 0)),
    ordersMonth,
    newUsersMonth,
    newSellers,
    activeDisputes,
    pendingPayouts,
    ordersByStatus,
    salesByDay: salesByDay.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      total: round2(Number(r.total)),
    })),
  };
}

export async function reportSummary(from: Date, to: Date) {
  const [orders, refunds, payouts, commissionRows] = await Promise.all([
    prisma.order.aggregate({
      _sum: {
        grandTotal: true,
        itemsTotal: true,
        shippingTotal: true,
        discountTotal: true,
      },
      _count: { _all: true },
      where: { createdAt: { gte: from, lte: to }, status: LIVE_ORDER as never },
    }),
    prisma.refund.aggregate({
      _sum: { amountUsd: true },
      _count: { _all: true },
      where: { createdAt: { gte: from, lte: to } },
    }),
    prisma.payout.aggregate({
      _sum: { amountUsd: true },
      _count: { _all: true },
      where: { status: "PAID", processedAt: { gte: from, lte: to } },
    }),
    prisma.subOrder.aggregate({
      _sum: { commissionAmt: true },
      where: { status: "COMPLETED", completedAt: { gte: from, lte: to } },
    }),
  ]);

  return {
    sales: round2(Number(orders._sum.grandTotal ?? 0)),
    itemsTotal: round2(Number(orders._sum.itemsTotal ?? 0)),
    shippingTotal: round2(Number(orders._sum.shippingTotal ?? 0)),
    discountTotal: round2(Number(orders._sum.discountTotal ?? 0)),
    ordersCount: orders._count._all,
    commission: round2(Number(commissionRows._sum.commissionAmt ?? 0)),
    refunds: round2(Number(refunds._sum.amountUsd ?? 0)),
    refundsCount: refunds._count._all,
    payouts: round2(Number(payouts._sum.amountUsd ?? 0)),
    payoutsCount: payouts._count._all,
  };
}

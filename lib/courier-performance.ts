// One courier's own performance figures + badges, for the driver app's
// "My performance" screen. Everything is derived from existing rows the same
// way lib/delivery-analytics.ts does for the admin fleet views — no new
// tables, no stored gamification state.
import {
  computeBadges,
  fiveStarStreak,
  STREAK_TARGET,
  type BadgeState,
  type CourierStats,
} from "@/lib/courier-badges";
import { courierRating } from "@/lib/courier-ratings";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { dueBy } from "@/lib/sla";

export type CourierPerformance = {
  stats: CourierStats;
  badges: BadgeState[];
  earnedCount: number;
};

export async function courierPerformance(
  courierId: string,
): Promise<CourierPerformance> {
  const [settings, delivered, rating, recentStars, dropOffs, verifiedDrops] =
    await Promise.all([
      getPlatformSettings(),
      prisma.shipment.findMany({
        where: { driverId: courierId, status: "DELIVERED" },
        select: {
          shippedAt: true,
          deliveredAt: true,
          attemptCount: true,
          subOrder: { select: { shippingMethod: true } },
        },
      }),
      courierRating(courierId),
      // Newest ratings; the streak can never exceed its target so this is all
      // we need to measure it.
      prisma.deliveryRating.findMany({
        where: { courierId },
        orderBy: { createdAt: "desc" },
        take: STREAK_TARGET,
        select: { stars: true },
      }),
      prisma.deliveryAttempt.count({
        where: { courierId, outcome: "DELIVERED" },
      }),
      prisma.deliveryAttempt.count({
        where: { courierId, outcome: "DELIVERED", codeVerified: true },
      }),
    ]);

  const etaMax = (method: string) =>
    method === "EXPRESS"
      ? settings.express_eta_max_days
      : settings.std_eta_max_days;

  let onTime = 0;
  let timedN = 0;
  let firstTry = 0;
  let attemptsN = 0;
  for (const s of delivered) {
    if (s.shippedAt && s.deliveredAt) {
      timedN += 1;
      if (
        s.deliveredAt <= dueBy(s.shippedAt, etaMax(s.subOrder.shippingMethod))
      )
        onTime += 1;
    }
    if (s.attemptCount > 0) {
      attemptsN += 1;
      if (s.attemptCount === 1) firstTry += 1;
    }
  }

  const pct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 100) : null;

  const stats: CourierStats = {
    deliveries: delivered.length,
    ratingAvg: rating.avg,
    ratingCount: rating.count,
    fiveStarStreak: fiveStarStreak(recentStars.map((r) => r.stars)),
    firstAttemptPct: pct(firstTry, attemptsN),
    onTimePct: pct(onTime, timedN),
    verifiedPct: pct(verifiedDrops, dropOffs),
  };
  const badges = computeBadges(stats);
  return {
    stats,
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
  };
}

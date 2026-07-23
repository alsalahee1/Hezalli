// One courier's own performance figures + badges, for the driver app's
// "My performance" screen. Stats are derived from existing rows the same way
// lib/delivery-analytics.ts does for the admin fleet views; earned badges are
// additionally persisted as CourierBadgeAward rows so they are permanent and
// so a NEW award can be detected and pushed to the driver's phone.
import { getTranslations } from "next-intl/server";

import {
  computeBadges,
  fiveStarStreak,
  STREAK_TARGET,
  type BadgeState,
  type CourierStats,
} from "@/lib/courier-badges";
import { courierRating } from "@/lib/courier-ratings";
import { notify } from "@/lib/notify";
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

// Localized display name for a badge, for notifications and public chips.
async function badgeName(b: BadgeState, locale: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Driver" });
  return b.kind === "milestone"
    ? t("badge_milestone", { target: b.target })
    : t(`badge_${b.id}`);
}

/**
 * Persist newly earned badges and congratulate the driver once per badge
 * (in-app notification + Web Push via lib/notify). Idempotent — the unique
 * (courierId, badgeId) pair means a badge is only ever awarded once. Returns
 * the merged performance where a stored award keeps its badge earned even if
 * the live rate behind it has since dipped.
 */
export async function syncedCourierPerformance(
  courierId: string,
): Promise<CourierPerformance & { newBadges: BadgeState[] }> {
  const perf = await courierPerformance(courierId);
  const stored = await prisma.courierBadgeAward.findMany({
    where: { courierId },
    select: { badgeId: true },
  });
  const have = new Set(stored.map((s) => s.badgeId));
  const fresh = perf.badges.filter((b) => b.earned && !have.has(b.id));

  if (fresh.length > 0) {
    await prisma.courierBadgeAward.createMany({
      data: fresh.map((b) => ({ courierId, badgeId: b.id })),
      skipDuplicates: true,
    });
    fresh.forEach((b) => have.add(b.id));

    // Congratulate the driver in their own language. Best-effort — a
    // notification failure must never fail the delivery/rating that earned
    // the badge.
    try {
      const user = await prisma.user.findUnique({
        where: { id: courierId },
        select: { locale: true },
      });
      const ar = user?.locale === "ar";
      const locale = ar ? "ar" : "en";
      for (const b of fresh) {
        const name = await badgeName(b, locale);
        await notify({
          userId: courierId,
          type: "SYSTEM",
          title: ar ? "شارة جديدة! 🏆" : "New badge earned! 🏆",
          body: ar
            ? `حصلت على شارة «${name}» — أحسنت، واصل العمل الرائع!`
            : `You earned the "${name}" badge — great work, keep it up!`,
          link: "/driver/stats",
        });
      }
    } catch (err) {
      console.error("[badges] notify failed", err);
    }
  }

  const badges = perf.badges.map((b) =>
    have.has(b.id) ? { ...b, earned: true, current: b.target } : b,
  );
  return {
    stats: perf.stats,
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    newBadges: fresh,
  };
}

export type PublicCourierProfile = {
  ratingAvg: number;
  ratingCount: number;
  deliveries: number;
  // Earned non-milestone badges (quality/reliability), for public trust chips.
  badgeIds: string[];
};

/**
 * The courier facts safe to show anyone holding a tracking link: rating,
 * completed-delivery count, and earned quality badges. No name, no contact.
 */
export async function publicCourierProfile(
  courierId: string,
): Promise<PublicCourierProfile> {
  const [rating, deliveries, awards] = await Promise.all([
    courierRating(courierId),
    prisma.shipment.count({
      where: { driverId: courierId, status: "DELIVERED" },
    }),
    prisma.courierBadgeAward.findMany({
      where: { courierId, badgeId: { not: { startsWith: "deliveries_" } } },
      orderBy: { awardedAt: "asc" },
      select: { badgeId: true },
    }),
  ]);
  return {
    ratingAvg: rating.avg,
    ratingCount: rating.count,
    deliveries,
    badgeIds: awards.map((a) => a.badgeId),
  };
}

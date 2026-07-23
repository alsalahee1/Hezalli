// One courier's own performance figures + badges, for the driver app's
// "My performance" screen. Stats are derived from existing rows the same way
// lib/delivery-analytics.ts does for the admin fleet views; earned badges are
// additionally persisted as CourierBadgeAward rows so they are permanent and
// so a NEW award can be detected and pushed to the driver's phone.
import { getTranslations } from "next-intl/server";

import {
  computeBadges,
  fiveStarStreak,
  QUALITY_BADGE_IDS,
  seasonalBadgeLabel,
  STREAK_TARGET,
  type BadgeState,
  type CourierStats,
} from "@/lib/courier-badges";
import { courierRating, courierRatingsByCourier } from "@/lib/courier-ratings";
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

  // Seasonal badge (admin-configured in settings, e.g. a Ramadan rush):
  // deliveries completed inside the window count toward a one-off badge.
  // The display name is embedded in the id, so the award outlives the season.
  const season = activeSeason(settings);
  if (season) {
    const inWindow = delivered.filter(
      (s) =>
        s.deliveredAt &&
        s.deliveredAt >= season.from &&
        s.deliveredAt < season.to,
    ).length;
    badges.push({
      id: `season_${season.name}`,
      kind: "seasonal",
      earned: inWindow >= season.target,
      current: Math.min(inWindow, season.target),
      target: season.target,
      label: season.name,
    });
  }

  return {
    stats,
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
  };
}

type Season = { name: string; from: Date; to: Date; target: number };

// The currently configured season, or null when off/misconfigured. The end
// date is inclusive (couriers deliver until midnight of that day).
function activeSeason(settings: {
  season_badge_name: string;
  season_start_date: string;
  season_end_date: string;
  season_target_deliveries: number;
}): Season | null {
  const name = settings.season_badge_name.trim();
  if (!name || settings.season_target_deliveries <= 0) return null;
  const from = new Date(`${settings.season_start_date}T00:00:00Z`);
  const end = new Date(`${settings.season_end_date}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(end.getTime())) return null;
  const to = new Date(end.getTime() + 86_400_000);
  return from < to
    ? { name, from, to, target: settings.season_target_deliveries }
    : null;
}

// Localized display name for a badge, for notifications and public chips.
async function badgeName(b: BadgeState, locale: string): Promise<string> {
  if (b.kind === "seasonal") return b.label ?? seasonalBadgeLabel(b.id);
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
  // Awards with no live counterpart — badges from past seasons — stay visible
  // forever; the display name lives in the id.
  const listed = new Set(badges.map((b) => b.id));
  for (const id of have) {
    if (listed.has(id) || !id.startsWith("season_")) continue;
    badges.push({
      id,
      kind: "seasonal",
      earned: true,
      current: 1,
      target: 1,
      label: seasonalBadgeLabel(id),
    });
  }
  return {
    stats: perf.stats,
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    newBadges: fresh,
  };
}

export type WeeklyLeaderRow = {
  courierId: string;
  // First name only — enough for friendly competition between colleagues
  // without publishing anyone's full identity to the whole fleet.
  name: string;
  deliveries: number;
  rating: number | null;
};

export type WeeklyLeaderboard = {
  rows: WeeklyLeaderRow[];
  // The viewing courier's own standing, even when outside the top rows.
  myRank: number | null;
  myDeliveries: number;
};

/**
 * The fleet's top couriers over the trailing 7 days, driver-facing (the admin
 * all-time board lives in lib/delivery-analytics.ts). Ranked by delivered
 * parcels, rating as tiebreak.
 */
export async function weeklyLeaderboard(
  courierId: string,
  top = 5,
): Promise<WeeklyLeaderboard> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const grouped = await prisma.shipment.groupBy({
    by: ["driverId"],
    where: {
      status: "DELIVERED",
      driverId: { not: null },
      deliveredAt: { gte: since },
    },
    _count: { _all: true },
  });
  const ratings = await courierRatingsByCourier();
  const ranked = grouped
    .map((g) => ({
      courierId: g.driverId as string,
      deliveries: g._count._all,
      rating: ratings.get(g.driverId as string)?.avg ?? null,
    }))
    .sort(
      (a, b) =>
        b.deliveries - a.deliveries ||
        (b.rating ?? 0) - (a.rating ?? 0) ||
        a.courierId.localeCompare(b.courierId),
    );

  const myIndex = ranked.findIndex((r) => r.courierId === courierId);
  const rows = ranked.slice(0, top);
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.courierId) } },
    select: { id: true, name: true },
  });
  const nameBy = new Map(users.map((u) => [u.id, u.name]));
  return {
    rows: rows.map((r) => ({
      ...r,
      name:
        nameBy.get(r.courierId)?.trim().split(/\s+/)[0] ||
        `#${r.courierId.slice(-4)}`,
    })),
    myRank: myIndex >= 0 ? myIndex + 1 : null,
    myDeliveries: myIndex >= 0 ? ranked[myIndex].deliveries : 0,
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
      where: { courierId, badgeId: { in: [...QUALITY_BADGE_IDS] } },
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

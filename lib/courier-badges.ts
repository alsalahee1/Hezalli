// Driver badges for the Hezalli Express courier app. Badges reward volume AND
// quality together (milestones alone would encourage rushing), and every badge
// is derived on the fly from existing rows — no stored gamification state, so
// a badge can also be lost when the underlying rate slips. Pure logic only;
// the prisma queries live in lib/courier-performance.ts so this file stays
// unit-testable.

export type CourierStats = {
  deliveries: number; // DELIVERED shipments
  ratingAvg: number; // buyer stars average, 0 when never rated
  ratingCount: number;
  fiveStarStreak: number; // consecutive most-recent 5★ ratings
  firstAttemptPct: number | null; // delivered on the first doorstep attempt
  onTimePct: number | null; // delivered within the promised window
  verifiedPct: number | null; // drop-offs where the buyer's code/QR was verified
};

// Volume milestones (completed deliveries). The first lands on day one so new
// drivers get an early win.
export const DELIVERY_MILESTONES = [1, 10, 50, 100, 250, 500] as const;

// Rate badges need a minimum sample so one lucky drop isn't "100% on time",
// and a driver can't earn them by cherry-picking a handful of easy jobs.
export const RATE_THRESHOLD_PCT = 90;
export const RATE_MIN_DELIVERIES = 20;
export const TOP_RATED_AVG = 4.5;
export const TOP_RATED_MIN_RATINGS = 10;
export const STREAK_TARGET = 10;

export type BadgeKind = "milestone" | "quality" | "reliability";

export type BadgeState = {
  // i18n suffix: "milestone" badges render from `target`, the rest have
  // per-id name/description keys (badge_<id> / badgeDesc_<id>).
  id: string;
  kind: BadgeKind;
  earned: boolean;
  // Progress toward earning, for the "next badges" bars. Countable badges
  // (milestones, streak) count units; rate badges track the sample size until
  // it's big enough, then the rate against its threshold.
  current: number;
  target: number;
};

/** Consecutive 5★ ratings counted from the newest (input newest-first). */
export function fiveStarStreak(starsNewestFirst: number[]): number {
  let n = 0;
  for (const s of starsNewestFirst) {
    if (s !== 5) break;
    n += 1;
  }
  return n;
}

export function computeBadges(stats: CourierStats): BadgeState[] {
  const badges: BadgeState[] = DELIVERY_MILESTONES.map((m) => ({
    id: `deliveries_${m}`,
    kind: "milestone" as const,
    earned: stats.deliveries >= m,
    current: Math.min(stats.deliveries, m),
    target: m,
  }));

  badges.push({
    id: "top_rated",
    kind: "quality",
    earned:
      stats.ratingCount >= TOP_RATED_MIN_RATINGS &&
      stats.ratingAvg >= TOP_RATED_AVG,
    ...(stats.ratingCount < TOP_RATED_MIN_RATINGS
      ? { current: stats.ratingCount, target: TOP_RATED_MIN_RATINGS }
      : {
          current: Math.min(stats.ratingAvg, TOP_RATED_AVG),
          target: TOP_RATED_AVG,
        }),
  });

  badges.push({
    id: "five_star_streak",
    kind: "quality",
    earned: stats.fiveStarStreak >= STREAK_TARGET,
    current: Math.min(stats.fiveStarStreak, STREAK_TARGET),
    target: STREAK_TARGET,
  });

  const rate = (id: string, pct: number | null): BadgeState => ({
    id,
    kind: "reliability",
    earned:
      stats.deliveries >= RATE_MIN_DELIVERIES &&
      pct != null &&
      pct >= RATE_THRESHOLD_PCT,
    ...(stats.deliveries < RATE_MIN_DELIVERIES
      ? { current: stats.deliveries, target: RATE_MIN_DELIVERIES }
      : {
          current: Math.min(pct ?? 0, RATE_THRESHOLD_PCT),
          target: RATE_THRESHOLD_PCT,
        }),
  });
  badges.push(rate("first_attempt_pro", stats.firstAttemptPct));
  badges.push(rate("on_time_hero", stats.onTimePct));
  badges.push(rate("verified_pro", stats.verifiedPct));

  return badges;
}

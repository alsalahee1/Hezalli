import { describe, expect, it } from "vitest";

import {
  DELIVERY_MILESTONES,
  RATE_MIN_DELIVERIES,
  RATE_THRESHOLD_PCT,
  STREAK_TARGET,
  TOP_RATED_AVG,
  TOP_RATED_MIN_RATINGS,
  computeBadges,
  fiveStarStreak,
  type CourierStats,
} from "@/lib/courier-badges";

const base: CourierStats = {
  deliveries: 0,
  ratingAvg: 0,
  ratingCount: 0,
  fiveStarStreak: 0,
  firstAttemptPct: null,
  onTimePct: null,
  verifiedPct: null,
};

const badge = (stats: Partial<CourierStats>, id: string) => {
  const found = computeBadges({ ...base, ...stats }).find((b) => b.id === id);
  if (!found) throw new Error(`badge ${id} missing`);
  return found;
};

describe("fiveStarStreak", () => {
  it("counts consecutive 5s from the newest rating", () => {
    expect(fiveStarStreak([])).toBe(0);
    expect(fiveStarStreak([5, 5, 5])).toBe(3);
    expect(fiveStarStreak([5, 5, 4, 5])).toBe(2);
    expect(fiveStarStreak([3, 5, 5])).toBe(0);
  });
});

describe("milestone badges", () => {
  it("earns each milestone at its delivery count, with clamped progress", () => {
    for (const m of DELIVERY_MILESTONES) {
      expect(badge({ deliveries: m - 1 }, `deliveries_${m}`).earned).toBe(
        false,
      );
      const earned = badge({ deliveries: m }, `deliveries_${m}`);
      expect(earned.earned).toBe(true);
      expect(earned.current).toBe(m);
      expect(earned.target).toBe(m);
    }
    // Progress never overshoots the milestone.
    expect(badge({ deliveries: 999 }, "deliveries_500").current).toBe(500);
  });

  it("a brand-new driver has every badge unearned", () => {
    expect(computeBadges(base).every((b) => !b.earned)).toBe(true);
  });
});

describe("quality badges", () => {
  it("top_rated needs both the average and the sample size", () => {
    // Great average, too few ratings.
    expect(
      badge(
        { ratingAvg: 5, ratingCount: TOP_RATED_MIN_RATINGS - 1 },
        "top_rated",
      ).earned,
    ).toBe(false);
    // Enough ratings, average below the bar.
    expect(
      badge({ ratingAvg: TOP_RATED_AVG - 0.1, ratingCount: 30 }, "top_rated")
        .earned,
    ).toBe(false);
    expect(
      badge(
        { ratingAvg: TOP_RATED_AVG, ratingCount: TOP_RATED_MIN_RATINGS },
        "top_rated",
      ).earned,
    ).toBe(true);
  });

  it("top_rated progress tracks the sample first, then the average", () => {
    const collecting = badge({ ratingAvg: 5, ratingCount: 4 }, "top_rated");
    expect(collecting.current).toBe(4);
    expect(collecting.target).toBe(TOP_RATED_MIN_RATINGS);
    const rated = badge({ ratingAvg: 4.2, ratingCount: 25 }, "top_rated");
    expect(rated.current).toBe(4.2);
    expect(rated.target).toBe(TOP_RATED_AVG);
  });

  it("five_star_streak earns at the target and un-earns when broken", () => {
    expect(
      badge({ fiveStarStreak: STREAK_TARGET }, "five_star_streak").earned,
    ).toBe(true);
    expect(
      badge({ fiveStarStreak: STREAK_TARGET - 1 }, "five_star_streak").earned,
    ).toBe(false);
  });
});

describe("reliability (rate) badges", () => {
  const ids = ["first_attempt_pro", "on_time_hero", "verified_pro"] as const;
  const stat = {
    first_attempt_pro: "firstAttemptPct",
    on_time_hero: "onTimePct",
    verified_pro: "verifiedPct",
  } as const;

  it("never earn below the minimum delivery sample", () => {
    for (const id of ids) {
      const b = badge(
        { deliveries: RATE_MIN_DELIVERIES - 1, [stat[id]]: 100 },
        id,
      );
      expect(b.earned).toBe(false);
      // While collecting the sample, the bar tracks deliveries.
      expect(b.current).toBe(RATE_MIN_DELIVERIES - 1);
      expect(b.target).toBe(RATE_MIN_DELIVERIES);
    }
  });

  it("earn at the threshold once the sample is big enough", () => {
    for (const id of ids) {
      expect(
        badge(
          { deliveries: RATE_MIN_DELIVERIES, [stat[id]]: RATE_THRESHOLD_PCT },
          id,
        ).earned,
      ).toBe(true);
      const under = badge(
        {
          deliveries: RATE_MIN_DELIVERIES,
          [stat[id]]: RATE_THRESHOLD_PCT - 1,
        },
        id,
      );
      expect(under.earned).toBe(false);
      expect(under.current).toBe(RATE_THRESHOLD_PCT - 1);
      expect(under.target).toBe(RATE_THRESHOLD_PCT);
    }
  });

  it("handle a null rate (no measurable deliveries yet)", () => {
    for (const id of ids) {
      const b = badge(
        { deliveries: RATE_MIN_DELIVERIES, [stat[id]]: null },
        id,
      );
      expect(b.earned).toBe(false);
      expect(b.current).toBe(0);
    }
  });
});

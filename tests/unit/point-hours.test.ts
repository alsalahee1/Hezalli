// Opening-hours logic (lib/point-hours.ts). Times are Asia/Aden (UTC+3), so a
// UTC instant maps to Aden by +3h; the fixtures below pick UTC instants whose
// Aden wall-clock day/time is known.
import { describe, expect, it } from "vitest";

import {
  hasAnyHours,
  isPointOpenNow,
  parseWeeklyHours,
  todayHours,
  type WeeklyHours,
} from "@/lib/point-hours";

// 0=Sun..6=Sat. Helper to build a week with one day set.
function week(
  day: number,
  hours: { open: string; close: string } | null,
): WeeklyHours {
  return Array.from({ length: 7 }, (_, i) => (i === day ? hours : null));
}

describe("parseWeeklyHours", () => {
  it("accepts a valid 7-day schedule", () => {
    const w = week(1, { open: "09:00", close: "18:00" });
    expect(parseWeeklyHours(w)).toEqual(w);
  });
  it("rejects wrong length, bad times, and non-arrays", () => {
    expect(parseWeeklyHours([])).toBeNull();
    expect(
      parseWeeklyHours(Array(7).fill({ open: "9", close: "18:00" })),
    ).toBeNull();
    expect(
      parseWeeklyHours(week(1, { open: "25:00", close: "18:00" })),
    ).toBeNull();
    expect(parseWeeklyHours("nope")).toBeNull();
  });
});

describe("hasAnyHours", () => {
  it("is false for null or an all-closed week", () => {
    expect(hasAnyHours(null)).toBe(false);
    expect(hasAnyHours(Array(7).fill(null))).toBe(false);
    expect(hasAnyHours(week(3, { open: "09:00", close: "17:00" }))).toBe(true);
  });
});

describe("isPointOpenNow", () => {
  // Mon 2026-07-20, Aden 10:00 == UTC 07:00.
  const monMorning = new Date("2026-07-20T07:00:00Z");
  // Mon Aden 19:00 == UTC 16:00.
  const monEvening = new Date("2026-07-20T16:00:00Z");
  // Sun 2026-07-19, Aden 13:00 == UTC 10:00.
  const sunMidday = new Date("2026-07-19T10:00:00Z");

  it("is open inside a same-day window and closed after it", () => {
    const w = week(1, { open: "09:00", close: "18:00" });
    expect(isPointOpenNow(w, monMorning)).toBe(true);
    expect(isPointOpenNow(w, monEvening)).toBe(false);
  });

  it("is closed on a day with no window", () => {
    const w = week(1, { open: "09:00", close: "18:00" });
    expect(isPointOpenNow(w, sunMidday)).toBe(false);
  });

  it("treats open===close as open all day", () => {
    expect(
      isPointOpenNow(week(1, { open: "00:00", close: "00:00" }), monEvening),
    ).toBe(true);
  });

  it("handles an overnight window into the next day", () => {
    const w = week(1, { open: "20:00", close: "02:00" }); // Mon 20:00 → Tue 02:00
    // Mon Aden 21:00 == UTC 18:00 — inside the evening side.
    expect(isPointOpenNow(w, new Date("2026-07-20T18:00:00Z"))).toBe(true);
    // Tue Aden 01:00 == UTC Mon 22:00 — inside the spill past midnight.
    expect(isPointOpenNow(w, new Date("2026-07-20T22:00:00Z"))).toBe(true);
    // Tue Aden 03:00 == UTC 00:00 Tue — after the window closed.
    expect(isPointOpenNow(w, new Date("2026-07-21T00:00:00Z"))).toBe(false);
  });
});

describe("todayHours", () => {
  it("returns the current Aden day's window", () => {
    const w = week(1, { open: "08:00", close: "16:00" });
    expect(todayHours(w, new Date("2026-07-20T07:00:00Z"))).toEqual({
      open: "08:00",
      close: "16:00",
    });
    expect(todayHours(w, new Date("2026-07-19T10:00:00Z"))).toBeNull();
  });
});

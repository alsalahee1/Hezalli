// Pure slot math for the hub arrival queue (docs/DELIVERY-POINTS.md §44). No
// DB — just the Asia/Aden service-day + slot-generation helpers.
import { describe, expect, it } from "vitest";

import {
  formatSlot,
  minutesNowAden,
  serviceDayFor,
  slotsForDay,
} from "@/lib/point-queue";
import type { WeeklyHours } from "@/lib/point-hours";

const everyDay = (open: string, close: string): WeeklyHours =>
  Array.from({ length: 7 }, () => ({ open, close }));
const allNull: WeeklyHours = Array.from({ length: 7 }, () => null);

describe("point-queue slot math", () => {
  it("formats minutes-past-midnight as HH:MM", () => {
    expect(formatSlot(0)).toBe("00:00");
    expect(formatSlot(480)).toBe("08:00");
    expect(formatSlot(1230)).toBe("20:30");
  });

  it("resolves the Aden service day across the UTC midnight boundary", () => {
    // 22:30Z + 3h = 01:30 next day in Aden.
    expect(serviceDayFor(new Date("2026-07-24T22:30:00Z"))).toBe("2026-07-25");
    // 10:00Z + 3h = 13:00 same day.
    expect(serviceDayFor(new Date("2026-07-24T10:00:00Z"))).toBe("2026-07-24");
  });

  it("gives minutes past midnight on the Aden wall clock", () => {
    expect(minutesNowAden(new Date("2026-07-24T05:00:00Z"))).toBe(8 * 60);
  });

  it("slices the day's window into whole slots", () => {
    const now = new Date("2026-07-26T09:00:00Z");
    const slots = slotsForDay(everyDay("08:00", "10:00"), now, 30);
    // 08:00, 08:30, 09:00, 09:30 — the 10:00 edge is exclusive.
    expect(slots).toEqual([480, 510, 540, 570]);
  });

  it("treats open === close as open all day (48 half-hours)", () => {
    const now = new Date("2026-07-26T09:00:00Z");
    expect(slotsForDay(everyDay("00:00", "00:00"), now, 30)).toHaveLength(48);
  });

  it("returns no slots on a closed day", () => {
    const now = new Date("2026-07-26T09:00:00Z");
    expect(slotsForDay(allNull, now, 30)).toEqual([]);
  });
});

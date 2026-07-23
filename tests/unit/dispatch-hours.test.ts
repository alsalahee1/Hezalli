// Dispatch-hours math: pure wall-clock logic, no DB.
import { describe, expect, it } from "vitest";

import { dispatchLocalHour, isDispatchOpen } from "@/lib/dispatch-hours";

// A Date whose Aden (UTC+3) hour is exactly `h`.
const atAdenHour = (h: number) =>
  new Date(Date.UTC(2026, 0, 15, (h - 3 + 24) % 24, 30));

describe("dispatch hours", () => {
  it("maps UTC to the Aden wall clock", () => {
    expect(dispatchLocalHour(atAdenHour(0))).toBe(0);
    expect(dispatchLocalHour(atAdenHour(8))).toBe(8);
    expect(dispatchLocalHour(atAdenHour(23))).toBe(23);
  });

  it("start === end means always open (24/7)", () => {
    for (const h of [0, 7, 12, 23]) {
      expect(isDispatchOpen(0, 0, atAdenHour(h))).toBe(true);
      expect(isDispatchOpen(9, 9, atAdenHour(h))).toBe(true);
    }
  });

  it("daytime window: open within, closed outside, end-exclusive", () => {
    expect(isDispatchOpen(8, 21, atAdenHour(8))).toBe(true);
    expect(isDispatchOpen(8, 21, atAdenHour(20))).toBe(true);
    expect(isDispatchOpen(8, 21, atAdenHour(21))).toBe(false);
    expect(isDispatchOpen(8, 21, atAdenHour(2))).toBe(false);
  });

  it("overnight window wraps midnight", () => {
    expect(isDispatchOpen(20, 6, atAdenHour(23))).toBe(true);
    expect(isDispatchOpen(20, 6, atAdenHour(3))).toBe(true);
    expect(isDispatchOpen(20, 6, atAdenHour(12))).toBe(false);
  });
});

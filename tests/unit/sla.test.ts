import { describe, expect, it } from "vitest";

import { DUE_SOON_MS, dueBy, slaState, slaWeight } from "@/lib/sla";

const DAY = 86_400_000;

describe("delivery SLA", () => {
  it("dueBy is shippedAt plus the max-ETA days", () => {
    const shipped = new Date("2026-01-01T00:00:00Z");
    expect(dueBy(shipped, 2).getTime()).toBe(shipped.getTime() + 2 * DAY);
  });

  it("classifies overdue, due-soon, and on-track", () => {
    const due = new Date("2026-01-10T12:00:00Z");
    // Past the deadline → overdue.
    expect(slaState(due, new Date(due.getTime() + 1))).toBe("overdue");
    // Within the due-soon window before the deadline.
    expect(slaState(due, new Date(due.getTime() - DUE_SOON_MS + 1000))).toBe(
      "due_soon",
    );
    // Comfortably ahead → on track.
    expect(slaState(due, new Date(due.getTime() - 2 * DAY))).toBe("on_track");
  });

  it("exactly at the deadline counts as overdue", () => {
    const due = new Date("2026-01-10T12:00:00Z");
    expect(slaState(due, due)).toBe("overdue");
  });

  it("sorts overdue before due-soon before on-track", () => {
    const weights = ["overdue", "due_soon", "on_track"].map((s) =>
      slaWeight(s as "overdue" | "due_soon" | "on_track"),
    );
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
    expect(weights[0]).toBeLessThan(weights[2]);
  });
});

import { describe, expect, it } from "vitest";

import {
  deliveryWindowBounds,
  isDeliverySlot,
  parseDeliveryWindow,
} from "@/lib/delivery-slots";

// A YYYY-MM-DD string `days` from today, in UTC.
function daysAhead(days: number): string {
  const now = new Date();
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

describe("isDeliverySlot", () => {
  it("accepts the known slots and rejects anything else", () => {
    expect(isDeliverySlot("MORNING")).toBe(true);
    expect(isDeliverySlot("EVENING")).toBe(true);
    expect(isDeliverySlot("NIGHT")).toBe(false);
    expect(isDeliverySlot("")).toBe(false);
    expect(isDeliverySlot(null)).toBe(false);
    expect(isDeliverySlot(3)).toBe(false);
  });
});

describe("parseDeliveryWindow", () => {
  it("returns null when nothing is requested", () => {
    expect(parseDeliveryWindow("", "", 7)).toBeNull();
    expect(parseDeliveryWindow(null, null, 7)).toBeNull();
    expect(parseDeliveryWindow(undefined, undefined, 7)).toBeNull();
  });

  it("rejects a half-filled window", () => {
    expect(parseDeliveryWindow(daysAhead(2), "", 7)).toBe("invalid");
    expect(parseDeliveryWindow("", "MORNING", 7)).toBe("invalid");
  });

  it("rejects an unknown slot", () => {
    expect(parseDeliveryWindow(daysAhead(2), "NIGHT", 7)).toBe("invalid");
  });

  it("rejects malformed or impossible dates", () => {
    expect(parseDeliveryWindow("not-a-date", "MORNING", 7)).toBe("invalid");
    expect(parseDeliveryWindow("2026-02-30", "MORNING", 7)).toBe("invalid");
    expect(parseDeliveryWindow("2026-13-01", "MORNING", 7)).toBe("invalid");
  });

  it("rejects today and the past (must be tomorrow at the earliest)", () => {
    expect(parseDeliveryWindow(daysAhead(0), "MORNING", 7)).toBe("invalid");
    expect(parseDeliveryWindow(daysAhead(-1), "MORNING", 7)).toBe("invalid");
  });

  it("rejects a day beyond the horizon", () => {
    expect(parseDeliveryWindow(daysAhead(8), "MORNING", 7)).toBe("invalid");
  });

  it("rejects everything when scheduling is off (maxDays <= 0)", () => {
    expect(parseDeliveryWindow(daysAhead(1), "MORNING", 0)).toBe("invalid");
  });

  it("accepts a valid in-range window and pins the date to UTC midnight", () => {
    const dateStr = daysAhead(3);
    const win = parseDeliveryWindow(dateStr, "AFTERNOON", 7);
    expect(win).not.toBeNull();
    expect(win).not.toBe("invalid");
    if (win && win !== "invalid") {
      expect(win.slot).toBe("AFTERNOON");
      expect(win.date.toISOString()).toBe(`${dateStr}T00:00:00.000Z`);
    }
  });

  it("accepts the boundary days (tomorrow and the last day)", () => {
    expect(parseDeliveryWindow(daysAhead(1), "MORNING", 7)).not.toBe("invalid");
    expect(parseDeliveryWindow(daysAhead(7), "EVENING", 7)).not.toBe("invalid");
  });
});

describe("deliveryWindowBounds", () => {
  it("returns null when scheduling is disabled", () => {
    expect(deliveryWindowBounds(0)).toBeNull();
    expect(deliveryWindowBounds(-3)).toBeNull();
  });

  it("returns tomorrow..+maxDays bounds a date input can enforce", () => {
    const b = deliveryWindowBounds(7);
    expect(b).not.toBeNull();
    expect(b!.min).toBe(daysAhead(1));
    expect(b!.max).toBe(daysAhead(7));
  });
});

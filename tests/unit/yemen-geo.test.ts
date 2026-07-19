import { describe, expect, it } from "vitest";

import { GOVERNORATE_CENTROIDS, nearestGovernorate } from "@/lib/yemen-geo";
import { GOVERNORATE_VALUES } from "@/lib/yemen";

describe("nearestGovernorate", () => {
  it("maps coordinates to the closest governorate", () => {
    expect(nearestGovernorate(12.79, 45.03)).toBe("Aden");
    expect(nearestGovernorate(14.8, 42.95)).toBe("Al Hudaydah");
    expect(nearestGovernorate(13.58, 44.02)).toBe("Taiz");
    // Far east island — unambiguous.
    expect(nearestGovernorate(12.46, 53.82)).toBe("Socotra");
  });

  it("returns a valid, known governorate for any point", () => {
    const g = nearestGovernorate(15.0, 44.0);
    expect(GOVERNORATE_VALUES).toContain(g);
  });

  it("has a centroid for every governorate in the address book", () => {
    for (const v of GOVERNORATE_VALUES) {
      expect(GOVERNORATE_CENTROIDS[v]).toBeDefined();
    }
  });
});

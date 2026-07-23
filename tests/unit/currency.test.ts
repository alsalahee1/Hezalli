import { describe, expect, it } from "vitest";

import {
  formatMoney,
  isSelectableZone,
  pickRate,
  selectableZoneOf,
  USD_DISPLAY,
  zoneForGovernorate,
} from "@/lib/currency-constants";
import { GOVERNORATE_VALUES } from "@/lib/yemen";

describe("zoneForGovernorate", () => {
  it("maps every canonical governorate to a real zone, never DEFAULT", () => {
    for (const g of GOVERNORATE_VALUES) {
      expect(["NORTH", "SOUTH"]).toContain(zoneForGovernorate(g));
    }
  });

  it("old-rial governorates land in NORTH", () => {
    expect(zoneForGovernorate("Amanat Al Asimah")).toBe("NORTH");
    expect(zoneForGovernorate("Sana'a")).toBe("NORTH");
    expect(zoneForGovernorate("Al Hudaydah")).toBe("NORTH");
    expect(zoneForGovernorate("Ibb")).toBe("NORTH");
  });

  it("floating-rial governorates land in SOUTH", () => {
    expect(zoneForGovernorate("Aden")).toBe("SOUTH");
    expect(zoneForGovernorate("Hadhramaut")).toBe("SOUTH");
    expect(zoneForGovernorate("Taiz")).toBe("SOUTH");
    expect(zoneForGovernorate("Ma'rib")).toBe("SOUTH");
  });

  it("missing governorate → DEFAULT; unrecognized value → SOUTH", () => {
    expect(zoneForGovernorate(null)).toBe("DEFAULT");
    expect(zoneForGovernorate(undefined)).toBe("DEFAULT");
    expect(zoneForGovernorate("")).toBe("DEFAULT");
    expect(zoneForGovernorate("Atlantis")).toBe("SOUTH");
  });
});

describe("pickRate", () => {
  const rows = [
    { currency: "YER", zone: "DEFAULT", rate: 1650 },
    { currency: "YER", zone: "NORTH", rate: 530 },
    { currency: "SAR", zone: "DEFAULT", rate: 3.75 },
  ];

  it("prefers the zone-specific row", () => {
    expect(pickRate(rows, "YER", "NORTH")).toBe(530);
  });

  it("falls back to the DEFAULT-zone row when the zone has none", () => {
    expect(pickRate(rows, "YER", "SOUTH")).toBe(1650);
    expect(pickRate(rows, "SAR", "NORTH")).toBe(3.75);
  });

  it("returns null when the currency has no usable row", () => {
    expect(pickRate(rows, "AED", "DEFAULT")).toBeNull();
    expect(
      pickRate(
        [{ currency: "AED", zone: "DEFAULT", rate: 0 }],
        "AED",
        "DEFAULT",
      ),
    ).toBeNull();
  });

  it("skips a non-positive zone row in favor of the fallback", () => {
    const withBadRow = [...rows, { currency: "YER", zone: "SOUTH", rate: 0 }];
    expect(pickRate(withBadRow, "YER", "SOUTH")).toBe(1650);
  });
});

describe("selectable rial markets", () => {
  it("accepts only the two explicit markets", () => {
    expect(isSelectableZone("NORTH")).toBe(true);
    expect(isSelectableZone("SOUTH")).toBe(true);
    expect(isSelectableZone("DEFAULT")).toBe(false);
    expect(isSelectableZone(undefined)).toBe(false);
    expect(isSelectableZone("Aden")).toBe(false);
  });

  it("coerces resolved zones to a market: DEFAULT/undefined read as SOUTH", () => {
    expect(selectableZoneOf("NORTH")).toBe("NORTH");
    expect(selectableZoneOf("SOUTH")).toBe("SOUTH");
    expect(selectableZoneOf("DEFAULT")).toBe("SOUTH");
    expect(selectableZoneOf(undefined)).toBe("SOUTH");
  });
});

describe("formatMoney", () => {
  it("converts and rounds YER to whole rials", () => {
    const label = formatMoney(10, { code: "YER", rate: 530 }, "en");
    expect(label).toContain("5,300");
    expect(label).not.toContain(".");
  });

  it("USD display is a passthrough at rate 1", () => {
    expect(formatMoney(12.5, USD_DISPLAY, "en")).toBe("$12.50");
  });

  it("keeps two decimals for SAR", () => {
    expect(formatMoney(10, { code: "SAR", rate: 3.75 }, "en")).toContain(
      "37.50",
    );
  });

  it("fails safe to USD when the rate is not positive", () => {
    expect(formatMoney(10, { code: "YER", rate: 0 }, "en")).toBe("$10.00");
  });
});

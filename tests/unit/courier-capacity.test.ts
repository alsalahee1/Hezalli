// Pure capacity math: vehicle profiles, room checks, parcel metrics
// (weight / volume / longest side), and dimension parsing.
import { describe, expect, it } from "vitest";

import type { CourierLoad } from "@/lib/courier-assign";
import { pickFrom } from "@/lib/courier-assign";
import {
  capacityFor,
  DEFAULT_ITEM_LONGEST_SIDE_CM,
  DEFAULT_ITEM_VOLUME_CM3,
  DEFAULT_ITEM_WEIGHT_GRAMS,
  hasRoomFor,
  isFreightClass,
  mergeVehicleCapacity,
  metricsOfItems,
  PACKING_FACTOR,
  type ParcelMetrics,
  parseDimensions,
  SIZE_CLASS_PROFILES,
  VEHICLE_CAPACITY,
} from "@/lib/courier-capacity";

function courier(over: Partial<CourierLoad> & { id: string }): CourierLoad {
  return {
    load: 0,
    loadWeightGrams: 0,
    loadVolumeCm3: 0,
    vehicleType: null,
    rate: 1,
    badges: 0,
    governorate: null,
    lat: null,
    lng: null,
    activeGovernorates: new Set<string>(),
    ...over,
  };
}

function parcel(over: Partial<ParcelMetrics> = {}): ParcelMetrics {
  return {
    weightGrams: 0,
    volumeCm3: 0,
    longestSideCm: 0,
    freight: false,
    oversized: false,
    ...over,
  };
}

describe("capacityFor", () => {
  it("knows every vehicle from the application form", () => {
    for (const v of ["foot", "bicycle", "motorbike", "car", "van", "truck"]) {
      expect(capacityFor(v)).toBe(VEHICLE_CAPACITY[v]);
    }
  });

  it("is null for unknown or missing vehicles", () => {
    expect(capacityFor(null)).toBeNull();
    expect(capacityFor(undefined)).toBeNull();
    expect(capacityFor("rocket")).toBeNull();
  });
});

describe("mergeVehicleCapacity", () => {
  it("returns the defaults untouched for empty/garbage overrides", () => {
    expect(mergeVehicleCapacity(null)).toEqual(VEHICLE_CAPACITY);
    expect(mergeVehicleCapacity(undefined)).toEqual(VEHICLE_CAPACITY);
    expect(mergeVehicleCapacity("junk")).toEqual(VEHICLE_CAPACITY);
    expect(mergeVehicleCapacity({ rocket: { maxWeightGrams: 1 } })).toEqual(
      VEHICLE_CAPACITY,
    );
  });

  it("merges valid overrides field-by-field", () => {
    const merged = mergeVehicleCapacity({
      motorbike: { maxWeightGrams: 15_000, maxParcels: 20 },
    });
    expect(merged.motorbike.maxWeightGrams).toBe(15_000);
    expect(merged.motorbike.maxParcels).toBe(20);
    // Unspecified fields keep the shipped defaults; other vehicles untouched.
    expect(merged.motorbike.maxVolumeCm3).toBe(
      VEHICLE_CAPACITY.motorbike.maxVolumeCm3,
    );
    expect(merged.van).toEqual(VEHICLE_CAPACITY.van);
  });

  it("ignores malformed or out-of-range values per field", () => {
    const merged = mergeVehicleCapacity({
      motorbike: { maxWeightGrams: -5, maxParcels: "ten", maxVolumeCm3: 1e12 },
    });
    expect(merged.motorbike).toEqual(VEHICLE_CAPACITY.motorbike);
  });
});

describe("parseDimensions", () => {
  it("accepts the documented { l, w, h } cm shape", () => {
    expect(parseDimensions({ l: 30, w: 20, h: 10 })).toEqual({
      l: 30,
      w: 20,
      h: 10,
    });
  });

  it("rejects anything malformed or out of range", () => {
    expect(parseDimensions(null)).toBeNull();
    expect(parseDimensions(undefined)).toBeNull();
    expect(parseDimensions("30x20x10")).toBeNull();
    expect(parseDimensions({ l: 30, w: 20 })).toBeNull(); // missing side
    expect(parseDimensions({ l: 0, w: 20, h: 10 })).toBeNull(); // zero
    expect(parseDimensions({ l: -5, w: 20, h: 10 })).toBeNull();
    expect(parseDimensions({ l: 2000, w: 20, h: 10 })).toBeNull(); // > 10 m
    expect(parseDimensions({ l: "30", w: "20", h: "10" })).toBeNull();
  });
});

describe("metricsOfItems", () => {
  it("sums weight and volume with the packing factor", () => {
    const m = metricsOfItems([
      { quantity: 2, weightGrams: 1_000, dims: { l: 20, w: 10, h: 10 } },
    ]);
    expect(m.weightGrams).toBe(2_000);
    expect(m.volumeCm3).toBe(Math.round(2 * 20 * 10 * 10 * PACKING_FACTOR));
    expect(m.longestSideCm).toBe(20);
  });

  it("defaults unlabeled items so they still consume capacity", () => {
    const m = metricsOfItems([{ quantity: 3, weightGrams: null, dims: null }]);
    expect(m.weightGrams).toBe(3 * DEFAULT_ITEM_WEIGHT_GRAMS);
    expect(m.volumeCm3).toBe(
      Math.round(3 * DEFAULT_ITEM_VOLUME_CM3 * PACKING_FACTOR),
    );
    expect(m.longestSideCm).toBe(DEFAULT_ITEM_LONGEST_SIDE_CM);
  });

  it("takes the longest single side across all items", () => {
    const m = metricsOfItems([
      { quantity: 1, weightGrams: 100, dims: { l: 10, w: 10, h: 10 } },
      { quantity: 1, weightGrams: 100, dims: { l: 5, w: 200, h: 5 } },
    ]);
    expect(m.longestSideCm).toBe(200);
  });

  it("is zero for an empty parcel", () => {
    expect(metricsOfItems([])).toEqual({
      weightGrams: 0,
      volumeCm3: 0,
      longestSideCm: 0,
      freight: false,
      oversized: false,
    });
  });

  it("fills missing fields from the size-class profile", () => {
    const m = metricsOfItems([
      { quantity: 1, weightGrams: null, dims: null, sizeClass: "xlarge" },
    ]);
    const p = SIZE_CLASS_PROFILES.xlarge;
    expect(m.weightGrams).toBe(p.weightGrams);
    expect(m.longestSideCm).toBe(Math.max(p.dims.l, p.dims.w, p.dims.h));
    expect(m.freight).toBe(true);
    expect(m.oversized).toBe(false);
  });

  it("lets exact measurements override the class profile", () => {
    const m = metricsOfItems([
      {
        quantity: 1,
        weightGrams: 1_000,
        dims: { l: 10, w: 10, h: 10 },
        sizeClass: "xlarge",
      },
    ]);
    expect(m.weightGrams).toBe(1_000); // exact wins over the 70 kg profile
    expect(m.longestSideCm).toBe(10);
    expect(m.freight).toBe(true); // …but the class still marks it freight
  });

  it("flags oversized parcels", () => {
    const m = metricsOfItems([
      { quantity: 1, weightGrams: null, dims: null, sizeClass: "oversized" },
      { quantity: 2, weightGrams: 100, dims: null, sizeClass: "small" },
    ]);
    expect(m.freight).toBe(true);
    expect(m.oversized).toBe(true);
  });
});

describe("isFreightClass", () => {
  it("marks only xlarge and oversized as freight", () => {
    expect(isFreightClass("xlarge")).toBe(true);
    expect(isFreightClass("oversized")).toBe(true);
    for (const c of ["envelope", "small", "medium", "large", null, undefined]) {
      expect(isFreightClass(c)).toBe(false);
    }
  });
});

describe("hasRoomFor", () => {
  it("rejects a parcel heavier than the vehicle can ever carry", () => {
    const bike = courier({ id: "b", vehicleType: "motorbike" });
    expect(hasRoomFor(bike, parcel({ weightGrams: 40_000 }))).toBe(false);
    expect(
      hasRoomFor(
        courier({ id: "c", vehicleType: "car" }),
        parcel({ weightGrams: 40_000 }),
      ),
    ).toBe(true);
  });

  it("counts what the driver is already carrying", () => {
    const loaded = courier({
      id: "b",
      vehicleType: "motorbike",
      load: 2,
      loadWeightGrams: 25_000,
    });
    expect(hasRoomFor(loaded, parcel({ weightGrams: 10_000 }))).toBe(false);
    expect(hasRoomFor(loaded, parcel({ weightGrams: 5_000 }))).toBe(true);
  });

  it("stops at the parcel-count limit even for light parcels", () => {
    const full = courier({
      id: "b",
      vehicleType: "motorbike",
      load: VEHICLE_CAPACITY.motorbike.maxParcels,
      loadWeightGrams: 1_000,
    });
    expect(hasRoomFor(full, parcel({ weightGrams: 100 }))).toBe(false);
  });

  it("rejects a parcel bulkier than the space left", () => {
    const bike = courier({
      id: "b",
      vehicleType: "motorbike",
      loadVolumeCm3: 100_000,
    });
    // 100k of 150k cm³ used → a 60 L parcel no longer fits, a 40 L one does.
    expect(hasRoomFor(bike, parcel({ volumeCm3: 60_000 }))).toBe(false);
    expect(hasRoomFor(bike, parcel({ volumeCm3: 40_000 }))).toBe(true);
  });

  it("rejects an item too long for the vehicle regardless of weight", () => {
    // A curtain rod: 2 kg, low volume, 200 cm long.
    const rod = parcel({
      weightGrams: 2_000,
      volumeCm3: 5_000,
      longestSideCm: 200,
    });
    expect(
      hasRoomFor(courier({ id: "b", vehicleType: "motorbike" }), rod),
    ).toBe(false);
    expect(hasRoomFor(courier({ id: "c", vehicleType: "car" }), rod)).toBe(
      false, // car max 180 cm
    );
    expect(hasRoomFor(courier({ id: "v", vehicleType: "van" }), rod)).toBe(
      true,
    );
  });

  it("leaves unknown vehicles unconstrained (legacy couriers)", () => {
    const legacy = courier({ id: "x", load: 999, loadWeightGrams: 9_999_999 });
    expect(
      hasRoomFor(
        legacy,
        parcel({
          weightGrams: 1_000_000,
          volumeCm3: 10_000_000,
          longestSideCm: 500,
        }),
      ),
    ).toBe(true);
  });
});

describe("pickFrom (capacity)", () => {
  it("skips couriers whose vehicle can't take the parcel", () => {
    const bike = courier({ id: "a-bike", vehicleType: "motorbike" });
    const car = courier({ id: "z-car", vehicleType: "car", load: 5 });
    // The bike is idle (would win least-loaded) but the parcel is 40 kg.
    expect(
      pickFrom([bike, car], "balanced", {
        destGovernorate: null,
        metrics: parcel({ weightGrams: 40_000 }),
      }),
    ).toBe("z-car");
  });

  it("routes long items past small vehicles", () => {
    const bike = courier({ id: "a-bike", vehicleType: "motorbike" });
    const van = courier({ id: "z-van", vehicleType: "van", load: 9 });
    expect(
      pickFrom([bike, van], "balanced", {
        destGovernorate: null,
        metrics: parcel({ weightGrams: 2_000, longestSideCm: 200 }),
      }),
    ).toBe("z-van");
  });

  it("returns null when nobody can carry it", () => {
    const bike = courier({ id: "a", vehicleType: "motorbike" });
    const van = courier({ id: "b", vehicleType: "van" });
    expect(
      pickFrom([bike, van], "balanced", {
        destGovernorate: null,
        metrics: parcel({ weightGrams: 600_000 }), // 600 kg beats even the van
      }),
    ).toBeNull();
  });

  it("applies capacity before distance under 'nearest'", () => {
    const dest = { lat: 12.8, lng: 45.03 };
    const bikeAtDoor = courier({
      id: "a-bike",
      vehicleType: "motorbike",
      lat: dest.lat,
      lng: dest.lng,
    });
    const vanFarAway = courier({
      id: "b-van",
      vehicleType: "van",
      lat: 15.35,
      lng: 44.2,
    });
    expect(
      pickFrom([bikeAtDoor, vanFarAway], "nearest", {
        destGovernorate: "Aden",
        destCoords: dest,
        metrics: parcel({ weightGrams: 100_000 }),
      }),
    ).toBe("b-van");
  });
});

describe("pickFrom (freight)", () => {
  it("never auto-assigns an oversized parcel, even to a capable truck", () => {
    const truck = courier({ id: "t", vehicleType: "truck" });
    expect(
      pickFrom([truck], "balanced", {
        destGovernorate: "Aden",
        metrics: parcel({
          weightGrams: 200_000,
          oversized: true,
          freight: true,
        }),
      }),
    ).toBeNull();
  });

  it("routes xlarge freight to the truck when smaller vehicles can't take it", () => {
    const bike = courier({ id: "a-bike", vehicleType: "motorbike" });
    const truck = courier({ id: "z-truck", vehicleType: "truck", load: 5 });
    // A fridge: 70 kg, 180 cm tall — beyond car (150 kg is fine but 180 cm is
    // the limit); here only bike vs truck, so the truck must win.
    expect(
      pickFrom([bike, truck], "balanced", {
        destGovernorate: null,
        metrics: parcel({
          weightGrams: 70_000,
          longestSideCm: 180,
          freight: true,
        }),
      }),
    ).toBe("z-truck");
  });

  it("does not batch freight onto a same-destination trip", () => {
    const headed = courier({
      id: "a-headed",
      vehicleType: "truck",
      load: 3,
      activeGovernorates: new Set(["Aden"]),
    });
    const idleTruck = courier({ id: "z-idle", vehicleType: "truck" });
    // For parcels, the same-destination trip wins; for freight, pure load
    // ranking applies — the idle truck takes the appointment.
    expect(
      pickFrom([headed, idleTruck], "balanced", {
        destGovernorate: "Aden",
        metrics: parcel({ weightGrams: 70_000, freight: true }),
      }),
    ).toBe("z-idle");
  });
});

describe("pickFrom (batching)", () => {
  it("prefers a courier already delivering to the same governorate", () => {
    const busyButHeaded = courier({
      id: "z-headed",
      vehicleType: "car",
      load: 3,
      loadWeightGrams: 3_000,
      activeGovernorates: new Set(["Aden"]),
    });
    const idle = courier({ id: "a-idle", vehicleType: "car" });
    // Least-loaded alone would pick the idle courier; batching overrides it.
    expect(
      pickFrom([busyButHeaded, idle], "balanced", {
        destGovernorate: "Aden",
        metrics: parcel({ weightGrams: 500 }),
      }),
    ).toBe("z-headed");
    // Different destination → back to least-loaded.
    expect(
      pickFrom([busyButHeaded, idle], "balanced", {
        destGovernorate: "Taiz",
        metrics: parcel({ weightGrams: 500 }),
      }),
    ).toBe("a-idle");
  });

  it("never batches past the vehicle's capacity", () => {
    const headedButFull = courier({
      id: "a-headed",
      vehicleType: "motorbike",
      load: 2,
      loadWeightGrams: 29_000,
      activeGovernorates: new Set(["Aden"]),
    });
    const idle = courier({ id: "z-idle", vehicleType: "car" });
    expect(
      pickFrom([headedButFull, idle], "balanced", {
        destGovernorate: "Aden",
        metrics: parcel({ weightGrams: 5_000 }),
      }),
    ).toBe("z-idle");
  });

  it("beats distance under 'nearest' — the trip is already happening", () => {
    const dest = { lat: 12.8, lng: 45.03 };
    const nearIdle = courier({
      id: "a-near",
      vehicleType: "car",
      lat: dest.lat,
      lng: dest.lng,
    });
    const farHeaded = courier({
      id: "z-far",
      vehicleType: "car",
      lat: 15.35,
      lng: 44.2,
      activeGovernorates: new Set(["Aden"]),
    });
    expect(
      pickFrom([nearIdle, farHeaded], "nearest", {
        destGovernorate: "Aden",
        destCoords: dest,
        metrics: parcel({ weightGrams: 500 }),
      }),
    ).toBe("z-far");
  });
});

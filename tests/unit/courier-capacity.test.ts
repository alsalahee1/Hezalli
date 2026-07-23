// Pure capacity math: vehicle profiles, room checks, and item weights.
import { describe, expect, it } from "vitest";

import type { CourierLoad } from "@/lib/courier-assign";
import { pickFrom } from "@/lib/courier-assign";
import {
  capacityFor,
  DEFAULT_ITEM_WEIGHT_GRAMS,
  hasRoomFor,
  VEHICLE_CAPACITY,
  weightOfItems,
} from "@/lib/courier-capacity";

function courier(over: Partial<CourierLoad> & { id: string }): CourierLoad {
  return {
    load: 0,
    loadWeightGrams: 0,
    vehicleType: null,
    governorate: null,
    lat: null,
    lng: null,
    activeGovernorates: new Set<string>(),
    ...over,
  };
}

describe("capacityFor", () => {
  it("knows every vehicle from the application form", () => {
    for (const v of ["foot", "bicycle", "motorbike", "car", "van"]) {
      expect(capacityFor(v)).toBe(VEHICLE_CAPACITY[v]);
    }
  });

  it("is null for unknown or missing vehicles", () => {
    expect(capacityFor(null)).toBeNull();
    expect(capacityFor(undefined)).toBeNull();
    expect(capacityFor("rocket")).toBeNull();
  });
});

describe("hasRoomFor", () => {
  it("rejects a parcel heavier than the vehicle can ever carry", () => {
    const bike = courier({ id: "b", vehicleType: "motorbike" });
    expect(hasRoomFor(bike, 40_000)).toBe(false); // 40 kg on a motorbike
    expect(hasRoomFor(courier({ id: "c", vehicleType: "car" }), 40_000)).toBe(
      true,
    );
  });

  it("counts what the driver is already carrying", () => {
    const loaded = courier({
      id: "b",
      vehicleType: "motorbike",
      load: 2,
      loadWeightGrams: 25_000,
    });
    expect(hasRoomFor(loaded, 10_000)).toBe(false); // 25 + 10 > 30 kg
    expect(hasRoomFor(loaded, 5_000)).toBe(true); // exactly at the limit
  });

  it("stops at the parcel-count limit even for light parcels", () => {
    const full = courier({
      id: "b",
      vehicleType: "motorbike",
      load: VEHICLE_CAPACITY.motorbike.maxParcels,
      loadWeightGrams: 1_000,
    });
    expect(hasRoomFor(full, 100)).toBe(false);
  });

  it("leaves unknown vehicles unconstrained (legacy couriers)", () => {
    const legacy = courier({ id: "x", load: 999, loadWeightGrams: 9_999_999 });
    expect(hasRoomFor(legacy, 1_000_000)).toBe(true);
  });
});

describe("weightOfItems", () => {
  it("sums quantity × weight, defaulting unlabeled items", () => {
    expect(
      weightOfItems([
        { quantity: 2, weightGrams: 1_000 },
        { quantity: 3, weightGrams: null },
      ]),
    ).toBe(2_000 + 3 * DEFAULT_ITEM_WEIGHT_GRAMS);
    expect(weightOfItems([])).toBe(0);
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
        weightGrams: 40_000,
      }),
    ).toBe("z-car");
  });

  it("returns null when nobody can carry it", () => {
    const bike = courier({ id: "a", vehicleType: "motorbike" });
    const van = courier({ id: "b", vehicleType: "van" });
    expect(
      pickFrom([bike, van], "balanced", {
        destGovernorate: null,
        weightGrams: 600_000, // 600 kg beats even the van
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
        weightGrams: 100_000,
      }),
    ).toBe("b-van");
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
        weightGrams: 500,
      }),
    ).toBe("z-headed");
    // Different destination → back to least-loaded.
    expect(
      pickFrom([busyButHeaded, idle], "balanced", {
        destGovernorate: "Taiz",
        weightGrams: 500,
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
        weightGrams: 5_000,
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
        weightGrams: 500,
      }),
    ).toBe("z-far");
  });
});

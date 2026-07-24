import { describe, expect, it } from "vitest";

import type { ManifestRow } from "@/lib/point-core";
import { groupManifestByShelf } from "@/lib/point-manifest";

const row = (id: string, shelf: string | null): ManifestRow => ({
  shipmentId: id,
  trackingNumber: `YE${id}`,
  city: null,
  isCod: false,
  shelf,
});

describe("groupManifestByShelf", () => {
  it("groups parcels by bay", () => {
    const groups = groupManifestByShelf([
      row("1", "A1"),
      row("2", "B2"),
      row("3", "A1"),
    ]);
    expect(groups.map((g) => g.shelf)).toEqual(["A1", "B2"]);
    expect(groups[0].items.map((i) => i.shipmentId)).toEqual(["1", "3"]);
  });

  it("sorts bays naturally (A2 before A10)", () => {
    const groups = groupManifestByShelf([
      row("1", "A10"),
      row("2", "A2"),
      row("3", "A1"),
    ]);
    expect(groups.map((g) => g.shelf)).toEqual(["A1", "A2", "A10"]);
  });

  it("puts parcels with no bay last", () => {
    const groups = groupManifestByShelf([
      row("1", null),
      row("2", "B1"),
      row("3", null),
    ]);
    expect(groups.map((g) => g.shelf)).toEqual(["B1", null]);
    expect(groups[1].items).toHaveLength(2);
  });

  it("returns nothing for an empty manifest", () => {
    expect(groupManifestByShelf([])).toEqual([]);
  });
});

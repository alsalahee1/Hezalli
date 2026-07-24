import { describe, expect, it } from "vitest";

import { pickShelf, type ShelfSlot } from "@/lib/point-shelves";

const slots = (...codes: string[]): ShelfSlot[] =>
  codes.map((code) => ({ code, capacity: null, zone: null }));

describe("pickShelf", () => {
  it("returns null when there are no shelves", () => {
    expect(pickShelf([], new Map())).toBeNull();
  });

  it("picks the least-occupied bay", () => {
    const shelves = slots("A1", "A2", "A3");
    const occ = new Map([
      ["A1", 3],
      ["A2", 1],
      ["A3", 2],
    ]);
    expect(pickShelf(shelves, occ)).toBe("A2");
  });

  it("prefers the earliest bay on a tie (stable A1 over B1)", () => {
    const shelves = slots("A1", "B1", "C1");
    // All empty → first wins.
    expect(pickShelf(shelves, new Map())).toBe("A1");
    // Equal load → still the earliest.
    const occ = new Map([
      ["A1", 2],
      ["B1", 2],
      ["C1", 2],
    ]);
    expect(pickShelf(shelves, occ)).toBe("A1");
  });

  it("skips a bay that has reached its capacity", () => {
    const shelves: ShelfSlot[] = [
      { code: "A1", capacity: 2, zone: null },
      { code: "A2", capacity: 5, zone: null },
    ];
    // A1 is emptier but full; A2 has room.
    const occ = new Map([
      ["A1", 2],
      ["A2", 3],
    ]);
    expect(pickShelf(shelves, occ)).toBe("A2");
  });

  it("falls back to the least-occupied bay when every capped bay is full", () => {
    const shelves: ShelfSlot[] = [
      { code: "A1", capacity: 2, zone: null },
      { code: "A2", capacity: 2, zone: null },
    ];
    const occ = new Map([
      ["A1", 5],
      ["A2", 3],
    ]);
    // Both full → suggest the least loaded rather than block.
    expect(pickShelf(shelves, occ)).toBe("A2");
  });

  it("treats an unlisted bay as empty", () => {
    const shelves = slots("A1", "A2");
    const occ = new Map([["A1", 4]]);
    expect(pickShelf(shelves, occ)).toBe("A2");
  });

  describe("zones", () => {
    const zoned: ShelfSlot[] = [
      { code: "A1", capacity: null, zone: "PICKUP" },
      { code: "A2", capacity: null, zone: "PICKUP" },
      { code: "B1", capacity: null, zone: "DISPATCH" },
      { code: "B2", capacity: null, zone: "DISPATCH" },
    ];

    it("confines placement to bays in the requested zone", () => {
      // B1 is emptiest overall, but a PICKUP parcel must stay in the pickup row.
      const occ = new Map([
        ["A1", 2],
        ["A2", 3],
        ["B1", 0],
      ]);
      expect(pickShelf(zoned, occ, "PICKUP")).toBe("A1");
      expect(pickShelf(zoned, occ, "DISPATCH")).toBe("B1");
    });

    it("falls back to any bay when the point has none in that zone", () => {
      // No RETURNS bay registered → use the whole pool, least-occupied.
      const occ = new Map([["A1", 1]]);
      expect(pickShelf(zoned, occ, "RETURNS")).toBe("A2");
    });

    it("ignores zone when the parcel has none", () => {
      const occ = new Map([["A1", 5]]);
      expect(pickShelf(zoned, occ)).toBe("A2");
    });
  });

  describe("co-location", () => {
    it("consolidates onto the bay already holding the same destination", () => {
      const shelves = slots("A1", "A2", "A3");
      // A2 is not the emptiest, but it already holds this city's parcels.
      const occ = new Map([
        ["A1", 0],
        ["A2", 2],
        ["A3", 1],
      ]);
      const sameCity = new Map([["A2", 2]]);
      expect(pickShelf(shelves, occ, undefined, sameCity)).toBe("A2");
    });

    it("prefers the bay with the most of the destination (finish it first)", () => {
      const shelves = slots("A1", "A2", "A3");
      const occ = new Map([
        ["A1", 3],
        ["A2", 5],
        ["A3", 1],
      ]);
      const sameCity = new Map([
        ["A1", 1],
        ["A2", 4],
      ]);
      expect(pickShelf(shelves, occ, undefined, sameCity)).toBe("A2");
    });

    it("skips a full matching bay and co-locates on the next match", () => {
      const shelves: ShelfSlot[] = [
        { code: "A1", capacity: 2, zone: null },
        { code: "A2", capacity: 5, zone: null },
        { code: "A3", capacity: null, zone: null },
      ];
      // A1 has the most matches but is full → A2 (also a match) wins.
      const occ = new Map([
        ["A1", 2],
        ["A2", 1],
        ["A3", 0],
      ]);
      const sameCity = new Map([
        ["A1", 2],
        ["A2", 1],
      ]);
      expect(pickShelf(shelves, occ, undefined, sameCity)).toBe("A2");
    });

    it("falls back to least-busy when no bay holds the destination", () => {
      const shelves = slots("A1", "A2");
      const occ = new Map([["A1", 3]]);
      const sameCity = new Map<string, number>();
      expect(pickShelf(shelves, occ, undefined, sameCity)).toBe("A2");
    });
  });
});

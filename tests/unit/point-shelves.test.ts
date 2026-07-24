import { describe, expect, it } from "vitest";

import { pickShelf, type ShelfSlot } from "@/lib/point-shelves";

const slots = (...codes: string[]): ShelfSlot[] =>
  codes.map((code) => ({ code, capacity: null }));

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
      { code: "A1", capacity: 2 },
      { code: "A2", capacity: 5 },
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
      { code: "A1", capacity: 2 },
      { code: "A2", capacity: 2 },
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
});

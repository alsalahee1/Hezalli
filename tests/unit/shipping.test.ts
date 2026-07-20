import { describe, expect, it } from "vitest";

import { resolveShippingChoice, type StoreShipOptions } from "@/lib/shipping";

// Pure selection logic: given a store's quoted options and the buyer's chosen
// tier, pick the authoritative option. The server relies on this so a client
// can never smuggle in a cheaper fee than the tier it selected.
const opts: StoreShipOptions = {
  standard: { method: "STANDARD", fee: 5, etaMinDays: 3, etaMaxDays: 7 },
  express: { method: "EXPRESS", fee: 12, etaMinDays: 1, etaMaxDays: 2 },
  pickup: { method: "PICKUP", fee: 0, etaMinDays: 3, etaMaxDays: 7 },
};

describe("resolveShippingChoice", () => {
  it("returns the express option when express is chosen and available", () => {
    expect(resolveShippingChoice(opts, "EXPRESS")).toEqual(opts.express);
  });

  it("returns the standard option when standard is chosen", () => {
    expect(resolveShippingChoice(opts, "STANDARD")).toEqual(opts.standard);
  });

  it("falls back to standard when express is chosen but not offered", () => {
    const noExpress: StoreShipOptions = {
      standard: opts.standard,
      express: null,
      pickup: null,
    };
    expect(resolveShippingChoice(noExpress, "EXPRESS")).toEqual(opts.standard);
  });

  it("returns the pickup option when pickup is chosen and available", () => {
    expect(resolveShippingChoice(opts, "PICKUP")).toEqual(opts.pickup);
  });

  it("falls back to standard when pickup is chosen but not offered", () => {
    const noPickup: StoreShipOptions = {
      standard: opts.standard,
      express: opts.express,
      pickup: null,
    };
    expect(resolveShippingChoice(noPickup, "PICKUP")).toEqual(opts.standard);
  });

  it("returns a safe zero-fee standard default when options are missing", () => {
    const r = resolveShippingChoice(undefined, "EXPRESS");
    expect(r.method).toBe("STANDARD");
    expect(r.fee).toBe(0);
  });
});

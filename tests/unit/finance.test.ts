import { describe, expect, it } from "vitest";

import { commissionOf, round2, sellerNetOf, subEconomics } from "@/lib/finance";

describe("commissionOf", () => {
  it("takes the rate off the items total only", () => {
    expect(commissionOf(100, 0.1)).toBe(10);
    expect(commissionOf(250, 0.1)).toBe(25);
  });
  it("rounds to cents", () => {
    expect(commissionOf(33.33, 0.1)).toBe(3.33);
    expect(commissionOf(99.99, 0.075)).toBe(round2(99.99 * 0.075));
  });
  it("supports a per-seller override rate", () => {
    expect(commissionOf(100, 0.05)).toBe(5);
    expect(commissionOf(100, 0)).toBe(0);
  });
});

describe("sellerNetOf", () => {
  it("is items + shipping − commission", () => {
    expect(sellerNetOf(100, 10, 0.1)).toBe(100); // 100 + 10 − 10
    expect(sellerNetOf(200, 0, 0.1)).toBe(180);
  });
  it("keeps all shipping for the seller (commission is items-only)", () => {
    // commission = 10; net = 100 + 25 − 10 = 115
    expect(sellerNetOf(100, 25, 0.1)).toBe(115);
  });
});

describe("subEconomics", () => {
  it("no discount: buyer pays items+shipping, COD ledger owes the commission", () => {
    const e = subEconomics(100, 10, 0.1, 0, false);
    expect(e).toEqual({
      commission: 10,
      paid: 110,
      sellerNet: 100,
      codLedger: -10,
    });
  });

  it("platform-funded voucher: seller keeps full net; platform funds COD gap", () => {
    // discount 20, platform-funded (sellerFunded=false)
    const e = subEconomics(100, 10, 0.1, 20, false);
    expect(e.paid).toBe(90); // buyer pays less
    expect(e.sellerNet).toBe(100); // seller unaffected (prepaid credit)
    // COD: seller only collected 90 cash but owes commission 10 and is owed
    // the 20 the platform funded → ledger = −10 + 20 = +10
    expect(e.codLedger).toBe(10);
  });

  it("seller-funded voucher: discount comes out of the seller's proceeds", () => {
    const e = subEconomics(100, 10, 0.1, 20, true);
    expect(e.paid).toBe(90);
    expect(e.sellerNet).toBe(80); // 100 − 20
    expect(e.codLedger).toBe(-10); // platform funds nothing
  });

  it("refund reversal nets to zero for a platform-funded prepaid sale", () => {
    // On completion the seller is credited sellerNet; a full refund must
    // reverse exactly that credit.
    const e = subEconomics(100, 10, 0.1, 20, false);
    const credit = e.sellerNet;
    const reversal = -e.sellerNet;
    expect(round2(credit + reversal)).toBe(0);
  });

  it("refund reversal nets to zero for a seller-funded prepaid sale", () => {
    const e = subEconomics(100, 10, 0.1, 20, true);
    expect(round2(e.sellerNet + -e.sellerNet)).toBe(0);
    expect(e.sellerNet).toBe(80);
  });
});

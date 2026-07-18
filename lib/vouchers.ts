// Voucher validation + discount math. Store vouchers apply to that seller's
// sub-order; platform vouchers apply across the whole order and split
// proportionally by each sub-order's items subtotal. Percentage/fixed discounts
// come off items only; free-shipping waives the applicable shipping.
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

export type CartGroup = {
  storeId: string;
  itemsTotal: number;
  shipping: number;
};

export type DiscountBreakdown = {
  perStore: Record<string, number>; // storeId → discount USD
  total: number;
  freeShipping: boolean;
};

export type CouponInfo = {
  id: string;
  code: string;
  scope: "PLATFORM" | "SELLER";
  storeId: string | null;
  discountType: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
  maxDiscountUsd: number | null;
  minSpendUsd: number | null;
  maxUses: number | null;
};

// Which groups a coupon applies to (all, or the one matching a store coupon).
function applicableGroups(
  coupon: CouponInfo,
  groups: CartGroup[],
): CartGroup[] {
  if (coupon.scope === "SELLER") {
    return groups.filter((g) => g.storeId === coupon.storeId);
  }
  return groups;
}

export function computeDiscount(
  coupon: CouponInfo,
  groups: CartGroup[],
): DiscountBreakdown {
  const applicable = applicableGroups(coupon, groups);
  const perStore: Record<string, number> = {};
  let freeShipping = false;

  if (applicable.length === 0) {
    return { perStore, total: 0, freeShipping };
  }

  if (coupon.discountType === "FREE_SHIPPING") {
    freeShipping = true;
    for (const g of applicable) perStore[g.storeId] = round2(g.shipping);
  } else {
    const itemsSum = applicable.reduce((s, g) => s + g.itemsTotal, 0);
    let raw =
      coupon.discountType === "PERCENT"
        ? (itemsSum * coupon.value) / 100
        : Math.min(coupon.value, itemsSum);
    if (coupon.maxDiscountUsd != null) {
      raw = Math.min(raw, coupon.maxDiscountUsd);
    }
    raw = round2(raw);

    // Split proportionally by each group's items; last group absorbs rounding.
    let allocated = 0;
    applicable.forEach((g, i) => {
      let share: number;
      if (i === applicable.length - 1) {
        share = round2(raw - allocated);
      } else {
        share = itemsSum > 0 ? round2((raw * g.itemsTotal) / itemsSum) : 0;
        allocated = round2(allocated + share);
      }
      perStore[g.storeId] = Math.max(0, share);
    });
  }

  const total = round2(Object.values(perStore).reduce((s, v) => s + v, 0));
  return { perStore, total, freeShipping };
}

export type ValidateResult =
  | { ok: true; coupon: CouponInfo; discount: DiscountBreakdown }
  | { ok: false; error: string };

// Validate a coupon for a user + cart, returning the computed discount.
export async function validateCoupon(
  code: string,
  userId: string,
  groups: CartGroup[],
): Promise<ValidateResult> {
  const row = await prisma.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  if (!row || !row.isActive) return { ok: false, error: "notFound" };

  const now = Date.now();
  if (row.startsAt && now < row.startsAt.getTime()) {
    return { ok: false, error: "notStarted" };
  }
  if (row.endsAt && now > row.endsAt.getTime()) {
    return { ok: false, error: "expired" };
  }

  const coupon: CouponInfo = {
    id: row.id,
    code: row.code,
    scope: row.scope as "PLATFORM" | "SELLER",
    storeId: row.storeId,
    discountType: row.discountType as CouponInfo["discountType"],
    value: Number(row.value),
    maxDiscountUsd:
      row.maxDiscountUsd == null ? null : Number(row.maxDiscountUsd),
    minSpendUsd: row.minSpendUsd == null ? null : Number(row.minSpendUsd),
    maxUses: row.maxUses,
  };

  const applicable = applicableGroups(coupon, groups);
  if (applicable.length === 0) return { ok: false, error: "notApplicable" };

  const itemsSum = applicable.reduce((s, g) => s + g.itemsTotal, 0);
  if (coupon.minSpendUsd != null && itemsSum < coupon.minSpendUsd) {
    return { ok: false, error: "minNotMet" };
  }

  if (row.maxUses != null && row.usedCount >= row.maxUses) {
    return { ok: false, error: "usedUp" };
  }
  if (row.perUserLimit != null) {
    const used = await prisma.couponRedemption.count({
      where: { couponId: row.id, userId },
    });
    if (used >= row.perUserLimit) {
      return { ok: false, error: "perUserReached" };
    }
  }

  const discount = computeDiscount(coupon, groups);
  if (discount.total <= 0) return { ok: false, error: "noDiscount" };

  return { ok: true, coupon, discount };
}

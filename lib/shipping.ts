// Flat "Standard shipping" for Phase 8 — real zone/carrier rates land in
// Phase 10. One fee per seller group, waived over a free-shipping threshold.
export const FREE_SHIPPING_THRESHOLD = 50;
export const STANDARD_SHIPPING_FEE = 5;

export function standardShipping(sellerSubtotalUsd: number): number {
  return sellerSubtotalUsd >= FREE_SHIPPING_THRESHOLD
    ? 0
    : STANDARD_SHIPPING_FEE;
}

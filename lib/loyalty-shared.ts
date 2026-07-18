// Pure loyalty math — safe to import from client components (no server deps).
// The server-only pieces (earning, referral, code generation) live in
// lib/loyalty.ts, which re-exports everything here.
export const POINTS_PER_USD_EARNED = 1; // 1 point per $1 of items purchased
export const POINTS_PER_USD_REDEEMED = 100; // 100 points = $1 off
export const REFERRAL_BONUS_POINTS = 200; // referrer bonus on referee's 1st order
export const MAX_REDEEM_FRACTION = 0.5; // points cover at most 50% of items

const round2 = (n: number) => Math.round(n * 100) / 100;

export function pointsToUsd(points: number): number {
  return round2(points / POINTS_PER_USD_REDEEMED);
}

/** Cap a redemption request to the balance and the per-order ceiling. Pure. */
export function capRedemption(
  requestedPoints: number,
  balance: number,
  itemsTotal: number,
): { pointsUsed: number; discountUsd: number } {
  const usable = Math.max(
    0,
    Math.min(Math.floor(requestedPoints || 0), Math.floor(balance || 0)),
  );
  const maxDiscountUsd = round2(itemsTotal * MAX_REDEEM_FRACTION);
  const discountUsd = Math.min(pointsToUsd(usable), maxDiscountUsd);
  const pointsUsed = Math.round(discountUsd * POINTS_PER_USD_REDEEMED);
  return { pointsUsed, discountUsd };
}

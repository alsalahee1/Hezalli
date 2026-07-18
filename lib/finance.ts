// Money helpers. The ledger is the source of truth: availableUsd is always the
// sum of a seller's ledger entries, and pendingUsd is the escrow held for
// prepaid, paid-but-not-completed sub-orders. Balances are recomputed, never
// edited in place. All amounts are USD (USDT treated 1:1).
import { prisma } from "@/lib/prisma";

export const round2 = (n: number) => Math.round(n * 100) / 100;

const ESCROW_STATUSES = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

export function commissionOf(itemsTotal: number, rate: number): number {
  return round2(itemsTotal * rate);
}
export function sellerNetOf(
  itemsTotal: number,
  shipping: number,
  rate: number,
): number {
  return round2(itemsTotal + shipping - commissionOf(itemsTotal, rate));
}

/** Ensure a SellerBalance row exists for a seller profile, return its id. */
export async function getBalanceId(sellerProfileId: string): Promise<string> {
  const bal = await prisma.sellerBalance.upsert({
    where: { sellerId: sellerProfileId },
    create: { sellerId: sellerProfileId },
    update: {},
    select: { id: true },
  });
  return bal.id;
}

/**
 * Recompute availableUsd (= Σ ledger) and pendingUsd (= escrow for prepaid
 * sub-orders that are paid but not yet completed) for a seller profile.
 */
export async function recomputeBalance(sellerProfileId: string): Promise<void> {
  const balanceId = await getBalanceId(sellerProfileId);

  const agg = await prisma.ledgerEntry.aggregate({
    where: { balanceId },
    _sum: { amountUsd: true },
  });
  const available = round2(Number(agg._sum.amountUsd ?? 0));

  const escrow = await prisma.subOrder.findMany({
    where: {
      store: { sellerId: sellerProfileId },
      status: { in: ESCROW_STATUSES as never },
      order: {
        paymentMethod: { not: "COD" },
        payment: { status: "CONFIRMED" },
      },
    },
    select: { itemsTotal: true, shippingTotal: true, commissionRate: true },
  });
  let pending = 0;
  for (const s of escrow) {
    pending += sellerNetOf(
      Number(s.itemsTotal),
      Number(s.shippingTotal),
      Number(s.commissionRate),
    );
  }

  await prisma.sellerBalance.update({
    where: { id: balanceId },
    data: { availableUsd: available, pendingUsd: round2(pending) },
  });
}

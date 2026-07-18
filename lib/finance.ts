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

/** Global platform commission rate (admin-configurable), fallback 10%. */
export async function getCommissionRate(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: "commission_rate" },
    select: { value: true },
  });
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : 0.1;
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

/**
 * Settle a sub-order on completion: write the immutable ledger entry and
 * recompute the seller's balance. Idempotent — a second call is a no-op.
 * - Prepaid: SALE credit of (items + shipping − commission) moves from escrow
 *   to available.
 * - COD: the seller already holds the cash, so only the commission is charged
 *   (COD_COMMISSION_DUE, negative) — the balance may go negative.
 */
export async function settleSubOrder(subOrderId: string): Promise<void> {
  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: {
      id: true,
      itemsTotal: true,
      shippingTotal: true,
      commissionRate: true,
      completedAt: true,
      store: { select: { sellerId: true } },
      order: { select: { paymentMethod: true } },
    },
  });
  if (!sub) return;

  const already = await prisma.ledgerEntry.count({
    where: { subOrderId, type: { in: ["SALE", "COD_COMMISSION_DUE"] } },
  });
  if (already > 0) return; // already settled

  const itemsTotal = Number(sub.itemsTotal);
  const shipping = Number(sub.shippingTotal);
  const rate = Number(sub.commissionRate);
  const commission = commissionOf(itemsTotal, rate);
  const sellerNet = sellerNetOf(itemsTotal, shipping, rate);
  const balanceId = await getBalanceId(sub.store.sellerId);

  if (sub.order.paymentMethod === "COD") {
    await prisma.ledgerEntry.create({
      data: {
        balanceId,
        type: "COD_COMMISSION_DUE",
        amountUsd: -commission,
        subOrderId,
        note: "COD commission owed to platform",
      },
    });
  } else {
    await prisma.ledgerEntry.create({
      data: {
        balanceId,
        type: "SALE",
        amountUsd: sellerNet,
        subOrderId,
        note: "Sale settled (item + shipping − commission)",
      },
    });
  }

  await prisma.subOrder.update({
    where: { id: subOrderId },
    data: {
      commissionAmt: commission,
      sellerNet,
      completedAt: sub.completedAt ?? new Date(),
    },
  });
  await recomputeBalance(sub.store.sellerId);
}

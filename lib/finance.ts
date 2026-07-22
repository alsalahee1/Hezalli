// Money helpers. The ledger is the source of truth: availableUsd is always the
// sum of a seller's ledger entries, and pendingUsd is the escrow held for
// prepaid, paid-but-not-completed sub-orders. Balances are recomputed, never
// edited in place. All amounts are USD (USDT treated 1:1).
import { isUniqueViolation } from "@/lib/db-errors";
import { awardPurchasePoints } from "@/lib/loyalty";
import {
  COD_DELIVERY_CONFIRMED_BY,
  codSettledDigitally,
} from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { creditPurchaseCashback } from "@/lib/wallet-cashback";

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

export type SubEconomics = {
  commission: number;
  paid: number; // what the buyer actually paid (after discount)
  sellerNet: number; // prepaid SALE credit
  codLedger: number; // COD ledger amount (commission owed, plus platform funding)
};

// Per-sub-order economics with a voucher discount. A seller-funded voucher
// (store scope) comes out of the seller's proceeds; a platform-funded voucher
// (platform scope) does not — the platform absorbs it (and, for COD, funds the
// seller the discount so they aren't short the cash they never collected).
export function subEconomics(
  itemsTotal: number,
  shipping: number,
  rate: number,
  discount: number,
  sellerFunded: boolean,
): SubEconomics {
  const commission = commissionOf(itemsTotal, rate);
  const paid = round2(itemsTotal + shipping - discount);
  const sellerNet = round2(
    itemsTotal + shipping - commission - (sellerFunded ? discount : 0),
  );
  const codLedger = round2(-commission + (sellerFunded ? 0 : discount));
  return { commission, paid, sellerNet, codLedger };
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

  // availableUsd = Σ ledger, set in a single statement so a concurrent ledger
  // write can never be lost to a read-then-write window (ledger amounts are
  // stored at 2 decimal places, so the SUM is already exact).
  await prisma.$executeRaw`
    UPDATE "SellerBalance"
    SET "availableUsd" = COALESCE(
      (SELECT SUM("amountUsd") FROM "LedgerEntry" WHERE "balanceId" = ${balanceId}),
      0
    )
    WHERE "id" = ${balanceId}`;

  // pendingUsd is escrow held for prepaid, paid-but-not-completed sub-orders. It
  // is display-only (never spent against), so a briefly-stale value is harmless.
  const escrow = await prisma.subOrder.findMany({
    where: {
      store: { sellerId: sellerProfileId },
      status: { in: ESCROW_STATUSES as never },
      order: {
        payment: { status: "CONFIRMED" },
        OR: [
          { paymentMethod: { not: "COD" } },
          // A COD order the buyer settled digitally before handover (docs
          // §39): the platform holds the money, so it is escrow like any
          // prepaid order. A doorstep cash capture (confirmedBy
          // "system:delivery", or null on legacy rows) is not.
          {
            payment: {
              is: {
                AND: [
                  { confirmedBy: { not: null } },
                  { confirmedBy: { not: COD_DELIVERY_CONFIRMED_BY } },
                ],
              },
            },
          },
        ],
      },
    },
    select: {
      itemsTotal: true,
      shippingTotal: true,
      discountTotal: true,
      commissionRate: true,
      order: { select: { coupon: { select: { scope: true } } } },
    },
  });
  let pending = 0;
  for (const s of escrow) {
    const sellerFunded = s.order.coupon?.scope === "SELLER";
    pending += subEconomics(
      Number(s.itemsTotal),
      Number(s.shippingTotal),
      Number(s.commissionRate),
      Number(s.discountTotal),
      sellerFunded,
    ).sellerNet;
  }

  await prisma.sellerBalance.update({
    where: { id: balanceId },
    data: { pendingUsd: round2(pending) },
  });
}

/**
 * Settle a sub-order on completion: write the immutable ledger entry and
 * recompute the seller's balance. Idempotent — a second call is a no-op.
 * - Prepaid: SALE credit of (items + shipping − commission) moves from escrow
 *   to available.
 * - Cash-basis COD: the seller/courier side already holds the cash, so only
 *   the commission is charged (COD_COMMISSION_DUE, negative) — the balance may
 *   go negative.
 * - COD settled digitally before handover (docs §39): the platform holds the
 *   buyer's money, so it settles exactly like a prepaid order (SALE credit).
 */
export async function settleSubOrder(subOrderId: string): Promise<void> {
  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: {
      id: true,
      orderId: true,
      itemsTotal: true,
      shippingTotal: true,
      discountTotal: true,
      commissionRate: true,
      completedAt: true,
      store: { select: { sellerId: true } },
      order: {
        select: {
          buyerId: true,
          paymentMethod: true,
          payment: { select: { status: true, confirmedBy: true } },
          coupon: { select: { scope: true } },
        },
      },
    },
  });
  if (!sub) return;

  const already = await prisma.ledgerEntry.count({
    where: { subOrderId, type: { in: ["SALE", "COD_COMMISSION_DUE"] } },
  });
  if (already > 0) return; // already settled (fast path)

  const itemsTotal = Number(sub.itemsTotal);
  const shipping = Number(sub.shippingTotal);
  const rate = Number(sub.commissionRate);
  const sellerFunded = sub.order.coupon?.scope === "SELLER";
  const eco = subEconomics(
    itemsTotal,
    shipping,
    rate,
    Number(sub.discountTotal),
    sellerFunded,
  );
  const commission = eco.commission;
  const sellerNet = eco.sellerNet;
  const balanceId = await getBalanceId(sub.store.sellerId);

  // Write the settlement entry + sub-order economics atomically. The partial
  // unique index on LedgerEntry (SALE / COD_COMMISSION_DUE per sub-order) is the
  // real idempotency guard: if a concurrent settle already inserted the entry,
  // this transaction fails with a unique violation and we treat it as a no-op.
  const codCashBasis =
    sub.order.paymentMethod === "COD" && !codSettledDigitally(sub.order);

  try {
    await prisma.$transaction(async (tx) => {
      if (codCashBasis) {
        await tx.ledgerEntry.create({
          data: {
            balanceId,
            type: "COD_COMMISSION_DUE",
            amountUsd: eco.codLedger,
            subOrderId,
            note: "COD commission owed to platform",
          },
        });
      } else {
        await tx.ledgerEntry.create({
          data: {
            balanceId,
            type: "SALE",
            amountUsd: sellerNet,
            subOrderId,
            note: "Sale settled (item + shipping − commission)",
          },
        });
      }
      await tx.subOrder.update({
        where: { id: subOrderId },
        data: {
          commissionAmt: commission,
          sellerNet,
          completedAt: sub.completedAt ?? new Date(),
        },
      });
    });
  } catch (e) {
    // A concurrent settle won the race — fall through to the idempotent
    // recompute + rewards below (they are guarded by their own unique indexes).
    if (!isUniqueViolation(e)) throw e;
  }
  await recomputeBalance(sub.store.sellerId);

  // Loyalty: reward the buyer for this completed purchase (idempotent).
  await awardPurchasePoints(
    sub.order.buyerId,
    sub.orderId,
    subOrderId,
    Number(sub.itemsTotal),
  );
  // Wallet cashback: credit a fraction to the buyer's wallet (idempotent;
  // no-op unless an admin has set a cashback rate). Step 19.5.
  await creditPurchaseCashback(
    sub.order.buyerId,
    sub.orderId,
    subOrderId,
    Number(sub.itemsTotal),
  );
}

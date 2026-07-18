// Wallet cashback (Step 19.5). On order completion, credit a configurable
// fraction of the items total to the buyer's HezalliPay wallet as a CASHBACK
// entry. Off by default (rate 0). Idempotent per sub-order.
//
// Parity note: like loyalty EARN points, cashback is not clawed back if a
// completed order is later refunded — the exposure is bounded by the (small)
// rate and completion means the buyer already confirmed receipt.
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

/** Configured cashback fraction (0..1); 0 disables the feature. */
export async function getCashbackRate(): Promise<number> {
  const rate = await getSetting("wallet_cashback_rate");
  return Number.isFinite(rate) && rate > 0 && rate < 1 ? rate : 0;
}

/**
 * Credit purchase cashback to the buyer's wallet (idempotent per sub-order).
 * Called from settleSubOrder on completion. A no-op when the rate is 0.
 */
export async function creditPurchaseCashback(
  buyerId: string,
  orderId: string,
  subOrderId: string,
  itemsTotal: number,
): Promise<void> {
  const rate = await getCashbackRate();
  if (rate <= 0) return;

  const amount = round2(itemsTotal * rate);
  if (amount <= 0) return;

  const walletId = await getWalletId(buyerId);

  // Idempotency: never credit the same sub-order twice.
  const dupe = await prisma.walletEntry.findFirst({
    where: { walletId, subOrderId, type: "CASHBACK" },
    select: { id: true },
  });
  if (dupe) return;

  await prisma.$transaction(async (tx) => {
    await creditWalletTx(tx, walletId, {
      type: "CASHBACK",
      amountUsd: amount,
      orderId,
      subOrderId,
      note: "Purchase cashback",
    });
  });
  await recomputeWalletBalance(buyerId);
}

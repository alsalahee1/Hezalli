"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireActiveSeller } from "@/lib/authz";
import { getBalanceId, recomputeBalance, round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

// Carries an i18n error code out of the reservation transaction so it can be
// rolled back and mapped to a typed result.
class ReserveError extends Error {}

// Seller sweeps (part of) their available earnings into their HezalliPay wallet,
// giving them one balance across buying and selling. Bridges the two ledgers: a
// WALLET_TRANSFER debit on the seller balance + a SELLER_EARNINGS credit on the
// wallet, in one transaction. Neither ledger is refactored.
export async function transferEarningsToWallet(
  amountUsd?: number,
): Promise<Result> {
  const locale = await getLocale();
  // Money outflow: reject a suspended/deleted seller before touching balances.
  const gate = await requireActiveSeller();
  if (!gate) return { error: "notSeller" };
  const userId = gate.userId;
  const profile = { id: gate.profileId };

  await recomputeBalance(profile.id);
  const balanceId = await getBalanceId(profile.id);
  const walletId = await getWalletId(userId);

  // Compute the free balance and move it under a row lock on the seller's
  // balance, so two concurrent "move all" submissions (or a transfer racing a
  // payout request) can't each pass the check and together over-draw — which
  // would drive the seller ledger negative while crediting the wallet twice.
  let moved = 0;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SellerBalance" WHERE "id" = ${balanceId} FOR UPDATE`;
      // Reserve against outstanding payout requests (same rule as requestPayout).
      // Read the requests BEFORE the ledger: markPayoutPaid flips a request to
      // PAID and writes its ledger debit in one commit without taking this lock,
      // and under READ COMMITTED each statement sees a fresh snapshot — in this
      // order a flip landing between the reads is counted twice (still reserved
      // AND already debited) so the move fails closed instead of double-paying.
      const outstanding = await tx.payout.aggregate({
        where: {
          sellerId: profile.id,
          status: { in: ["REQUESTED", "APPROVED"] },
        },
        _sum: { amountUsd: true },
      });
      const availAgg = await tx.ledgerEntry.aggregate({
        where: { balanceId },
        _sum: { amountUsd: true },
      });
      const available = round2(Number(availAgg._sum.amountUsd ?? 0));
      const free = round2(available - Number(outstanding._sum.amountUsd ?? 0));
      if (free <= 0) throw new ReserveError("nothingToMove");
      const amount = amountUsd && amountUsd > 0 ? round2(amountUsd) : free;
      // amount can round to 0 (e.g. 0.004) — refuse rather than write 0-rows.
      if (amount <= 0) throw new ReserveError("nothingToMove");
      if (amount > free) throw new ReserveError("insufficient");

      // Debit the seller ledger.
      await tx.ledgerEntry.create({
        data: {
          balanceId,
          type: "WALLET_TRANSFER",
          amountUsd: -amount,
          note: "Moved to HezalliPay wallet",
        },
      });
      // Credit the wallet.
      await creditWalletTx(tx, walletId, {
        type: "SELLER_EARNINGS",
        amountUsd: amount,
        note: "Moved from seller earnings",
      });
      moved = amount;
    });
  } catch (e) {
    if (e instanceof ReserveError) return { error: e.message };
    throw e;
  }
  if (moved <= 0) return { error: "nothingToMove" };

  await recomputeBalance(profile.id);
  await recomputeWalletBalance(userId);

  revalidatePath(`/${locale}/seller/finance`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

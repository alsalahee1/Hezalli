"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { getBalanceId, recomputeBalance, round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

// Seller sweeps (part of) their available earnings into their HezalliPay wallet,
// giving them one balance across buying and selling. Bridges the two ledgers: a
// WALLET_TRANSFER debit on the seller balance + a SELLER_EARNINGS credit on the
// wallet, in one transaction. Neither ledger is refactored.
export async function transferEarningsToWallet(
  amountUsd?: number,
): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) return { error: "notSeller" };

  await recomputeBalance(profile.id);
  const balance = await prisma.sellerBalance.findUnique({
    where: { sellerId: profile.id },
    select: { availableUsd: true },
  });
  const available = Number(balance?.availableUsd ?? 0);

  // Reserve against outstanding payout requests (same rule as requestPayout).
  const outstanding = await prisma.payout.aggregate({
    where: { sellerId: profile.id, status: { in: ["REQUESTED", "APPROVED"] } },
    _sum: { amountUsd: true },
  });
  const free = round2(available - Number(outstanding._sum.amountUsd ?? 0));
  if (free <= 0) return { error: "nothingToMove" };

  const amount = amountUsd && amountUsd > 0 ? round2(amountUsd) : free;
  if (amount > free) return { error: "insufficient" };

  const balanceId = await getBalanceId(profile.id);
  const walletId = await getWalletId(userId);

  await prisma.$transaction(async (tx) => {
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
  });

  await recomputeBalance(profile.id);
  await recomputeWalletBalance(userId);

  revalidatePath(`/${locale}/seller/finance`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

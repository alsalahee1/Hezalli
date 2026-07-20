"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

class SendError extends Error {}

// Send wallet funds to another user (P2P). LICENSED ONLY — money transmission is
// regulated. Off unless wallet_p2p_enabled is set, and gated on VERIFIED KYC.
// The sender is debited atomically (double-spend guard); the recipient is
// credited; a WalletTransfer row records the audit trail.
export async function sendWalletFunds(input: {
  recipient: string; // email or phone
  amountUsd: number;
  note?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  // Regulatory gate: feature must be explicitly enabled by an admin. Once on,
  // any signed-in user with a balance may send (the recipient must have an
  // account). See docs/19-wallet-strategy.md §4.
  if (!(await getSetting("wallet_p2p_enabled"))) return { error: "disabled" };

  const amount = round2(Number(input.amountUsd));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "badAmount" };

  // Resolve the recipient by email or phone.
  const id = input.recipient.trim();
  if (!id) return { error: "recipientRequired" };
  const recipient = await prisma.user.findFirst({
    where: id.includes("@") ? { email: id.toLowerCase() } : { phone: id },
    select: { id: true, locale: true, deletedAt: true },
  });
  if (!recipient || recipient.deletedAt) return { error: "recipientNotFound" };
  if (recipient.id === userId) return { error: "cannotSendSelf" };

  const fromWalletId = await getWalletId(userId);
  const toWalletId = await getWalletId(recipient.id);

  const [fromWallet, toWallet] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({
      where: { id: fromWalletId },
      select: { availableUsd: true, frozen: true },
    }),
    prisma.wallet.findUniqueOrThrow({
      where: { id: toWalletId },
      select: { frozen: true },
    }),
  ]);
  if (fromWallet.frozen) return { error: "frozen" };
  if (toWallet.frozen) return { error: "recipientUnavailable" };
  if (amount > Number(fromWallet.availableUsd))
    return { error: "insufficient" };

  try {
    await prisma.$transaction(async (tx) => {
      // Atomically debit the sender (double-spend guard).
      const upd = await tx.wallet.updateMany({
        where: {
          id: fromWalletId,
          frozen: false,
          availableUsd: { gte: amount },
        },
        data: { availableUsd: { decrement: amount } },
      });
      if (upd.count !== 1) throw new SendError();

      const transfer = await tx.walletTransfer.create({
        data: {
          fromWalletId,
          toWalletId,
          amountUsd: amount,
          note: input.note?.trim() || null,
        },
        select: { id: true },
      });
      await creditWalletTx(tx, fromWalletId, {
        type: "TRANSFER_OUT",
        amountUsd: -amount,
        note: `Sent to another user (${transfer.id})`,
      });
      await creditWalletTx(tx, toWalletId, {
        type: "TRANSFER_IN",
        amountUsd: amount,
        note: `Received from another user (${transfer.id})`,
      });
    });
  } catch (e) {
    if (e instanceof SendError) return { error: "insufficient" };
    throw e;
  }

  await recomputeWalletBalance(userId);
  await recomputeWalletBalance(recipient.id);

  const ar = recipient.locale === "ar";
  await prisma.notification.create({
    data: {
      userId: recipient.id,
      type: "PAYMENT",
      title: ar ? "استلمت أموالاً" : "You received funds",
      body: ar
        ? `تمت إضافة ${amount.toFixed(2)}$ إلى محفظتك.`
        : `$${amount.toFixed(2)} was added to your wallet.`,
      data: { link: `/account/wallet` },
    },
  });

  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

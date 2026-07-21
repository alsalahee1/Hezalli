// Shared wallet-to-wallet transfer core (Step 19.6). Used by P2P send, pay-by-QR
// (pay a user), and paying a money request. NOT a server action — callers pass
// the *authenticated* sender id, so this can never be invoked with an arbitrary
// `fromUserId` from the client. Callers own auth + the wallet_p2p_enabled gate.
import { round2 } from "@/lib/finance";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import {
  assertOutflowWithinLimitTx,
  outflowCaps,
  VelocityError,
} from "@/lib/wallet-velocity";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string; entryId?: string };

class TransferError extends Error {}

/**
 * Move `amountUsd` from one user's wallet to another's, atomically. Debits the
 * sender with a double-spend guard, credits the recipient, writes a
 * WalletTransfer audit row + TRANSFER_OUT/IN ledger entries, and notifies the
 * recipient. Returns a typed error instead of throwing for expected cases.
 */
export async function transferFunds(
  fromUserId: string,
  toUserId: string,
  amountUsd: number,
  note?: string | null,
): Promise<Result> {
  const amount = round2(Number(amountUsd));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "badAmount" };
  if (fromUserId === toUserId) return { error: "cannotSendSelf" };

  const recipient = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true, locale: true, deletedAt: true },
  });
  if (!recipient || recipient.deletedAt) return { error: "recipientNotFound" };

  const fromWalletId = await getWalletId(fromUserId);
  const toWalletId = await getWalletId(toUserId);

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

  const cleanNote = note?.trim() || null;
  // Compute the sender's velocity caps up front (reads settings/KYC), then enforce
  // them authoritatively inside the transaction under a wallet row lock so parallel
  // sends can't collectively slip past the AML cap.
  const caps = await outflowCaps(fromUserId);
  let senderEntryId = "";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${fromWalletId} FOR UPDATE`;
      await assertOutflowWithinLimitTx(tx, fromWalletId, caps, amount);
      const upd = await tx.wallet.updateMany({
        where: {
          id: fromWalletId,
          frozen: false,
          availableUsd: { gte: amount },
        },
        data: { availableUsd: { decrement: amount } },
      });
      if (upd.count !== 1) throw new TransferError();

      const transfer = await tx.walletTransfer.create({
        data: { fromWalletId, toWalletId, amountUsd: amount, note: cleanNote },
        select: { id: true },
      });
      const senderEntry = await creditWalletTx(tx, fromWalletId, {
        type: "TRANSFER_OUT",
        amountUsd: -amount,
        note: `Sent to another user (${transfer.id})`,
        refType: "transfer",
        refId: transfer.id,
      });
      senderEntryId = senderEntry.id;
      await creditWalletTx(tx, toWalletId, {
        type: "TRANSFER_IN",
        amountUsd: amount,
        note: `Received from another user (${transfer.id})`,
        refType: "transfer",
        refId: transfer.id,
      });
    });
  } catch (e) {
    if (e instanceof VelocityError) return { error: e.reason };
    if (e instanceof TransferError) return { error: "insufficient" };
    throw e;
  }

  await recomputeWalletBalance(fromUserId);
  await recomputeWalletBalance(toUserId);

  const ar = recipient.locale === "ar";
  await notify({
    userId: toUserId,
    type: "PAYMENT",
    title: ar ? "استلمت أموالاً" : "You received funds",
    body: ar
      ? `تمت إضافة ${amount.toFixed(2)}$ إلى محفظتك.`
      : `$${amount.toFixed(2)} was added to your wallet.`,
    link: "/account/wallet",
  });

  return { ok: true, entryId: senderEntryId };
}

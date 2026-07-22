"use server";

// Instant digital COD remittance to the Hezalli wallet. A courier settles the
// COD cash they collected by moving the same amount from their own HezalliPay
// balance into the platform wallet (lib/platform-wallet.ts). One transaction
// bridges the two ledgers — like lib/actions/earnings-wallet.ts — so the wallet
// debit/credit and the courier REMITTANCE settlement commit together or not at
// all: the driver's "cash to remit" can never clear without the money actually
// moving, and vice versa. No staff approval, unlike the rail-based RemitClaim
// (lib/actions/remit-claim.ts), because the money moves inside HezalliPay.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireCourierId } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { getPlatformWalletUserId } from "@/lib/platform-wallet";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";
import { verifyWalletAuth, type WalletAuth } from "@/lib/wallet-step-auth";

type Result = { ok?: boolean; error?: string; moved?: number };

// Carries an i18n error code out of the transaction so it rolls back and maps
// to a typed result. Error keys resolve in the Wallet i18n namespace (the
// WalletAuthField that submits this action renders them).
class RemitError extends Error {}

// The signed courier-ledger rows that make up "cash on hand".
const CASH_TYPES = ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT"] as const;

/**
 * Courier settles (part of) their held COD cash into the Hezalli wallet from
 * their own HezalliPay balance. Omit amountUsd to settle the full amount the
 * balance can cover. Requires wallet step-up auth (PIN or passkey) like every
 * other wallet outflow.
 */
export async function remitCodToHezalliWallet(
  input: { amountUsd?: number } & WalletAuth,
): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };

  // Throttle churn (wrong-PIN retries, double taps) into the money path.
  if (!rateLimit(`codwremit:${courierId}`, 6, 10 * 60_000).ok) {
    return { error: "tooMany" };
  }

  const auth = await verifyWalletAuth(courierId, input);
  if (!auth.ok) return { error: auth.error };

  const platformUserId = await getPlatformWalletUserId();
  if (!platformUserId) return { error: "noRemitTarget" };
  if (platformUserId === courierId) return { error: "cannotSendSelf" };

  const requested =
    input.amountUsd && input.amountUsd > 0 ? round2(input.amountUsd) : null;
  if (input.amountUsd != null && (requested == null || requested <= 0)) {
    return { error: "badAmount" };
  }

  const fromWalletId = await getWalletId(courierId);
  const toWalletId = await getWalletId(platformUserId);

  let moved = 0;
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize this courier's cash settlements so two concurrent submits
      // can't both pass the cash/balance checks and over-remit.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${courierId} FOR UPDATE`;

      // Cash the driver still holds (must never remit more than this).
      const cashAgg = await tx.courierLedgerEntry.aggregate({
        where: { courierId, type: { in: [...CASH_TYPES] } },
        _sum: { amountUsd: true },
      });
      const cashHeld = round2(Number(cashAgg._sum.amountUsd ?? 0));
      if (cashHeld <= 0) throw new RemitError("overRemit");

      // The driver funds the settlement from their spendable balance — a COD
      // collateral pledge (codHoldUsd) is not spendable.
      const w = await tx.wallet.findUniqueOrThrow({
        where: { id: fromWalletId },
        select: { availableUsd: true, frozen: true, codHoldUsd: true },
      });
      if (w.frozen) throw new RemitError("frozen");
      const toWallet = await tx.wallet.findUniqueOrThrow({
        where: { id: toWalletId },
        select: { frozen: true },
      });
      if (toWallet.frozen) throw new RemitError("recipientUnavailable");

      const hold = Number(w.codHoldUsd);
      const spendable = round2(Number(w.availableUsd) - hold);
      const amount = requested ?? round2(Math.min(cashHeld, spendable));
      if (amount <= 0) throw new RemitError("insufficient");
      if (amount > cashHeld + 0.005) throw new RemitError("overRemit");
      if (amount > spendable + 0.005) throw new RemitError("insufficient");

      // Debit the driver's wallet with a double-spend guard: the row must still
      // hold amount + pledged collateral when the decrement lands.
      const upd = await tx.wallet.updateMany({
        where: {
          id: fromWalletId,
          frozen: false,
          availableUsd: { gte: round2(amount + hold) },
        },
        data: { availableUsd: { decrement: amount } },
      });
      if (upd.count !== 1) throw new RemitError("insufficient");

      // Audit row + double-entry ledger, same shape as a P2P transfer.
      const transfer = await tx.walletTransfer.create({
        data: {
          fromWalletId,
          toWalletId,
          amountUsd: amount,
          note: "COD remittance to Hezalli",
        },
        select: { id: true },
      });
      await creditWalletTx(tx, fromWalletId, {
        type: "TRANSFER_OUT",
        amountUsd: -amount,
        note: `COD remittance to Hezalli (${transfer.id})`,
        refType: "transfer",
        refId: transfer.id,
      });
      await creditWalletTx(tx, toWalletId, {
        type: "TRANSFER_IN",
        amountUsd: amount,
        note: `COD remittance from courier (${transfer.id})`,
        refType: "transfer",
        refId: transfer.id,
      });

      // Settle the courier's cash-on-hand in the SAME transaction.
      await tx.courierLedgerEntry.create({
        data: {
          courierId,
          type: "REMITTANCE",
          amountUsd: -amount,
          note: `Settled to Hezalli wallet (${transfer.id})`,
          createdById: courierId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: courierId,
          action: "cod.remitToWallet",
          entity: "WalletTransfer",
          entityId: transfer.id,
          meta: { amountUsd: amount, toUserId: platformUserId },
        },
      });

      moved = amount;
    });
  } catch (e) {
    if (e instanceof RemitError) return { error: e.message };
    throw e;
  }
  if (moved <= 0) return { error: "insufficient" };

  // Recompute both balances from their ledgers now the transaction has committed.
  await recomputeWalletBalance(courierId);
  await recomputeWalletBalance(platformUserId);

  const locale = await getLocale();
  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/driver/ledger`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true, moved };
}

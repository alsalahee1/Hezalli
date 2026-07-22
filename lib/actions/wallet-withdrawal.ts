"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { verifyWalletAuth } from "@/lib/wallet-step-auth";
import { checkOutflowLimit } from "@/lib/wallet-velocity";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

class ReserveError extends Error {}

// Buyer requests a cash-out of (part of) their wallet balance to their saved
// payout destination. Gated on VERIFIED KYC. The amount is RESERVED at request
// time — a CASHOUT ledger entry debits the wallet immediately so the funds
// cannot also be spent at checkout (double-spend guard). A rejection returns it.
export async function requestWithdrawal(
  amountUsd?: number,
  auth_?: { pin?: string; passkey?: string },
): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const authCheck = await verifyWalletAuth(userId, auth_ ?? {});
  if (!authCheck.ok) return { error: authCheck.error };

  // KYC gate (same VERIFIED gate sellers have) + a saved destination.
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: {
      kycStatus: true,
      payoutMethods: { where: { isDefault: true }, take: 1 },
    },
  });
  if (!profile || profile.kycStatus !== "VERIFIED") {
    return { error: "notVerified" };
  }
  const method = profile.payoutMethods[0];
  if (!method) return { error: "noMethod" };

  const walletId = await getWalletId(userId);
  await recomputeWalletBalance(userId);
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { availableUsd: true, frozen: true, codHoldUsd: true },
  });
  if (wallet.frozen) return { error: "frozen" };

  // availableUsd already nets prior reservations (each pending withdrawal wrote
  // a CASHOUT entry), so it is the authoritative free balance — minus any COD
  // collateral hold (docs §36), which must stay in the wallet.
  const hold = Number(wallet.codHoldUsd);
  const available = round2(Number(wallet.availableUsd) - hold);
  const min = await getSetting("min_payout_usd");
  const amount =
    amountUsd && amountUsd > 0 ? round2(amountUsd) : round2(available);
  if (amount < min) return { error: "belowMin" };
  if (amount > available) return { error: "insufficient" };

  const velocity = await checkOutflowLimit(userId, amount);
  if (!velocity.ok) return { error: velocity.error };

  try {
    await prisma.$transaction(async (tx) => {
      // Atomically reserve the funds (guards concurrent over-withdrawal).
      const upd = await tx.wallet.updateMany({
        where: {
          id: walletId,
          frozen: false,
          availableUsd: { gte: round2(amount + hold) },
        },
        data: { availableUsd: { decrement: amount } },
      });
      if (upd.count !== 1) throw new ReserveError();

      const withdrawal = await tx.walletWithdrawal.create({
        data: {
          walletId,
          amountUsd: amount,
          method: method.kind,
          destination: method.details ?? {},
          status: "REQUESTED",
        },
        select: { id: true },
      });
      await creditWalletTx(tx, walletId, {
        type: "CASHOUT",
        amountUsd: -amount,
        note: `Withdrawal requested (${withdrawal.id})`,
        refType: "withdrawal",
        refId: withdrawal.id,
      });
    });
  } catch (e) {
    if (e instanceof ReserveError) return { error: "insufficient" };
    throw e;
  }

  await recomputeWalletBalance(userId);
  revalidatePath(`/${locale}/account/wallet`);
  revalidatePath(`/${locale}/admin/payouts`);
  return { ok: true };
}

// Admin marks a withdrawal PAID (money sent outside the system). The wallet was
// already debited at request time, so this only flips status + notifies.
export async function markWithdrawalPaid(
  withdrawalId: string,
  reference: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const w = await prisma.walletWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      wallet: { select: { userId: true, user: { select: { locale: true } } } },
    },
  });
  if (!w) return { error: "notFound" };
  // Only an outstanding (REQUESTED/APPROVED) withdrawal can be paid — never one
  // already PAID (double-pay) or REJECTED (whose reserved funds were already
  // returned to the wallet). The conditional flip below is the authoritative guard.
  if (w.status !== "REQUESTED" && w.status !== "APPROVED") {
    return { error: "badState" };
  }

  const ar = w.wallet.user.locale === "ar";
  const amt = Number(w.amountUsd).toFixed(2);
  let paid = false;
  await prisma.$transaction(async (tx) => {
    const upd = await tx.walletWithdrawal.updateMany({
      where: { id: w.id, status: { in: ["REQUESTED", "APPROVED"] } },
      data: {
        status: "PAID",
        reviewedBy: adminId,
        reviewNote: reference?.trim() || null,
        processedAt: new Date(),
      },
    });
    if (upd.count !== 1) return; // paid/rejected concurrently
    await tx.notification.create({
      data: {
        userId: w.wallet.userId,
        type: "PAYMENT",
        title: ar ? "تم صرف السحب" : "Withdrawal paid",
        body: ar ? `تم تحويل ${amt}$ إليك.` : `$${amt} has been sent to you.`,
        data: { link: `/account/wallet` },
      },
    });
    paid = true;
  });

  if (!paid) return { error: "badState" };
  revalidatePath(`/${locale}/admin/payouts`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

// Admin rejects a withdrawal → return the reserved funds to the wallet.
export async function rejectWithdrawal(
  withdrawalId: string,
  reason: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const w = await prisma.walletWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      walletId: true,
      wallet: { select: { userId: true, user: { select: { locale: true } } } },
    },
  });
  if (!w) return { error: "notFound" };
  if (w.status !== "REQUESTED" && w.status !== "APPROVED") {
    return { error: "badState" };
  }

  const ar = w.wallet.user.locale === "ar";
  // Flip → REJECTED conditionally so a double-reject can't return the reserved
  // funds twice, and a reject racing a payout can't both fire.
  let rejected = false;
  await prisma.$transaction(async (tx) => {
    const upd = await tx.walletWithdrawal.updateMany({
      where: { id: w.id, status: { in: ["REQUESTED", "APPROVED"] } },
      data: {
        status: "REJECTED",
        reviewedBy: adminId,
        reviewNote: reason?.trim() || null,
        processedAt: new Date(),
      },
    });
    if (upd.count !== 1) return; // rejected/paid concurrently
    // Return the reserved funds.
    await creditWalletTx(tx, w.walletId, {
      type: "ADJUSTMENT",
      amountUsd: Number(w.amountUsd),
      note: `Withdrawal rejected — returned to wallet (${w.id})`,
      refType: "withdrawal",
      refId: w.id,
    });
    rejected = true;
    await tx.notification.create({
      data: {
        userId: w.wallet.userId,
        type: "PAYMENT",
        title: ar ? "تم رفض طلب السحب" : "Withdrawal rejected",
        body: ar
          ? `أُعيد ${Number(w.amountUsd).toFixed(2)}$ إلى محفظتك.`
          : `$${Number(w.amountUsd).toFixed(2)} was returned to your wallet.`,
        data: { link: `/account/wallet` },
      },
    });
  });

  if (!rejected) return { error: "badState" };
  await recomputeWalletBalance(w.wallet.userId);
  revalidatePath(`/${locale}/admin/payouts`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

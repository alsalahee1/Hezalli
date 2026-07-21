"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireWalletManagerId } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

// Freeze or unfreeze a user's wallet (AML / dispute hold). A frozen wallet
// rejects every outflow. Audited; the user is notified.
export async function setWalletFrozen(
  userId: string,
  frozen: boolean,
  reason?: string,
): Promise<Result> {
  const adminId = await requireWalletManagerId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const walletId = await getWalletId(userId);
  await prisma.wallet.update({ where: { id: walletId }, data: { frozen } });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });
  const ar = user?.locale === "ar";
  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: frozen ? "wallet.freeze" : "wallet.unfreeze",
        entity: "Wallet",
        entityId: userId,
        meta: { reason: reason?.trim() || null },
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: "SYSTEM",
        title: frozen
          ? ar
            ? "تم تعليق محفظتك"
            : "Your wallet is on hold"
          : ar
            ? "تم رفع التعليق عن محفظتك"
            : "Your wallet hold was lifted",
        body: frozen
          ? ar
            ? "تم تعليق محفظتك مؤقتاً. تواصل مع الدعم."
            : "Your wallet has been placed on hold. Please contact support."
          : ar
            ? "أصبحت محفظتك متاحة للاستخدام مجدداً."
            : "Your wallet is available again.",
        data: { link: `/account/wallet` },
      },
    }),
  ]);

  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/wallet-manager`);
  revalidatePath(`/${locale}/wallet-manager/wallets`);
  return { ok: true };
}

// Manually credit (+) or debit (−) a wallet, writing an audited ADJUSTMENT
// ledger entry. A reason is required. Never lets the balance go negative.
export async function adjustWalletBalance(
  userId: string,
  amountUsd: number,
  reason: string,
): Promise<Result> {
  const adminId = await requireWalletManagerId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const amount = round2(Number(amountUsd));
  if (!Number.isFinite(amount) || amount === 0) return { error: "badAmount" };
  const note = reason?.trim();
  if (!note) return { error: "reasonRequired" };

  const walletId = await getWalletId(userId);
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { availableUsd: true },
  });
  if (round2(Number(wallet.availableUsd) + amount) < 0) {
    return { error: "wouldGoNegative" };
  }

  await prisma.$transaction(async (tx) => {
    await creditWalletTx(tx, walletId, {
      type: "ADJUSTMENT",
      amountUsd: amount,
      note: `Admin adjustment: ${note}`,
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: "wallet.adjust",
        entity: "Wallet",
        entityId: userId,
        meta: { amountUsd: amount, reason: note },
      },
    });
  });
  await recomputeWalletBalance(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });
  const ar = user?.locale === "ar";
  await prisma.notification.create({
    data: {
      userId,
      type: "PAYMENT",
      title: ar ? "تعديل على رصيد المحفظة" : "Wallet balance adjusted",
      body: ar
        ? `تم ${amount >= 0 ? "إضافة" : "خصم"} ${Math.abs(amount).toFixed(2)}$ ${amount >= 0 ? "إلى" : "من"} محفظتك.`
        : `${amount >= 0 ? "Added" : "Deducted"} $${Math.abs(amount).toFixed(2)} ${amount >= 0 ? "to" : "from"} your wallet.`,
      data: { link: `/account/wallet` },
    },
  });

  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/wallet-manager`);
  revalidatePath(`/${locale}/wallet-manager/wallets`);
  return { ok: true };
}

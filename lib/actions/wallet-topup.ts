"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";
import { getWalletLimits } from "@/lib/wallet-limits";

type Result = { ok?: boolean; error?: string };

// Rails a buyer may top up over. HEZALLI_BALANCE and COD are not cash-in rails.
const TOPUP_METHODS = ["LOCAL_WALLET", "BANK_TRANSFER", "USDT"] as const;
type TopUpMethod = (typeof TOPUP_METHODS)[number];

// Buyer submits a top-up with proof → awaiting admin confirmation.
export async function requestTopUp(input: {
  amountUsd: number;
  method: TopUpMethod;
  reference?: string;
  usdtNetwork?: "TRC20" | "ERC20";
  usdtTxHash?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  if (!TOPUP_METHODS.includes(input.method)) return { error: "badMethod" };
  const amount = round2(Number(input.amountUsd));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "badAmount" };

  const isUsdt = input.method === "USDT";
  if (isUsdt && !input.usdtTxHash?.trim()) return { error: "proofRequired" };
  if (!isUsdt && !input.reference?.trim()) return { error: "proofRequired" };

  const limits = await getWalletLimits(userId);
  if (amount < limits.min) return { error: "belowMin" };
  if (amount > limits.max) return { error: "aboveMax" };

  const walletId = await getWalletId(userId);

  // Cap check: current balance + already-pending top-ups + this request must not
  // exceed the tier cap. Guards unbounded accumulation for unverified users.
  const [wallet, pendingAgg] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { availableUsd: true, frozen: true },
    }),
    prisma.walletTopUp.aggregate({
      where: { walletId, status: "AWAITING_CONFIRMATION" },
      _sum: { amountUsd: true },
    }),
  ]);
  if (wallet.frozen) return { error: "frozen" };
  const projected =
    Number(wallet.availableUsd) +
    Number(pendingAgg._sum.amountUsd ?? 0) +
    amount;
  if (projected > limits.cap) return { error: "capExceeded" };

  await prisma.walletTopUp.create({
    data: {
      walletId,
      method: input.method,
      amountUsd: amount,
      status: "AWAITING_CONFIRMATION",
      reference: isUsdt ? null : input.reference?.trim() || null,
      usdtNetwork: isUsdt ? (input.usdtNetwork ?? "TRC20") : null,
      usdtTxHash: isUsdt ? input.usdtTxHash?.trim() || null : null,
    },
  });

  revalidatePath(`/${locale}/account/wallet`);
  revalidatePath(`/${locale}/admin/payments`);
  return { ok: true };
}

// Admin confirms a top-up → credit the wallet with a TOP_UP entry (idempotent).
export async function confirmTopUp(topUpId: string): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const topUp = await prisma.walletTopUp.findUnique({
    where: { id: topUpId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      walletId: true,
      wallet: { select: { userId: true, user: { select: { locale: true } } } },
    },
  });
  if (!topUp) return { error: "notFound" };
  if (topUp.status !== "AWAITING_CONFIRMATION") return { error: "badState" };

  const amount = Number(topUp.amountUsd);
  await prisma.$transaction(async (tx) => {
    await tx.walletTopUp.update({
      where: { id: topUp.id },
      data: {
        status: "CONFIRMED",
        reviewedBy: adminId,
        confirmedAt: new Date(),
      },
    });
    await creditWalletTx(tx, topUp.walletId, {
      type: "TOP_UP",
      amountUsd: amount,
      note: "Wallet top-up confirmed",
    });
    const ar = topUp.wallet.user.locale === "ar";
    await tx.notification.create({
      data: {
        userId: topUp.wallet.userId,
        type: "PAYMENT",
        title: ar ? "تم شحن محفظتك" : "Wallet topped up",
        body: ar
          ? `تمت إضافة ${amount.toFixed(2)}$ إلى محفظتك.`
          : `$${amount.toFixed(2)} was added to your wallet.`,
        data: { link: `/account/wallet` },
      },
    });
  });

  await recomputeWalletBalance(topUp.wallet.userId);

  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

// Admin rejects a top-up → nothing credited; buyer notified.
export async function rejectTopUp(
  topUpId: string,
  reason: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const topUp = await prisma.walletTopUp.findUnique({
    where: { id: topUpId },
    select: {
      id: true,
      status: true,
      wallet: { select: { userId: true, user: { select: { locale: true } } } },
    },
  });
  if (!topUp) return { error: "notFound" };
  if (topUp.status !== "AWAITING_CONFIRMATION") return { error: "badState" };

  await prisma.$transaction([
    prisma.walletTopUp.update({
      where: { id: topUp.id },
      data: {
        status: "REJECTED",
        reviewedBy: adminId,
        reviewNote: reason?.trim() || null,
      },
    }),
    prisma.notification.create({
      data: {
        userId: topUp.wallet.userId,
        type: "PAYMENT",
        title:
          topUp.wallet.user.locale === "ar"
            ? "لم يتم تأكيد الشحن"
            : "Top-up not confirmed",
        body:
          topUp.wallet.user.locale === "ar"
            ? "لم نتمكن من تأكيد عملية الشحن. يرجى المحاولة مرة أخرى."
            : "We couldn't confirm your top-up. Please try again.",
        data: { link: `/account/wallet` },
      },
    }),
  ]);

  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

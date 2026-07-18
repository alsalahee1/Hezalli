"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import { getBalanceId, recomputeBalance, round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { payoutMethodSchema } from "@/lib/validations/payout";
import { fieldErrors } from "@/lib/validations/auth";

// Message values are i18n KEYS under the `Payout` namespace.
export type FormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

// Saves THE payout destination (one method for now; Phase 9 can extend to
// several). Replaces any existing method atomically.
export async function savePayoutMethod(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { formError: "notSignedIn" };

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) return { formError: "notSeller" };

  const kind = String(formData.get("kind") ?? "");
  const parsed = payoutMethodSchema.safeParse(
    kind === "bank"
      ? {
          kind,
          bankName: formData.get("bankName"),
          accountName: formData.get("accountName"),
          accountNumber: formData.get("accountNumber"),
        }
      : kind === "wallet"
        ? {
            kind,
            provider: formData.get("provider"),
            accountName: formData.get("accountName"),
            walletNumber: formData.get("walletNumber"),
          }
        : {
            kind: "usdt",
            network: formData.get("network"),
            address: formData.get("address"),
          },
  );
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { kind: methodKind, ...details } = parsed.data;

  await prisma.$transaction([
    prisma.payoutMethod.deleteMany({ where: { sellerId: profile.id } }),
    prisma.payoutMethod.create({
      data: {
        sellerId: profile.id,
        kind: methodKind,
        details,
        isDefault: true,
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/settings`);
  return { ok: true };
}

type Result = { ok?: boolean; error?: string };

async function minPayout(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: "min_payout_usd" },
    select: { value: true },
  });
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

// Seller requests a payout of (part of) their available balance.
export async function requestPayout(amountUsd?: number): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      payoutMethods: { where: { isDefault: true }, take: 1 },
    },
  });
  if (!profile) return { error: "notSeller" };
  const method = profile.payoutMethods[0];
  if (!method) return { error: "noMethod" };

  await recomputeBalance(profile.id);
  const balance = await prisma.sellerBalance.findUnique({
    where: { sellerId: profile.id },
    select: { availableUsd: true },
  });
  const available = Number(balance?.availableUsd ?? 0);

  // Reserve against any outstanding requests.
  const outstanding = await prisma.payout.aggregate({
    where: { sellerId: profile.id, status: { in: ["REQUESTED", "APPROVED"] } },
    _sum: { amountUsd: true },
  });
  const free = round2(available - Number(outstanding._sum.amountUsd ?? 0));

  const min = await minPayout();
  const amount = amountUsd && amountUsd > 0 ? round2(amountUsd) : round2(free);
  if (amount < min) return { error: "belowMin" };
  if (amount > free) return { error: "insufficient" };

  await prisma.payout.create({
    data: {
      sellerId: profile.id,
      amountUsd: amount,
      method: method.kind,
      destination: method.details ?? {},
      status: "REQUESTED",
    },
  });

  revalidatePath(`/${locale}/seller/finance`);
  revalidatePath(`/${locale}/admin/payouts`);
  return { ok: true };
}

// Admin marks a payout PAID (money sent outside the system) → ledger debit.
export async function markPayoutPaid(
  payoutId: string,
  reference: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      sellerId: true,
      seller: { select: { user: { select: { id: true, locale: true } } } },
    },
  });
  if (!payout) return { error: "notFound" };
  if (payout.status === "PAID") return { error: "badState" };

  const balanceId = await getBalanceId(payout.sellerId);
  await prisma.$transaction([
    prisma.payout.update({
      where: { id: payout.id },
      data: { status: "PAID", processedBy: adminId, processedAt: new Date() },
    }),
    prisma.ledgerEntry.create({
      data: {
        balanceId,
        type: "PAYOUT",
        amountUsd: -Number(payout.amountUsd),
        payoutId: payout.id,
        note: reference ? `Payout paid — ${reference}` : "Payout paid",
      },
    }),
    prisma.notification.create({
      data: {
        userId: payout.seller.user.id,
        type: "PAYMENT",
        title:
          payout.seller.user.locale === "ar" ? "تم صرف السحب" : "Payout paid",
        body:
          payout.seller.user.locale === "ar"
            ? `تم تحويل ${Number(payout.amountUsd).toFixed(2)}$ إليك.`
            : `$${Number(payout.amountUsd).toFixed(2)} has been sent to you.`,
        data: { payoutId: payout.id },
      },
    }),
  ]);
  await recomputeBalance(payout.sellerId);

  revalidatePath(`/${locale}/admin/payouts`);
  revalidatePath(`/${locale}/seller/finance`);
  return { ok: true };
}

// Admin rejects a payout request (no ledger effect).
export async function rejectPayout(
  payoutId: string,
  reason: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    select: {
      status: true,
      seller: { select: { user: { select: { id: true, locale: true } } } },
    },
  });
  if (!payout) return { error: "notFound" };
  if (payout.status === "PAID") return { error: "badState" };

  await prisma.$transaction([
    prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "REJECTED",
        processedBy: adminId,
        processedAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId: payout.seller.user.id,
        type: "PAYMENT",
        title:
          payout.seller.user.locale === "ar"
            ? "تم رفض طلب السحب"
            : "Payout request rejected",
        body: reason || "Your payout request was rejected.",
        data: {},
      },
    }),
  ]);

  revalidatePath(`/${locale}/admin/payouts`);
  revalidatePath(`/${locale}/seller/finance`);
  return { ok: true };
}

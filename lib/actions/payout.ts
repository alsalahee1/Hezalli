"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { audit } from "@/lib/audit";
import { requireActiveSeller, requireWalletManagerId } from "@/lib/authz";
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
  // requireActiveSeller rejects a suspended/deleted seller (stale-JWT window).
  const gate = await requireActiveSeller();
  if (!gate) return { formError: "notSeller" };
  const profile = { id: gate.profileId };

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

// Carries an i18n error code out of a transaction so the reservation can be
// aborted (rolled back) and mapped to a typed result.
class ReserveError extends Error {}

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
  const locale = await getLocale();
  // Money outflow: reject a suspended/deleted seller before touching balances.
  const gate = await requireActiveSeller();
  if (!gate) return { error: "notSeller" };
  const profile = await prisma.sellerProfile.findUnique({
    where: { id: gate.profileId },
    select: {
      id: true,
      payoutMethods: { where: { isDefault: true }, take: 1 },
    },
  });
  if (!profile) return { error: "notSeller" };
  const method = profile.payoutMethods[0];
  if (!method) return { error: "noMethod" };

  await recomputeBalance(profile.id);
  const balanceId = await getBalanceId(profile.id);
  const min = await minPayout();

  // Compute the free balance and create the request under a row lock on the
  // seller's balance, so two concurrent requests (or a request racing a
  // wallet-earnings transfer) can't each pass the check and together exceed it.
  let created = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SellerBalance" WHERE "id" = ${balanceId} FOR UPDATE`;
      // Read outstanding requests BEFORE the ledger: markPayoutPaid flips a
      // request to PAID and writes its ledger debit in one commit without
      // taking this lock, and under READ COMMITTED each statement sees a fresh
      // snapshot — in this order a flip landing between the reads is counted
      // twice (still reserved AND already debited) so an over-request fails
      // closed instead of slipping through to be paid.
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
      const amount =
        amountUsd && amountUsd > 0 ? round2(amountUsd) : round2(free);
      if (amount < min) throw new ReserveError("belowMin");
      if (amount > free) throw new ReserveError("insufficient");
      await tx.payout.create({
        data: {
          sellerId: profile.id,
          amountUsd: amount,
          method: method.kind,
          destination: method.details ?? {},
          status: "REQUESTED",
        },
      });
      created = true;
    });
  } catch (e) {
    if (e instanceof ReserveError) return { error: e.message };
    throw e;
  }
  if (!created) return { error: "insufficient" };

  revalidatePath(`/${locale}/seller/finance`);
  revalidatePath(`/${locale}/admin/payouts`);
  return { ok: true };
}

// Wallet staff marks a payout PAID (money sent outside the system) → ledger
// debit.
export async function markPayoutPaid(
  payoutId: string,
  reference: string,
): Promise<Result> {
  const adminId = await requireWalletManagerId();
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
  // Only an outstanding request can be paid — never one already PAID (double-pay)
  // or REJECTED. The conditional flip inside the transaction is the real guard.
  if (payout.status !== "REQUESTED" && payout.status !== "APPROVED") {
    return { error: "badState" };
  }

  const balanceId = await getBalanceId(payout.sellerId);
  let paid = false;
  await prisma.$transaction(async (tx) => {
    const upd = await tx.payout.updateMany({
      where: { id: payout.id, status: { in: ["REQUESTED", "APPROVED"] } },
      data: { status: "PAID", processedBy: adminId, processedAt: new Date() },
    });
    if (upd.count !== 1) return; // paid/rejected concurrently
    await tx.ledgerEntry.create({
      data: {
        balanceId,
        type: "PAYOUT",
        amountUsd: -Number(payout.amountUsd),
        payoutId: payout.id,
        note: reference ? `Payout paid — ${reference}` : "Payout paid",
      },
    });
    await tx.notification.create({
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
    });
    paid = true;
  });

  if (!paid) return { error: "badState" };
  await recomputeBalance(payout.sellerId);
  await audit(adminId, "payout.paid", "Payout", payout.id, {
    amountUsd: Number(payout.amountUsd),
    reference: reference?.trim() || null,
  });

  revalidatePath(`/${locale}/admin/payouts`);
  revalidatePath(`/${locale}/wallet-manager/payouts`);
  revalidatePath(`/${locale}/seller/finance`);
  return { ok: true };
}

// Wallet staff rejects a payout request (no ledger effect).
export async function rejectPayout(
  payoutId: string,
  reason: string,
): Promise<Result> {
  const adminId = await requireWalletManagerId();
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
  if (payout.status !== "REQUESTED" && payout.status !== "APPROVED") {
    return { error: "badState" };
  }

  let rejected = false;
  await prisma.$transaction(async (tx) => {
    const upd = await tx.payout.updateMany({
      where: { id: payoutId, status: { in: ["REQUESTED", "APPROVED"] } },
      data: {
        status: "REJECTED",
        processedBy: adminId,
        processedAt: new Date(),
      },
    });
    if (upd.count !== 1) return; // paid/rejected concurrently
    await tx.notification.create({
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
    });
    rejected = true;
  });

  if (!rejected) return { error: "badState" };
  await audit(adminId, "payout.reject", "Payout", payoutId, {
    reason: reason?.trim() || null,
  });
  revalidatePath(`/${locale}/admin/payouts`);
  revalidatePath(`/${locale}/wallet-manager/payouts`);
  revalidatePath(`/${locale}/seller/finance`);
  return { ok: true };
}

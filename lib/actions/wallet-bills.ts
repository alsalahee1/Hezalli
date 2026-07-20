"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getBiller } from "@/lib/wallet-billers";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string; id?: string };

class BillError extends Error {}

// Pay a utility bill or buy mobile airtime from the buyer's wallet. The wallet
// is debited immediately (reserved) with a double-spend guard and the purchase
// goes PENDING for admin fulfillment. Gated by wallet_bills_enabled. When a real
// biller/telco API is wired, fulfill inline and mark COMPLETED/FAILED here.
export async function payBill(input: {
  kind: "BILL" | "AIRTIME";
  biller: string;
  account: string;
  amountUsd: number;
  note?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  if (!(await getSetting("wallet_bills_enabled"))) return { error: "disabled" };

  const biller = getBiller(input.biller);
  if (!biller || biller.kind !== input.kind) return { error: "badBiller" };

  const account = input.account.trim();
  if (!account) return { error: "accountRequired" };

  const amount = round2(Number(input.amountUsd));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "badAmount" };

  const walletId = await getWalletId(userId);
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { availableUsd: true, frozen: true },
  });
  if (wallet.frozen) return { error: "frozen" };
  if (amount > Number(wallet.availableUsd)) return { error: "insufficient" };

  const entryType = input.kind === "AIRTIME" ? "AIRTIME_TOPUP" : "BILL_PAYMENT";
  const cleanNote = input.note?.trim() || null;

  let billId = "";
  try {
    await prisma.$transaction(async (tx) => {
      // Atomic debit — only succeeds if the balance still covers it.
      const upd = await tx.wallet.updateMany({
        where: { id: walletId, frozen: false, availableUsd: { gte: amount } },
        data: { availableUsd: { decrement: amount } },
      });
      if (upd.count !== 1) throw new BillError();

      const bill = await tx.walletBillPayment.create({
        data: {
          walletId,
          kind: input.kind,
          biller: biller.slug,
          account,
          amountUsd: amount,
          note: cleanNote,
        },
        select: { id: true },
      });
      billId = bill.id;
      await creditWalletTx(tx, walletId, {
        type: entryType,
        amountUsd: -amount,
        note: `${biller.slug} · ${account} (${bill.id})`,
      });
    });
  } catch (e) {
    if (e instanceof BillError) return { error: "insufficient" };
    throw e;
  }

  await recomputeWalletBalance(userId);

  revalidatePath(`/${locale}/account/wallet`);
  revalidatePath(`/${locale}/admin/payments`);
  return { ok: true, id: billId };
}

// Admin marks a pending purchase fulfilled. Funds were already debited, so this
// only records the confirmation + optional provider reference and notifies.
export async function completeBillPayment(
  billId: string,
  reference?: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const bill = await prisma.walletBillPayment.findUnique({
    where: { id: billId },
    select: {
      id: true,
      status: true,
      kind: true,
      amountUsd: true,
      wallet: { select: { userId: true, user: { select: { locale: true } } } },
    },
  });
  if (!bill) return { error: "notFound" };
  if (bill.status !== "PENDING") return { error: "badState" };

  await prisma.walletBillPayment.update({
    where: { id: bill.id },
    data: {
      status: "COMPLETED",
      reviewedBy: adminId,
      reference: reference?.trim() || null,
      completedAt: new Date(),
    },
  });

  const amount = Number(bill.amountUsd);
  const ar = bill.wallet.user.locale === "ar";
  const isAirtime = bill.kind === "AIRTIME";
  await prisma.notification.create({
    data: {
      userId: bill.wallet.userId,
      type: "PAYMENT",
      title: ar
        ? isAirtime
          ? "تم شحن الرصيد"
          : "تم دفع الفاتورة"
        : isAirtime
          ? "Airtime delivered"
          : "Bill paid",
      body: ar
        ? `تمت معالجة عملية بقيمة ${amount.toFixed(2)}$ بنجاح.`
        : `Your $${amount.toFixed(2)} payment was completed.`,
      data: { link: `/account/wallet` },
    },
  });

  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

// Admin fails a pending purchase → refund the wallet with a BILL_REFUND entry.
export async function failBillPayment(
  billId: string,
  reason: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const bill = await prisma.walletBillPayment.findUnique({
    where: { id: billId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      walletId: true,
      wallet: { select: { userId: true, user: { select: { locale: true } } } },
    },
  });
  if (!bill) return { error: "notFound" };
  if (bill.status !== "PENDING") return { error: "badState" };

  const amount = Number(bill.amountUsd);
  await prisma.$transaction(async (tx) => {
    await tx.walletBillPayment.update({
      where: { id: bill.id },
      data: {
        status: "FAILED",
        reviewedBy: adminId,
        reviewNote: reason?.trim() || null,
      },
    });
    await creditWalletTx(tx, bill.walletId, {
      type: "BILL_REFUND",
      amountUsd: amount,
      note: `Refund for failed purchase (${bill.id})`,
    });
  });

  await recomputeWalletBalance(bill.wallet.userId);

  const ar = bill.wallet.user.locale === "ar";
  await prisma.notification.create({
    data: {
      userId: bill.wallet.userId,
      type: "PAYMENT",
      title: ar ? "تعذّرت العملية" : "Purchase failed",
      body: ar
        ? `تعذّر إتمام العملية وتمت إعادة ${amount.toFixed(2)}$ إلى محفظتك.`
        : `We couldn't complete it — $${amount.toFixed(2)} was returned to your wallet.`,
      data: { link: `/account/wallet` },
    },
  });

  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

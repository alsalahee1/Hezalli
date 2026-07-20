// Bill/airtime purchase state transitions (Step 19.13). Plain server module — no
// auth, no request context — so both the admin actions (lib/actions/wallet-bills.ts)
// and automatic provider fulfilment (lib/providers/bill-provider.ts) share one
// implementation. Funds were already debited at payBill time; completing only
// records the outcome, failing refunds via a BILL_REFUND ledger entry.
import { prisma } from "@/lib/prisma";
import { creditWalletTx, recomputeWalletBalance } from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

// Move a PENDING purchase to COMPLETED. `reviewedBy` is an admin id for manual
// fulfilment, or null when a provider fulfilled it automatically.
export async function completeBill(
  billId: string,
  opts: { reference?: string | null; reviewedBy?: string | null } = {},
): Promise<Result> {
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
      reviewedBy: opts.reviewedBy ?? null,
      reference: opts.reference?.trim() || null,
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

  return { ok: true };
}

// Move a PENDING purchase to FAILED and refund the wallet (BILL_REFUND entry).
export async function failBill(
  billId: string,
  opts: { reason?: string | null; reviewedBy?: string | null } = {},
): Promise<Result> {
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
        reviewedBy: opts.reviewedBy ?? null,
        reviewNote: opts.reason?.trim() || null,
      },
    });
    await creditWalletTx(tx, bill.walletId, {
      type: "BILL_REFUND",
      amountUsd: amount,
      note: `Refund for failed purchase (${bill.id})`,
      refType: "bill",
      refId: bill.id,
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

  return { ok: true };
}

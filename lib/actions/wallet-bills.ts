"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getBiller } from "@/lib/wallet-billers";
import { completeBill, failBill } from "@/lib/wallet-bills-core";
import { getBillProvider } from "@/lib/providers/bill-provider";
// Side-effect import: registers concrete providers (e.g. Reloadly airtime) so
// `wallet_bills_provider` can select them by id.
import "@/lib/providers/reloadly-airtime";
import { verifyWalletAuth } from "@/lib/wallet-step-auth";
import { checkOutflowLimit } from "@/lib/wallet-velocity";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string; id?: string };

class BillError extends Error {}

// Pay a utility bill or buy mobile airtime from the buyer's wallet. The wallet
// is debited immediately (reserved) with a double-spend guard and the purchase
// is filed PENDING. The active fulfilment provider (wallet_bills_provider, default
// "manual") is then asked to resolve it: "manual" leaves it for an admin; a real
// biller/telco adapter can auto-complete or auto-fail (refund) inline. Gated by
// wallet_bills_enabled. See lib/providers/bill-provider.ts.
export async function payBill(input: {
  kind: "BILL" | "AIRTIME";
  biller: string;
  account: string;
  amountUsd: number;
  note?: string;
  pin?: string;
  passkey?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  if (!(await getSetting("wallet_bills_enabled"))) return { error: "disabled" };

  const authCheck = await verifyWalletAuth(userId, input);
  if (!authCheck.ok) return { error: authCheck.error };

  const biller = getBiller(input.biller);
  if (!biller || biller.kind !== input.kind) return { error: "badBiller" };

  const account = input.account.trim();
  if (!account) return { error: "accountRequired" };

  const amount = round2(Number(input.amountUsd));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "badAmount" };

  const walletId = await getWalletId(userId);
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { availableUsd: true, frozen: true, codHoldUsd: true },
  });
  if (wallet.frozen) return { error: "frozen" };
  // A COD collateral hold (docs §36) is not spendable.
  const hold = Number(wallet.codHoldUsd);
  if (amount > Number(wallet.availableUsd) - hold)
    return { error: "insufficient" };

  // Velocity cap only matters once we know the funds exist.
  const velocity = await checkOutflowLimit(userId, amount);
  if (!velocity.ok) return { error: velocity.error };

  const entryType = input.kind === "AIRTIME" ? "AIRTIME_TOPUP" : "BILL_PAYMENT";
  const cleanNote = input.note?.trim() || null;

  let billId = "";
  try {
    await prisma.$transaction(async (tx) => {
      // Atomic debit — only succeeds if the balance still covers it.
      const upd = await tx.wallet.updateMany({
        where: {
          id: walletId,
          frozen: false,
          availableUsd: { gte: round2(amount + hold) },
        },
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
        refType: "bill",
        refId: bill.id,
      });
    });
  } catch (e) {
    if (e instanceof BillError) return { error: "insufficient" };
    throw e;
  }

  await recomputeWalletBalance(userId);

  // Hand off to the active provider. The wallet is already debited, so any
  // provider error leaves the purchase PENDING (admin resolves) — never lost.
  const providerId = await getSetting("wallet_bills_provider");
  const provider = getBillProvider(providerId);
  try {
    const outcome = await provider.fulfill({
      purchaseId: billId,
      kind: input.kind,
      biller: biller.slug,
      account,
      amountUsd: amount,
    });
    if (outcome.status === "COMPLETED") {
      await completeBill(billId, { reference: outcome.reference });
    } else if (outcome.status === "FAILED") {
      await failBill(billId, { reason: outcome.reason });
    }
  } catch {
    // Leave PENDING for admin / retry.
  }

  revalidatePath(`/${locale}/account/wallet`);
  revalidatePath(`/${locale}/admin/payments`);
  return { ok: true, id: billId };
}

// Admin marks a pending purchase fulfilled (manual provider). Delegates to the
// shared core, then handles the request-context concerns (auth + revalidate).
export async function completeBillPayment(
  billId: string,
  reference?: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const res = await completeBill(billId, {
    reference: reference ?? null,
    reviewedBy: adminId,
  });
  if (!res.ok) return res;

  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

// Admin fails a pending purchase → refund the wallet (via the shared core).
export async function failBillPayment(
  billId: string,
  reason: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const res = await failBill(billId, { reason, reviewedBy: adminId });
  if (!res.ok) return res;

  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

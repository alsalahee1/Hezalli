"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { transferFunds } from "@/lib/wallet-transfers";
import { verifyWalletAuth } from "@/lib/wallet-step-auth";
import { checkOutflowLimit } from "@/lib/wallet-velocity";

type Result = { ok?: boolean; error?: string; entryId?: string };

// Pay a HezalliPay merchant from the customer's wallet balance. Used by the
// merchant pay page (/pay/m/[slug], reached by scanning the shop QR or a charge
// link). LICENSED ONLY — accepting money on a business's behalf is money
// transmission; off unless merchant_payments_enabled is set. The money moves
// through the same wallet transfer core as P2P (transferFunds), landing in the
// merchant OWNER's wallet, and a MerchantPayment row records it for the
// merchant's takings feed. See docs/19-wallet-strategy.md §4.
export async function payMerchant(input: {
  merchantId: string;
  amountUsd: number;
  note?: string;
  pin?: string;
  passkey?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  if (!(await getSetting("merchant_payments_enabled")))
    return { error: "disabled" };

  const merchant = await prisma.merchantProfile.findUnique({
    where: { id: input.merchantId },
    select: { id: true, status: true, ownerId: true },
  });
  if (!merchant || merchant.status !== "ACTIVE")
    return { error: "merchantUnavailable" };
  // Paying your own shop is a no-op the transfer core would reject anyway;
  // surface a clearer message.
  if (merchant.ownerId === session.user.id) return { error: "cannotPaySelf" };

  const authCheck = await verifyWalletAuth(session.user.id, input);
  if (!authCheck.ok) return { error: authCheck.error };

  const velocity = await checkOutflowLimit(session.user.id, input.amountUsd);
  if (!velocity.ok) return { error: velocity.error };

  const res = await transferFunds(
    session.user.id,
    merchant.ownerId,
    input.amountUsd,
    input.note,
  );
  if (!res.ok) return res;

  // Record the payment against the merchant so it shows in their dashboard +
  // transaction feed. The money itself already moved via the wallet ledger; a
  // failure to write this record must not undo the transfer, so it's best-
  // effort and logged rather than thrown.
  try {
    await prisma.merchantPayment.create({
      data: {
        merchantId: merchant.id,
        payerId: session.user.id,
        amountUsd: input.amountUsd,
        note: input.note?.trim() || null,
        walletEntryId: res.entryId ?? null,
      },
    });
  } catch (e) {
    console.error("merchantPayment.create failed after transfer", e);
  }

  revalidatePath(`/${locale}/account/wallet`);
  revalidatePath(`/${locale}/merchant`);
  return res;
}

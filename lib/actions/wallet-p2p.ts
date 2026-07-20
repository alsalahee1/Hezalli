"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { transferFunds } from "@/lib/wallet-transfers";

type Result = { ok?: boolean; error?: string };

// Send wallet funds to another user by email/phone (P2P). LICENSED ONLY — money
// transmission is regulated; off unless wallet_p2p_enabled is set. Any signed-in
// user with a balance may send once enabled. See docs/19-wallet-strategy.md §4.
export async function sendWalletFunds(input: {
  recipient: string; // email or phone
  amountUsd: number;
  note?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  if (!(await getSetting("wallet_p2p_enabled"))) return { error: "disabled" };

  const id = input.recipient.trim();
  if (!id) return { error: "recipientRequired" };
  const recipient = await prisma.user.findFirst({
    where: id.includes("@") ? { email: id.toLowerCase() } : { phone: id },
    select: { id: true },
  });
  if (!recipient) return { error: "recipientNotFound" };

  const res = await transferFunds(
    session.user.id,
    recipient.id,
    input.amountUsd,
    input.note,
  );
  if (res.ok) revalidatePath(`/${locale}/account/wallet`);
  return res;
}

// Pay a specific user by id — used by "pay by QR" (scanning a user's receive
// QR opens /pay/u/[id], which calls this). Same P2P gate as sendWalletFunds.
export async function payUser(input: {
  recipientId: string;
  amountUsd: number;
  note?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  if (!(await getSetting("wallet_p2p_enabled"))) return { error: "disabled" };

  const res = await transferFunds(
    session.user.id,
    input.recipientId,
    input.amountUsd,
    input.note,
  );
  if (res.ok) revalidatePath(`/${locale}/account/wallet`);
  return res;
}

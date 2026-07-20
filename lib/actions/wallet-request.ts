"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { transferFunds } from "@/lib/wallet-transfers";
import { verifyWalletPin } from "@/lib/wallet-pin";

type Result = { ok?: boolean; error?: string; id?: string };

// Create a money request. Anyone can create one; it becomes payable once an
// admin has enabled transfers (paying runs the P2P core). Returns the id so the
// UI can build a shareable link / QR to /pay/r/[id].
export async function createPaymentRequest(input: {
  amountUsd: number;
  note?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  const amount = round2(Number(input.amountUsd));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "badAmount" };

  const req = await prisma.walletPaymentRequest.create({
    data: {
      requesterId: session.user.id,
      amountUsd: amount,
      note: input.note?.trim() || null,
    },
    select: { id: true },
  });

  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true, id: req.id };
}

// Pay a pending money request from the payer's wallet.
export async function payPaymentRequest(
  requestId: string,
  pin: string,
): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  if (!(await getSetting("wallet_p2p_enabled"))) return { error: "disabled" };

  const pinCheck = await verifyWalletPin(session.user.id, pin);
  if (!pinCheck.ok) return { error: pinCheck.error };

  const req = await prisma.walletPaymentRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requesterId: true,
      amountUsd: true,
      note: true,
      status: true,
    },
  });
  if (!req) return { error: "notFound" };
  if (req.status !== "PENDING") return { error: "alreadyHandled" };
  if (req.requesterId === session.user.id) return { error: "cannotPayOwn" };

  const res = await transferFunds(
    session.user.id,
    req.requesterId,
    Number(req.amountUsd),
    req.note ? `Request: ${req.note}` : "Money request",
  );
  if (!res.ok) return res;

  // Mark paid (only if still pending — guards a double-pay race).
  await prisma.walletPaymentRequest.updateMany({
    where: { id: req.id, status: "PENDING" },
    data: { status: "PAID", payerId: session.user.id, paidAt: new Date() },
  });

  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

// Requester cancels their own pending request.
export async function cancelPaymentRequest(requestId: string): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  const req = await prisma.walletPaymentRequest.findUnique({
    where: { id: requestId },
    select: { requesterId: true, status: true },
  });
  if (!req) return { error: "notFound" };
  if (req.requesterId !== session.user.id) return { error: "forbidden" };
  if (req.status !== "PENDING") return { error: "alreadyHandled" };

  await prisma.walletPaymentRequest.update({
    where: { id: requestId },
    data: { status: "CANCELLED" },
  });

  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireWalletManagerId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recomputeWalletBalance } from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

// Admin-only: recompute one wallet's stored balance from its ledger entries,
// repairing a drift found on the audit page. Audited.
export async function reconcileWalletBalance(userId: string): Promise<Result> {
  const adminId = await requireWalletManagerId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { availableUsd: true },
  });
  if (!wallet) return { error: "notFound" };
  const before = Number(wallet.availableUsd);

  await recomputeWalletBalance(userId);

  const after = await prisma.wallet.findUnique({
    where: { userId },
    select: { availableUsd: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "wallet.reconcile",
      entity: "Wallet",
      entityId: userId,
      meta: { before, after: Number(after?.availableUsd ?? 0) },
    },
  });

  revalidatePath(`/${locale}/admin/wallet-audit`);
  return { ok: true };
}

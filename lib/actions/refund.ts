"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";

type Result = { ok?: boolean; error?: string };

// Admin refunds a sub-order (full by default, or a partial amount). Delegates
// to the shared refund core, then revalidates the admin/buyer/seller views.
export async function refundSubOrder(
  subOrderId: string,
  reason: string,
  amountUsd?: number,
  toWallet?: boolean,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const res = await applyRefund(subOrderId, {
    reason,
    amountUsd,
    actor: "admin",
    processedBy: adminId,
    toWallet,
  });
  if (res.error) return { error: res.error };

  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: { orderId: true },
  });
  if (sub) {
    revalidatePath(`/${locale}/admin/orders/${sub.orderId}`);
    revalidatePath(`/${locale}/account/orders/${sub.orderId}`);
  }
  revalidatePath(`/${locale}/seller/finance`);
  return { ok: true };
}

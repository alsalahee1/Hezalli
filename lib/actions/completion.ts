"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { settleSubOrder } from "@/lib/finance";
import { aggregateOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Buyer confirms receipt → complete the shipped/delivered sub-orders and settle
// each seller's balance. (Phase 10 adds auto-complete after N days.)
export async function confirmReceived(orderId: string): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
    select: {
      id: true,
      subOrders: {
        where: { status: { in: ["SHIPPED", "DELIVERED"] } },
        select: {
          id: true,
          store: {
            select: {
              seller: {
                select: { user: { select: { id: true, locale: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!order) return { error: "notFound" };
  if (order.subOrders.length === 0) return { error: "badState" };

  for (const s of order.subOrders) {
    await prisma.subOrder.update({
      where: { id: s.id },
      data: { status: "COMPLETED" },
    });
    await settleSubOrder(s.id); // immutable ledger credit + balance recompute
    const seller = s.store.seller.user;
    const ar = seller.locale === "ar";
    await prisma.notification.create({
      data: {
        userId: seller.id,
        type: "ORDER",
        title: ar ? "اكتمل الطلب" : "Order completed",
        body: ar
          ? "أكد المشتري الاستلام واكتمل الطلب."
          : "The buyer confirmed receipt and the order is complete.",
        data: { orderId },
      },
    });
  }

  const subs = await prisma.subOrder.findMany({
    where: { orderId },
    select: { status: true },
  });
  await prisma.order.update({
    where: { id: orderId },
    data: { status: aggregateOrderStatus(subs.map((s) => s.status)) as never },
  });
  await prisma.orderStatusHistory.create({
    data: {
      orderId,
      status: "COMPLETED",
      actor: "buyer",
      note: "Buyer confirmed receipt",
    },
  });

  revalidatePath(`/${locale}/account/orders/${orderId}`);
  revalidatePath(`/${locale}/seller/finance`);
  return { ok: true };
}

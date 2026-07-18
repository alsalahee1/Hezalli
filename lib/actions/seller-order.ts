"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { aggregateOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };
type SubTarget = "PROCESSING" | "SHIPPED" | "CANCELLED";
type OrderStatusValue =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

function statusWord(to: SubTarget, ar: boolean): string {
  if (to === "PROCESSING") return ar ? "قيد التجهيز" : "being prepared";
  if (to === "SHIPPED") return ar ? "تم شحنه" : "shipped";
  return ar ? "ملغى" : "cancelled";
}

async function transition(
  subOrderId: string,
  allowedFrom: string[],
  to: SubTarget,
  opts: { restoreStock?: boolean; reason?: string } = {},
): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const locale = await getLocale();

  const sub = await prisma.subOrder.findFirst({
    where: { id: subOrderId, storeId: gate.storeId },
    select: {
      id: true,
      orderId: true,
      status: true,
      store: { select: { name: true } },
      items: { select: { variantId: true, quantity: true } },
      order: { select: { buyerId: true, buyer: { select: { locale: true } } } },
    },
  });
  if (!sub) return { error: "notFound" };
  if (!allowedFrom.includes(sub.status)) return { error: "badState" };

  await prisma.$transaction(async (tx) => {
    await tx.subOrder.update({ where: { id: sub.id }, data: { status: to } });

    if (opts.restoreStock) {
      for (const it of sub.items) {
        await tx.productVariant.updateMany({
          where: { id: it.variantId },
          data: { stock: { increment: it.quantity } },
        });
      }
    }

    const subs = await tx.subOrder.findMany({
      where: { orderId: sub.orderId },
      select: { status: true },
    });
    const orderStatus = aggregateOrderStatus(
      subs.map((s) => s.status),
    ) as OrderStatusValue;
    await tx.order.update({
      where: { id: sub.orderId },
      data: { status: orderStatus },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: sub.orderId,
        status: to,
        actor: "seller",
        note: opts.reason
          ? `${sub.store.name}: ${to} — ${opts.reason}`
          : `${sub.store.name}: ${to}`,
      },
    });

    const ar = sub.order.buyer.locale === "ar";
    await tx.notification.create({
      data: {
        userId: sub.order.buyerId,
        type: "ORDER",
        title: ar ? "تحديث الطلب" : "Order update",
        body: ar
          ? `طلبك من ${sub.store.name} ${statusWord(to, true)}.`
          : `Your order from ${sub.store.name} is ${statusWord(to, false)}.`,
        data: { orderId: sub.orderId },
      },
    });
  });

  revalidatePath(`/${locale}/seller/orders`);
  revalidatePath(`/${locale}/seller/orders/${subOrderId}`);
  revalidatePath(`/${locale}/account/orders`);
  return { ok: true };
}

export async function acceptSubOrder(subOrderId: string): Promise<Result> {
  return transition(subOrderId, ["CONFIRMED"], "PROCESSING");
}

export async function cancelSubOrder(
  subOrderId: string,
  reason: string,
): Promise<Result> {
  const r = (reason ?? "").trim();
  if (r.length < 3) return { error: "reasonRequired" };
  return transition(subOrderId, ["CONFIRMED", "PROCESSING"], "CANCELLED", {
    restoreStock: true,
    reason: r,
  });
}

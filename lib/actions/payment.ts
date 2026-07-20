"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import { recomputeBalance } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Thrown to roll back a confirmation whose order is no longer in a confirmable
// state (mapped to a typed "badState" result by the caller).
class AbortConfirm extends Error {}

const UNPAID_TTL_MS = 24 * 60 * 60 * 1000;

// Buyer submits payment proof for a prepaid order → awaiting admin confirmation.
export async function submitPaymentProof(input: {
  orderId: string;
  reference?: string;
  usdtNetwork?: "TRC20" | "ERC20";
  usdtTxHash?: string;
  usdtAddress?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, buyerId: session.user.id },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      payment: { select: { id: true, status: true } },
    },
  });
  if (!order || !order.payment) return { error: "notFound" };
  if (order.paymentMethod === "COD") return { error: "badState" };
  if (order.status !== "PENDING") return { error: "badState" };

  const isUsdt = order.paymentMethod === "USDT";
  if (isUsdt && !input.usdtTxHash?.trim()) return { error: "proofRequired" };
  if (!isUsdt && !input.reference?.trim()) return { error: "proofRequired" };

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: "AWAITING_CONFIRMATION",
        reference: input.reference?.trim() || null,
        usdtNetwork: isUsdt ? (input.usdtNetwork ?? "TRC20") : null,
        usdtTxHash: isUsdt ? input.usdtTxHash?.trim() || null : null,
        usdtAddress: isUsdt ? input.usdtAddress?.trim() || null : null,
      },
    }),
    prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: "PENDING",
        actor: "buyer",
        note: "Payment proof submitted",
      },
    }),
  ]);

  revalidatePath(`/${locale}/account/orders/${order.id}`);
  revalidatePath(`/${locale}/admin/payments`);
  return { ok: true };
}

// Admin confirms a prepaid payment → order CONFIRMED, escrow held.
export async function confirmPayment(paymentId: string): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      order: {
        select: {
          id: true,
          buyerId: true,
          buyer: { select: { locale: true } },
          subOrders: {
            select: {
              id: true,
              itemsTotal: true,
              store: {
                select: {
                  sellerId: true,
                  seller: {
                    select: { user: { select: { id: true, locale: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!payment) return { error: "notFound" };
  if (payment.status === "CONFIRMED") return { error: "badState" };

  // Confirm only a still-payable payment whose order is still PENDING. If the
  // order was auto-cancelled (expired) or confirmed concurrently, abort the whole
  // transaction rather than resurrecting a cancelled order to CONFIRMED with its
  // stock already restored/resold.
  try {
    await prisma.$transaction(async (tx) => {
      const payUpd = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: ["PENDING", "AWAITING_CONFIRMATION"] },
        },
        data: {
          status: "CONFIRMED",
          confirmedBy: adminId,
          confirmedAt: new Date(),
        },
      });
      if (payUpd.count !== 1) throw new AbortConfirm();
      const ordUpd = await tx.order.updateMany({
        where: { id: payment.order.id, status: "PENDING" },
        data: { status: "CONFIRMED" },
      });
      if (ordUpd.count !== 1) throw new AbortConfirm();
      await tx.subOrder.updateMany({
        where: { orderId: payment.order.id, status: "PENDING" },
        data: { status: "CONFIRMED" },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: payment.order.id,
          status: "CONFIRMED",
          actor: "admin",
          note: "Payment confirmed",
        },
      });
    });
  } catch (e) {
    if (e instanceof AbortConfirm) return { error: "badState" };
    throw e;
  }

  // Escrow now applies — recompute each seller's balance + notify.
  const sellerIds = [
    ...new Set(payment.order.subOrders.map((s) => s.store.sellerId)),
  ];
  for (const sid of sellerIds) await recomputeBalance(sid);

  for (const s of payment.order.subOrders) {
    const seller = s.store.seller.user;
    const ar = seller.locale === "ar";
    await prisma.notification.create({
      data: {
        userId: seller.id,
        type: "ORDER",
        title: ar ? "طلب جديد (مدفوع)" : "New paid order",
        body: ar
          ? `طلب مدفوع بقيمة ${Number(s.itemsTotal).toFixed(2)}$.`
          : `A paid order worth $${Number(s.itemsTotal).toFixed(2)}.`,
        data: { orderId: payment.order.id },
      },
    });
  }
  const bAr = payment.order.buyer.locale === "ar";
  await prisma.notification.create({
    data: {
      userId: payment.order.buyerId,
      type: "PAYMENT",
      title: bAr ? "تم تأكيد الدفع" : "Payment confirmed",
      body: bAr
        ? "تم تأكيد دفعتك وتأكيد طلبك."
        : "Your payment was confirmed and your order is now confirmed.",
      data: { orderId: payment.order.id },
    },
  });

  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/orders/${payment.order.id}`);
  revalidatePath(`/${locale}/seller/orders`);
  return { ok: true };
}

// Admin rejects a prepaid payment → order stays payable (buyer can resubmit).
export async function rejectPayment(
  paymentId: string,
  reason: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      order: {
        select: {
          id: true,
          buyerId: true,
          buyer: { select: { locale: true } },
        },
      },
    },
  });
  if (!payment) return { error: "notFound" };
  if (payment.status === "CONFIRMED") return { error: "badState" };

  // Conditional flip guards a reject racing a confirm: only a still-payable
  // payment can be failed, never one confirmed a moment earlier.
  const upd = await prisma.payment.updateMany({
    where: {
      id: payment.id,
      status: { in: ["PENDING", "AWAITING_CONFIRMATION"] },
    },
    data: { status: "FAILED" },
  });
  if (upd.count !== 1) return { error: "badState" };

  await prisma.$transaction([
    prisma.orderStatusHistory.create({
      data: {
        orderId: payment.order.id,
        status: "PENDING",
        actor: "admin",
        note: reason ? `Payment rejected: ${reason}` : "Payment rejected",
      },
    }),
    prisma.notification.create({
      data: {
        userId: payment.order.buyerId,
        type: "PAYMENT",
        title:
          payment.order.buyer.locale === "ar"
            ? "لم يتم تأكيد الدفع"
            : "Payment not confirmed",
        body:
          payment.order.buyer.locale === "ar"
            ? "لم نتمكن من تأكيد دفعتك. يرجى المحاولة مرة أخرى."
            : "We couldn't confirm your payment. Please try again.",
        data: { orderId: payment.order.id },
      },
    }),
  ]);

  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/orders/${payment.order.id}`);
  return { ok: true };
}

// Lazy expiry: cancel prepaid orders left unpaid past the TTL and restore stock.
export async function expireStaleOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - UNPAID_TTL_MS);
  const stale = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentMethod: { not: "COD" },
      createdAt: { lt: cutoff },
      // Do NOT expire an order whose payment proof is sitting in the admin review
      // queue — the buyer has (claimed to have) paid; expiring it would cancel a
      // paid order and restore/resell its stock while admin review is pending.
      payment: { is: { status: { not: "AWAITING_CONFIRMATION" } } },
    },
    select: {
      id: true,
      buyerId: true,
      subOrders: {
        select: { items: { select: { variantId: true, quantity: true } } },
      },
    },
  });
  let cancelled = 0;
  for (const order of stale) {
    const didCancel = await prisma.$transaction(async (tx) => {
      // Cancel only if the order is still PENDING — guards a race with a
      // concurrent confirmPayment / proof submission.
      const ord = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (ord.count !== 1) return false;
      for (const sub of order.subOrders) {
        for (const it of sub.items) {
          await tx.productVariant.updateMany({
            where: { id: it.variantId },
            data: { stock: { increment: it.quantity } },
          });
        }
      }
      await tx.subOrder.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      await tx.payment.updateMany({
        where: { orderId: order.id, status: { not: "CONFIRMED" } },
        data: { status: "FAILED" },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "CANCELLED",
          actor: "system",
          note: "Expired (unpaid)",
        },
      });
      await tx.notification.create({
        data: {
          userId: order.buyerId,
          type: "ORDER",
          title: "Order expired",
          body: "Your unpaid order expired and was cancelled.",
          data: { orderId: order.id },
        },
      });
      return true;
    });
    if (didCancel) cancelled += 1;
  }
  return cancelled;
}

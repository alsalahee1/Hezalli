"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";
import { RETURN_REASONS, type ReturnType } from "@/lib/returns";

type Result = { ok?: boolean; error?: string };

type Evidence = {
  type: ReturnType;
  description: string;
  photos: string[];
  returnAddress?: string | null;
  returnTracking?: string | null;
};

async function settingDays(key: string, fallback: number): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function bothPaths(orderId: string, subOrderId: string) {
  return async () => {
    const locale = await getLocale();
    revalidatePath(`/${locale}/seller/returns`);
    revalidatePath(`/${locale}/account/orders/${orderId}`);
    revalidatePath(`/${locale}/account/returns`);
    void subOrderId;
  };
}

// Buyer requests a return/refund on a delivered or completed sub-order,
// within the return window and only once per sub-order.
export async function requestReturn(input: {
  subOrderId: string;
  reason: string;
  description?: string;
  photos?: string[];
  type: ReturnType;
}): Promise<Result & { returnId?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  if (!(RETURN_REASONS as readonly string[]).includes(input.reason)) {
    return { error: "badReason" };
  }
  const type: ReturnType =
    input.type === "refund_only" ? "refund_only" : "return_and_refund";

  const sub = await prisma.subOrder.findFirst({
    where: { id: input.subOrderId, order: { buyerId: userId } },
    select: {
      id: true,
      status: true,
      completedAt: true,
      createdAt: true,
      orderId: true,
      items: { select: { id: true, quantity: true } },
      shipment: { select: { deliveredAt: true } },
      return: { select: { id: true } },
      store: {
        select: {
          seller: {
            select: { user: { select: { id: true, locale: true } } },
          },
        },
      },
    },
  });
  if (!sub) return { error: "notFound" };
  if (sub.status !== "DELIVERED" && sub.status !== "COMPLETED") {
    return { error: "notEligible" };
  }
  if (sub.return) return { error: "alreadyRequested" };

  const windowDays = await settingDays("return_window_days", 7);
  // Fail closed: if delivery timestamps are missing, fall back to the sub-order's
  // creation date so the window still applies (never leaving it open forever).
  const base = sub.completedAt ?? sub.shipment?.deliveredAt ?? sub.createdAt;
  if (Date.now() - base.getTime() > windowDays * 86_400_000) {
    return { error: "windowClosed" };
  }

  const evidence: Evidence = {
    type,
    description: input.description?.trim() || "",
    photos: (input.photos ?? []).filter(Boolean).slice(0, 5),
  };

  const ret = await prisma.returnRequest.create({
    data: {
      subOrderId: sub.id,
      buyerId: userId,
      status: "REQUESTED",
      reason: input.reason,
      evidence,
      items: {
        create: sub.items.map((it) => ({
          orderItemId: it.id,
          quantity: it.quantity,
        })),
      },
    },
    select: { id: true },
  });

  const seller = sub.store.seller.user;
  const ar = seller.locale === "ar";
  await prisma.notification.create({
    data: {
      userId: seller.id,
      type: "RETURN",
      title: ar ? "طلب إرجاع جديد" : "New return request",
      body: ar
        ? "طلب أحد المشترين إرجاع/استرداد أحد الطلبات."
        : "A buyer requested a return/refund on an order.",
      data: { orderId: sub.orderId, returnId: ret.id },
    },
  });

  await bothPaths(sub.orderId, sub.id)();
  return { ok: true, returnId: ret.id };
}

async function loadSellerReturn(returnId: string, storeId: string) {
  return prisma.returnRequest.findFirst({
    where: { id: returnId, subOrder: { storeId } },
    select: {
      id: true,
      status: true,
      evidence: true,
      buyerId: true,
      subOrderId: true,
      buyer: { select: { locale: true } },
      subOrder: { select: { orderId: true } },
    },
  });
}

// Seller approves a return; may include a return address for ship-back.
export async function approveReturn(
  returnId: string,
  returnAddress?: string,
): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const ret = await loadSellerReturn(returnId, gate.storeId);
  if (!ret) return { error: "notFound" };
  if (ret.status !== "REQUESTED") return { error: "badState" };

  const evidence = {
    ...((ret.evidence ?? {}) as Evidence),
    returnAddress: returnAddress?.trim() || null,
  };
  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "APPROVED", evidence },
  });

  const ar = ret.buyer.locale === "ar";
  await prisma.notification.create({
    data: {
      userId: ret.buyerId,
      type: "RETURN",
      title: ar ? "تمت الموافقة على الإرجاع" : "Return approved",
      body: ar
        ? "وافق البائع على طلب الإرجاع/الاسترداد."
        : "The seller approved your return/refund request.",
      data: { orderId: ret.subOrder.orderId, returnId },
    },
  });

  await bothPaths(ret.subOrder.orderId, ret.subOrderId)();
  return { ok: true };
}

// Seller rejects a return with a reason.
export async function rejectReturn(
  returnId: string,
  reason: string,
): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const text = (reason ?? "").trim();
  if (text.length < 3) return { error: "reasonRequired" };
  const ret = await loadSellerReturn(returnId, gate.storeId);
  if (!ret) return { error: "notFound" };
  if (ret.status !== "REQUESTED") return { error: "badState" };

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "REJECTED", resolution: text },
  });
  const ar = ret.buyer.locale === "ar";
  await prisma.notification.create({
    data: {
      userId: ret.buyerId,
      type: "RETURN",
      title: ar ? "رُفض طلب الإرجاع" : "Return rejected",
      body: text,
      data: { orderId: ret.subOrder.orderId, returnId },
    },
  });

  await bothPaths(ret.subOrder.orderId, ret.subOrderId)();
  return { ok: true };
}

// Buyer enters ship-back tracking → moves the return to IN_TRANSIT.
export async function addReturnTracking(
  returnId: string,
  tracking: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const text = (tracking ?? "").trim();
  if (text.length < 3) return { error: "trackingRequired" };

  const ret = await prisma.returnRequest.findFirst({
    where: { id: returnId, buyerId: session.user.id },
    select: {
      id: true,
      status: true,
      evidence: true,
      subOrderId: true,
      subOrder: {
        select: {
          orderId: true,
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
  if (!ret) return { error: "notFound" };
  if (ret.status !== "APPROVED") return { error: "badState" };

  const evidence = {
    ...((ret.evidence ?? {}) as Evidence),
    returnTracking: text,
  };
  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "IN_TRANSIT", evidence },
  });

  const seller = ret.subOrder.store.seller.user;
  await prisma.notification.create({
    data: {
      userId: seller.id,
      type: "RETURN",
      title: seller.locale === "ar" ? "تم شحن الإرجاع" : "Return shipped back",
      body:
        seller.locale === "ar"
          ? `شحن المشتري الإرجاع — رقم التتبع ${text}.`
          : `The buyer shipped the return — tracking ${text}.`,
      data: { orderId: ret.subOrder.orderId, returnId },
    },
  });

  await bothPaths(ret.subOrder.orderId, ret.subOrderId)();
  return { ok: true };
}

// Seller confirms the return was received back → issues the refund (and
// optionally restores stock). Works for refund-only (from APPROVED) and
// return-and-refund (from IN_TRANSIT).
export async function confirmReturnReceived(
  returnId: string,
  restoreStock = true,
): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };

  const ret = await prisma.returnRequest.findFirst({
    where: { id: returnId, subOrder: { storeId: gate.storeId } },
    select: {
      id: true,
      status: true,
      reason: true,
      subOrderId: true,
      subOrder: {
        select: {
          orderId: true,
          items: { select: { variantId: true, quantity: true } },
        },
      },
    },
  });
  if (!ret) return { error: "notFound" };
  if (ret.status !== "APPROVED" && ret.status !== "IN_TRANSIT") {
    return { error: "badState" };
  }

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "RECEIVED" },
  });

  const refund = await applyRefund(ret.subOrderId, {
    reason: `Return: ${ret.reason}`,
    actor: "seller",
    processedBy: gate.userId,
  });
  if (refund.error) return { error: refund.error };

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "REFUNDED", refundId: refund.refundId ?? null },
  });

  if (restoreStock) {
    for (const it of ret.subOrder.items) {
      await prisma.productVariant.updateMany({
        where: { id: it.variantId },
        data: { stock: { increment: it.quantity } },
      });
    }
  }

  await bothPaths(ret.subOrder.orderId, ret.subOrderId)();
  return { ok: true };
}

// Either party escalates an unresolved return to Hezalli → opens a Dispute.
export async function escalateReturn(returnId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const ret = await prisma.returnRequest.findFirst({
    where: {
      id: returnId,
      OR: [
        { buyerId: userId },
        { subOrder: { store: { seller: { userId } } } },
      ],
    },
    select: {
      id: true,
      status: true,
      buyerId: true,
      subOrderId: true,
      dispute: { select: { id: true } },
      subOrder: {
        select: {
          orderId: true,
          store: {
            select: { seller: { select: { userId: true } } },
          },
        },
      },
    },
  });
  if (!ret) return { error: "notFound" };
  if (ret.dispute) return { error: "alreadyEscalated" };
  if (ret.status === "REFUNDED") return { error: "badState" };

  await prisma.dispute.create({
    data: { returnId: ret.id, status: "OPEN", openedBy: userId },
  });

  // Notify the other party + all admins.
  const sellerUserId = ret.subOrder.store.seller.userId;
  const otherParty = userId === ret.buyerId ? sellerUserId : ret.buyerId;
  const admins = await prisma.user.findMany({
    where: { roles: { has: "ADMIN" }, isSuspended: false },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: [
      {
        userId: otherParty,
        type: "DISPUTE" as const,
        title: "Return escalated to Hezalli",
        body: "A return was escalated to Hezalli for review.",
        data: { orderId: ret.subOrder.orderId, returnId },
      },
      ...admins.map((a) => ({
        userId: a.id,
        type: "DISPUTE" as const,
        title: "New dispute",
        body: "A return was escalated and needs arbitration.",
        data: { orderId: ret.subOrder.orderId, returnId },
      })),
    ],
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/disputes`);
  await bothPaths(ret.subOrder.orderId, ret.subOrderId)();
  return { ok: true };
}

// Auto-approve returns the seller hasn't acted on within the response window.
// Runs lazily on the returns pages and via cron. Test with X=0.
export async function autoApproveReturns(): Promise<number> {
  const days = await settingDays("return_response_days", 2);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const stale = await prisma.returnRequest.findMany({
    where: { status: "REQUESTED", createdAt: { lte: cutoff } },
    select: {
      id: true,
      buyerId: true,
      subOrder: {
        select: {
          orderId: true,
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
    take: 200,
  });
  if (stale.length === 0) return 0;

  for (const r of stale) {
    await prisma.returnRequest.update({
      where: { id: r.id },
      data: {
        status: "APPROVED",
        resolution: "Auto-approved (seller timeout)",
      },
    });
    await prisma.notification.createMany({
      data: [
        {
          userId: r.buyerId,
          type: "RETURN" as const,
          title: "Return auto-approved",
          body: "The seller didn't respond in time, so your return was approved.",
          data: { orderId: r.subOrder.orderId, returnId: r.id },
        },
        {
          userId: r.subOrder.store.seller.user.id,
          type: "RETURN" as const,
          title: "Return auto-approved",
          body: "A return was auto-approved because it wasn't actioned in time.",
          data: { orderId: r.subOrder.orderId, returnId: r.id },
        },
      ],
    });
  }
  return stale.length;
}
